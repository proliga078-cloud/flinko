import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17.4.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE = "https://flinko.pt";
const PRICE_CENTS = 299; // 2,99 EUR

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authedClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await authedClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // stripe_customer_id nao e exposto por grant a authenticated/anon (de proposito),
    // por isso usamos a service role para ler o perfil aqui.
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const { data: profile, error: profileErr } = await db
      .from("profiles")
      .select("id,name,stripe_customer_id,ai_profile_builder_unlocked")
      .eq("user_id", user.id)
      .single();

    if (profileErr || !profile) {
      console.error("create-ai-builder-checkout: profile lookup failed", profileErr?.message);
      return new Response(JSON.stringify({ error: "no_profile" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (profile.ai_profile_builder_unlocked) {
      return new Response(JSON.stringify({ already_unlocked: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: "stripe_not_configured" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: PRICE_CENTS,
            product_data: {
              name: "Construtor de perfil com IA - Flinko",
              description: "Acesso ilimitado ao assistente de IA que cria e melhora o teu perfil profissional na Flinko.",
            },
          },
          quantity: 1,
        },
      ],
      client_reference_id: profile.id,
      metadata: { profile_id: profile.id, product: "ai_profile_builder" },
      success_url: `${SITE}/dashboard.html?ai_builder=success`,
      cancel_url: `${SITE}/dashboard.html?ai_builder=cancelled`,
    };

    if (profile.stripe_customer_id) {
      sessionParams.customer = profile.stripe_customer_id;
    } else if (user.email) {
      sessionParams.customer_email = user.email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("create-ai-builder-checkout error:", e);
    return new Response(JSON.stringify({ error: "server_error" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
