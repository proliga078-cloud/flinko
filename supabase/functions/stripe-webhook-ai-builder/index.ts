import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17.4.0";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

const stripe = new Stripe(stripeKey, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const signature = req.headers.get("Stripe-Signature");
  const body = await req.text();

  if (!signature || !webhookSecret) {
    console.error("stripe-webhook-ai-builder: missing signature or webhook secret");
    return new Response("webhook not configured", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret, undefined, cryptoProvider);
  } catch (err) {
    console.error("stripe-webhook-ai-builder signature error:", (err as Error).message);
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 });
  }

  try {
    // Pagamentos que demoram (Multibanco, SEPA) chegam como completed com
    // payment_status "unpaid" e so depois como async_payment_succeeded.
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.product !== "ai_profile_builder" || session.payment_status !== "paid") {
        // Nao e um pagamento deste produto (pode ser subscricao de plano, etc.) ou ainda nao foi pago - ignora
        return new Response(JSON.stringify({ received: true, ignored: true }), { headers: { "Content-Type": "application/json" } });
      }

      const profileId = session.metadata?.profile_id || session.client_reference_id;
      if (!profileId) {
        console.error("stripe-webhook-ai-builder: no profile_id in session", session.id);
        return new Response(JSON.stringify({ received: true, error: "no_profile_id" }), { headers: { "Content-Type": "application/json" } });
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const db = createClient(supabaseUrl, serviceKey);

      const { error } = await db
        .from("profiles")
        .update({ ai_profile_builder_unlocked: true, ai_profile_builder_paid_at: new Date().toISOString() })
        .eq("id", profileId);

      if (error) {
        console.error("stripe-webhook-ai-builder update error:", error.message);
        return new Response(JSON.stringify({ received: true, error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }

      console.log(`AI profile builder unlocked for profile ${profileId} (session ${session.id})`);
    }

    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("stripe-webhook-ai-builder error:", e);
    return new Response(JSON.stringify({ error: "server_error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
