import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { question, history } = await req.json();
    if (!question || typeof question !== "string") {
      return new Response(JSON.stringify({ error: "invalid_question" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "not_configured" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Contexto leve: categorias e localizacoes disponiveis, para a IA poder orientar/recomendar
    // sem expor dados privados (nunca telefone, email, ids internos de outras tabelas).
    const { data: pros } = await supabase
      .from("profiles")
      .select("name,slug,category,location,plan,experience_years")
      .eq("account_type", "professional")
      .eq("approved", true)
      .eq("suspended", false)
      .eq("is_demo", false)
      .limit(200);

    const proList = (pros || []).filter((p: any) => p.slug);
    const categories = [...new Set(proList.map((p: any) => p.category).filter(Boolean))];
    const locations = [...new Set(proList.map((p: any) => p.location).filter(Boolean))];

    // IMPORTANTE: o perfil publico de um profissional vive em https://flinko.pt/<slug>
    // (nao em /perfil.html?slug=...). Confirmado a ver o site ao vivo.
    const context = `
Categorias de profissionais atualmente na Flinko: ${categories.join(", ") || "n/d"}.
Localizações com profissionais: ${locations.join(", ") || "n/d"}.
Exemplos de profissionais disponíveis (nome, categoria, localização, link do perfil): ${proList.slice(0, 30).map((p: any) => `${p.name} — ${p.category || "n/d"} — ${p.location || "n/d"} — https://flinko.pt/${p.slug}`).join(" | ") || "nenhum"}.
`.trim();

    const systemPrompt = `És o assistente de IA público do site da Flinko (flinko.pt), uma plataforma portuguesa que liga profissionais de serviços (eletricistas, canalizadores, pintores, etc.) a clientes em Portugal. Falas sempre em português de Portugal, de forma direta, simpática e útil.

És livre para responder a QUALQUER pergunta que a pessoa faça, mesmo fora do tema da Flinko — não te limites a um único assunto. Quando fizer sentido, ajuda a pessoa a encontrar um profissional adequado na Flinko usando o contexto abaixo, e sugere o link do perfil quando existir um bom candidato (o link é sempre https://flinko.pt/ seguido do nome de utilizador do profissional, exatamente como aparece no contexto). Se não houver profissionais na categoria/zona pedida, di-lo com sinceridade em vez de inventar.

Nunca inventes dados de contacto (telefone, email) de profissionais — usa sempre o link do perfil ou sugere usar o chat da plataforma. Não reveles dados privados nem faturasção de ninguém.

Sê conciso — no máximo 4-5 frases, a não ser que a pergunta peça uma lista. Não uses markdown pesado.

Contexto atual da plataforma:
${context}`;

    const msgs = Array.isArray(history)
      ? history.slice(-8).filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").map((m: any) => ({ role: m.role, content: m.content.slice(0, 2000) }))
      : [];
    msgs.push({ role: "user", content: String(question).slice(0, 2000) });

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: systemPrompt,
        messages: msgs,
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic API error:", anthropicRes.status, errText);
      return new Response(JSON.stringify({ error: "ai_error" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await anthropicRes.json();
    const answer = result?.content?.[0]?.text || "Não consegui gerar uma resposta.";

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("public-assistant error:", e);
    return new Response(JSON.stringify({ error: "server_error" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
