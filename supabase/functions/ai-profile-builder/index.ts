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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { message, history } = await req.json();
    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "invalid_message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id,name,category,location,bio,experience_years,specialties,languages,certifications,has_insurance,ai_profile_builder_unlocked,social_links,intro_video_url,awards,promotions")
      .eq("user_id", user.id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: "no_profile" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!profile.ai_profile_builder_unlocked) {
      return new Response(JSON.stringify({ error: "payment_required", checkout_needed: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limite diário por conta (ver a migração limite_uso_ia): sem isto, uma
    // conta podia chamar a função em ciclo e gastar créditos da Anthropic.
    // Se a função da base de dados não existir, segue (e fica em log) para
    // não partir o assistente.
    const { data: dentroDoLimite, error: quotaErr } = await supabase.rpc("ai_consume", { p_fn: "ai-profile-builder", p_limit: 30 });
    if (quotaErr) console.error("ai_consume:", quotaErr.message);
    if (dentroDoLimite === false) {
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 200,
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

    const { data: servicesRows } = await supabase.from("services").select("name,price_from,price_to,price_unit").eq("professional_id", profile.id);

    const socialLinks = profile.social_links && typeof profile.social_links === "object" ? profile.social_links : {};
    const socialSummary = Object.entries(socialLinks).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(", ") || "nenhuma";
    const awardsList = Array.isArray(profile.awards) ? profile.awards : [];
    const promotionsList = Array.isArray(profile.promotions) ? profile.promotions : [];

    const currentState = `
Estado atual do perfil:
Nome: ${profile.name}. Categoria: ${profile.category || "n/d"}. Localização: ${profile.location || "n/d"}.
Bio: ${profile.bio || "(vazia)"}.
Anos de experiência: ${profile.experience_years ?? "n/d"}. Especialidades: ${(profile.specialties || []).join(", ") || "nenhuma"}. Idiomas: ${(profile.languages || []).join(", ") || "n/d"}. Certificações: ${(profile.certifications || []).join(", ") || "nenhuma"}. Seguro: ${profile.has_insurance ? "sim" : "n/d"}.
Serviços atuais: ${(servicesRows || []).map((s: any) => s.name).join(", ") || "nenhum"}.
Redes sociais: ${socialSummary}. Vídeo de apresentação: ${profile.intro_video_url ? "sim" : "não"}.
Prémios/distinções: ${awardsList.map((a: any) => `${a.title || ""}${a.year ? " (" + a.year + ")" : ""}`).join(", ") || "nenhum"}.
Promoções ativas: ${promotionsList.map((p: any) => p.title || "").join(", ") || "nenhuma"}.
`.trim();

    const systemPrompt = `És o Construtor de Perfil com IA da Flinko, uma funcionalidade paga que os profissionais desbloqueiam para teres uma conversa guiada com eles e no final escreveres um perfil completo e profissional.

Conduz uma pequena entrevista em português de Portugal: pergunta pelo essencial que ainda falta (profissão/categoria, anos de experiência, zona de trabalho, especialidades, certificações ou seguro, principais serviços e preços aproximados, o que os distingue). Também podes perguntar, quando fizer sentido e sem forçar, se querem adicionar redes sociais, um vídeo de apresentação, prémios/distinções ou uma promoção atual — mas nunca inventes nenhum destes se o profissional não os mencionar. Não precisas de perguntar tudo de uma vez nem tudo o que já está preenchido - vê o estado atual abaixo. Faz UMA ou DUAS perguntas de cada vez, de forma natural e simpática, até teres o suficiente para escrever um perfil forte.

Quando já tiveres informação suficiente (ou o profissional disser que quer ver o resultado já), gera a proposta completa e devolve-a no campo "suggestion.fields", com os campos que fizerem sentido: bio (texto profissional, 3-5 frases, primeira pessoa), category, experience_years (número), specialties (array de strings), languages (array), certifications (array), has_insurance (boolean), services (array de {name, price_from, price_to, price_unit}), social_links (objeto com as chaves de entre instagram, facebook, whatsapp, tiktok, youtube, linkedin que o profissional deu), intro_video_url (string, link do YouTube ou Vimeo), awards (array de {title, issuer, year}), promotions (array de {title, description, valid_until em AAAA-MM-DD}). Só inclui um campo se tiveres informação real para ele - nunca inventes anos de experiência, certificações, preços, prémios ou promoções que a pessoa não disse.

O profissional confirma sempre antes de qualquer coisa ser guardada - nunca dizes que já guardaste.

Responde SEMPRE em JSON válido puro, sem blocos de código markdown (nunca uses \`\`\`), exatamente neste formato e nada mais à volta:
{"answer": "a tua pergunta ou comentário, para mostrar na conversa", "suggestion": null ou {"fields": {...}}}

${currentState}`;

    const msgs = Array.isArray(history)
      ? history.slice(-12).filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").map((m: any) => ({ role: m.role, content: m.content.slice(0, 2000) }))
      : [];
    msgs.push({ role: "user", content: String(message).slice(0, 2000) });

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1200,
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
    const raw = result?.content?.[0]?.text || "";

    let answer = raw;
    let suggestion: any = null;
    try {
      let jsonText = raw.trim();
      const fenceMatch = jsonText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
      if (fenceMatch) jsonText = fenceMatch[1];
      const parsed = JSON.parse(jsonText);
      if (parsed && typeof parsed.answer === "string") {
        answer = parsed.answer;
        if (parsed.suggestion && parsed.suggestion.fields && typeof parsed.suggestion.fields === "object") {
          suggestion = parsed.suggestion;
        }
      }
    } catch (_e) {
      // resposta nao veio em JSON puro - usa o texto como veio
    }

    return new Response(JSON.stringify({ answer, suggestion }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-profile-builder error:", e);
    return new Response(JSON.stringify({ error: "server_error" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
