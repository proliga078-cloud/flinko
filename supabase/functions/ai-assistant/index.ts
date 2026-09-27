import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUGGESTABLE_FIELDS = ["bio", "category", "experience_years", "specialties", "languages", "certifications", "has_insurance", "services", "social_links", "intro_video_url", "awards", "promotions"];

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

    const { question, history } = await req.json();
    if (!question || typeof question !== "string") {
      return new Response(JSON.stringify({ error: "invalid_question" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limite diário por conta (ver a migração limite_uso_ia): sem isto, uma
    // conta podia chamar a função em ciclo e gastar créditos da Anthropic.
    // Se a função da base de dados não existir, segue (e fica em log) para
    // não partir o assistente.
    const { data: dentroDoLimite, error: quotaErr } = await supabase.rpc("ai_consume", { p_fn: "ai-assistant", p_limit: 40 });
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

    const { data: profile } = await supabase
      .from("profiles")
      .select("id,name,category,location,plan,bio,photo_url,experience_years,specialties,languages,certifications,has_insurance,ai_profile_builder_unlocked,social_links,intro_video_url,awards,promotions")
      .eq("user_id", user.id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: "no_profile" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: jobs }, { data: servicesRows }, { data: reviews }] = await Promise.all([
      supabase.from("jobs").select("title,status,quote_amount,paid_amount,scheduled_at,completed_at,paid_at,created_at").eq("professional_id", profile.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("services").select("name,price_from,price_to,price_unit").eq("professional_id", profile.id),
      supabase.from("reviews").select("rating").eq("professional_id", profile.id),
    ]);

    const jobList = jobs || [];
    const servicesList = servicesRows || [];
    const statusCounts: Record<string, number> = {};
    jobList.forEach((j: any) => { statusCounts[j.status] = (statusCounts[j.status] || 0) + 1; });
    const paidJobs = jobList.filter((j: any) => j.status === "pago" && j.paid_amount);
    const totalPaid = paidJobs.reduce((s: number, j: any) => s + Number(j.paid_amount || 0), 0);
    const avgRating = reviews && reviews.length
      ? (reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length).toFixed(1)
      : null;

    const socialLinks = profile.social_links && typeof profile.social_links === "object" ? profile.social_links : {};
    const socialSummary = Object.entries(socialLinks).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(", ") || "nenhuma";
    const awardsList = Array.isArray(profile.awards) ? profile.awards : [];
    const promotionsList = Array.isArray(profile.promotions) ? profile.promotions : [];

    const summary = `
Perfil: ${profile.name}, categoria ${profile.category || "n/d"}, localização ${profile.location || "n/d"}, plano ${profile.plan || "free"}.
Bio preenchida: ${profile.bio ? "sim (\"" + profile.bio + "\")" : "não"}. Foto de perfil: ${profile.photo_url ? "sim" : "não"}.
Anos de experiência: ${profile.experience_years ?? "n/d"}. Especialidades: ${(profile.specialties || []).join(", ") || "nenhuma"}. Idiomas: ${(profile.languages || []).join(", ") || "n/d"}. Certificações: ${(profile.certifications || []).join(", ") || "nenhuma"}. Tem seguro: ${profile.has_insurance ? "sim" : "não/não indicado"}.
Serviços publicados (${servicesList.length}): ${servicesList.map((s: any) => `${s.name} (${s.price_from ?? "?"}-${s.price_to ?? "?"} ${s.price_unit ?? ""})`).join(" | ") || "nenhum"}.
Redes sociais: ${socialSummary}. Vídeo de apresentação: ${profile.intro_video_url ? "sim (" + profile.intro_video_url + ")" : "não"}.
Prémios/distinções (${awardsList.length}): ${awardsList.map((a: any) => `${a.title || ""}${a.issuer ? " - " + a.issuer : ""}${a.year ? " (" + a.year + ")" : ""}`).join(" | ") || "nenhum"}.
Promoções ativas (${promotionsList.length}): ${promotionsList.map((p: any) => `${p.title || ""}${p.valid_until ? " até " + p.valid_until : ""}`).join(" | ") || "nenhuma"}.
Avaliação média: ${avgRating ?? "sem avaliações"} (${reviews?.length || 0} avaliações).
Trabalhos por estado: ${Object.entries(statusCounts).map(([k, v]) => `${k}=${v}`).join(", ") || "nenhum"}.
Total faturado (trabalhos pagos, histórico recente): €${totalPaid.toFixed(0)}.
Trabalhos recentes (até 50, mais recentes primeiro): ${jobList.slice(0, 15).map((j: any) => `"${j.title}" (${j.status}${j.scheduled_at ? ", agendado " + String(j.scheduled_at).slice(0, 10) : ""}${j.paid_amount ? ", €" + j.paid_amount : ""})`).join(" | ") || "nenhum"}.
`.trim();

    const systemPrompt = `És o assistente de IA do painel Flinko, uma plataforma portuguesa que liga profissionais de serviços a clientes. Falas sempre em português de Portugal, de forma direta, prática e simpática.

És livre para responder a QUALQUER pergunta do profissional, mesmo fora do contexto da Flinko (dúvidas gerais, da profissão dele, o que for). Quando a pergunta for sobre o negócio dele na Flinko (trabalhos, agenda, faturação, perfil), usa os dados fornecidos abaixo e não inventes números; se não tiveres dados suficientes, diz isso claramente.

Se o profissional pedir ajuda para melhorar ou escrever uma parte do perfil dele (bio, categoria, anos de experiência, especialidades, idiomas, certificações, seguro, um serviço novo, redes sociais, vídeo de apresentação, prémios/certificações ou promoções), gera um texto/valor concreto e pronto a usar, e devolve-o também no campo "suggestion" (além de comentares na tua resposta de texto). Nunca dizes que já guardaste nada — quem decide guardar é sempre o profissional, através de um botão de confirmação na interface. Campos suportados em suggestion.field: ${SUGGESTABLE_FIELDS.join(", ")}.

Formato de suggestion.value consoante o campo:
- services: array de objetos {name, price_from, price_to, price_unit}.
- specialties, languages, certifications: array de strings.
- social_links: objeto com as chaves que fizerem sentido de entre instagram, facebook, whatsapp, tiktok, youtube, linkedin (cada uma um link ou @utilizador, só incluis as que o profissional der).
- intro_video_url: uma string com o link do YouTube ou Vimeo.
- awards: array de objetos {title, issuer, year} — nunca inventes prémios que o profissional não mencionou.
- promotions: array de objetos {title, description, valid_until} (valid_until no formato AAAA-MM-DD, opcional) — nunca inventes descontos ou datas que o profissional não deu.
- restantes campos: string ou número.

Sê conciso — no máximo 4-5 frases de texto corrido, a não ser que a pergunta peça uma lista. Não uses markdown pesado (sem títulos, pouco ou nenhum bold).

Responde SEMPRE em JSON válido puro, sem blocos de código markdown (nunca uses \`\`\`), com este formato exato e nada mais à volta:
{"answer": "a tua resposta em texto, para mostrar na conversa", "suggestion": null ou {"field": "...", "value": ...}}

Dados atuais do profissional:
${summary}`;

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
        max_tokens: 800,
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
        if (parsed.suggestion && SUGGESTABLE_FIELDS.includes(parsed.suggestion.field)) {
          suggestion = parsed.suggestion;
        }
      }
    } catch (_e) {
      // Modelo não devolveu JSON puro; usamos o texto como veio.
    }

    return new Response(JSON.stringify({ answer, suggestion }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-assistant error:", e);
    return new Response(JSON.stringify({ error: "server_error" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
