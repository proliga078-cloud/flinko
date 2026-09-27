# Flinko

Marketplace português que liga clientes a profissionais de serviços
(eletricistas, canalizadores, pintores, limpeza, mudanças, design,
programação, beleza e mais). Os clientes publicam pedidos e comparam
propostas; os profissionais têm perfil público, agenda, orçamentos e
gestão de trabalhos.

Produção: <https://flinko.pt>

## Stack

| Camada | Tecnologia |
| --- | --- |
| Frontend | HTML/CSS/JS estático (sem framework nem bundler), PWA (`manifest.json` + `sw.js`) |
| Backend de dados | [Supabase](https://supabase.com): Postgres com RLS, Auth, Storage (bucket `proliga-media`), Realtime |
| Funções servidor | Netlify Functions (`netlify/functions/`), Node 22, e Edge Functions do Supabase (`supabase/functions/`, Deno) |
| Pagamentos | Stripe (subscrições Starter/Pro, portal de faturação, reembolsos no admin) |
| Email / push | Resend (email) e Web Push (VAPID) |
| Testes | `node:test` (funções) e Playwright (browser) |

> O bucket do Storage mantém o nome antigo `proliga-media` (o projeto chamava-se
> Proliga). Não o renomeies sem migrar os ficheiros e as políticas.

## Estrutura

```
*.html                 páginas do site (index, dashboard, profile, admin, pricing, ...)
assets/                JS/CSS partilhados (dashboard-*.js, escape-html.js, billing.js, ...)
templates/             template das páginas de categoria
scripts/               build-categories.js (gera as 16 páginas de categoria) e check-syntax.js
netlify/functions/     checkout, webhook Stripe, admin, notificações, digest, sitemaps, páginas locais
supabase/migrations/   histórico do esquema da base de dados (fonte de verdade)
supabase/functions/    edge functions do Supabase (IA, notificações, pagamento do construtor de perfil)
schema.sql             visão geral do esquema (para leitura; as migrações é que mandam)
tests/                 functions/ (unitários) e e2e/ (Playwright)
```

### Páginas locais (SEO)

`/eletricistas/braga`, `/pintores/porto`, ... são geradas a pedido por
`netlify/functions/local-page.js` com os profissionais reais dessa categoria e
zona (regra `/:cat/:city` no `netlify.toml`). Só são indexáveis quando há pelo
menos 1 profissional; sem ninguém abrem com `noindex`. O sitemap
`/sitemap-local.xml` (`sitemap-local.js`) lista só as combinações com
profissionais. Não precisa de manutenção: cresce com a base de dados.

### Cabeçalho único e estilos partilhados

O menu do site público vive só em `scripts/site-header.js`. O
`npm run build` copia-o para dentro das marcas `<!-- fk:header -->` de cada
página (e `<!-- fk:head -->` para o CSS/JS); as páginas locais usam-no
diretamente. Estilos em `assets/site.css` (cores da marca como variáveis
`--fk-*`), comportamento em `assets/site-header.js`. **Não edites o menu dentro
das páginas**: o próximo build sobrescreve-o e o CI falha.

### Páginas de categoria são geradas

`eletricistas.html`, `canalizadores.html`, etc. **não se editam à mão**: são
geradas por `npm run build:categories` a partir de
`templates/categoria.template.html` + `scripts/categories-data.json`. O Netlify
corre este passo em cada deploy, e o CI falha se as páginas commitadas estiverem
desatualizadas.

## Desenvolvimento

```bash
npm ci                   # dependências
npm run build            # cabeçalho único + páginas de categoria
npm run check            # sintaxe de todo o JS (inclui scripts inline dos .html)
npm run test:unit        # testes das Netlify Functions
npx playwright install chromium && npm run test:e2e
npm test                 # tudo
```

Para ver o site localmente: `node tests/e2e/static-server.js` (serve a raiz do
repositório). Para as funções Netlify a sério, usa `netlify dev`.

## Variáveis de ambiente (Netlify)

| Variável | Para quê |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Todas as functions (a chave de serviço **nunca** vai para o browser) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Pagamentos e webhook |
| `STRIPE_PRICE_STARTER_MONTHLY/YEARLY`, `STRIPE_PRICE_PRO_MONTHLY/YEARLY` | Preços vendidos; o webhook também os usa para saber o plano de uma subscrição |
| `RESEND_API_KEY`, `RESEND_FROM` | Emails de novas mensagens/pedidos |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Notificações push (`VAPID_SUBJECT` = `mailto:` de contacto) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_TPL_PEDIDO`, `TWILIO_TPL_MENSAGEM` | Alertas no WhatsApp para profissionais (opcional; sem elas fica desligado). Os `TWILIO_TPL_*` são os ContentSid (HX…) dos modelos aprovados pela Meta — ver `netlify/functions/_whatsapp.js` |
| `URL` | Definida pelo próprio Netlify |

## Segurança — regras do projeto

- **Nunca** meter dados vindos da base de dados em `innerHTML` sem `escapeHtml()`
  (`assets/escape-html.js`). Para `href`/`src` usar `safeUrl()`; para texto de
  pesquisa dentro de `.or(...)` do PostgREST usar `orSafe()`.
- Quem é admin é decidido pelo servidor (`is_admin()` / coluna `is_admin`), nunca
  por um email escrito no código.
- Colunas sensíveis de `profiles` (plano, ids Stripe, `is_admin`, ...) só as
  altera o `service_role` (functions) — ver os triggers `protect_*` nas migrações.
- As functions que enviam email ou mexem em dinheiro validam sempre a sessão
  (`auth.getUser(token)`) e nunca confiam em ids/emails vindos do corpo do pedido.
- Cabeçalhos de segurança em `netlify.toml`. A CSP está em modo *Report-Only*;
  ver o comentário lá para a passar a modo ativo.

## Base de dados

Novas alterações de esquema entram como ficheiros novos em
`supabase/migrations/` (nunca editar migrações já aplicadas). Ver
`supabase/migrations/README.md`.
