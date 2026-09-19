# Migrations — fonte de verdade real da base de dados

Esta pasta contém **todas as migrações da produção** (tabela
`supabase_migrations.schema_migrations`), extraídas em 21 de agosto de 2026 e
sincronizadas de novo a 19 de setembro de 2026 (foram acrescentadas as 13 que
se tinham aplicado diretamente no Supabase sem passar pelo repositório, e as
versões dos ficheiros foram alinhadas com as da produção). Total: 93 migrações
da produção + `20260919120000_plan_starter_limits.sql`, que foi executada à mão no
editor SQL e por isso não consta na tabela de migrações do Supabase (é
idempotente: `on conflict do nothing`).

`npm run check` valida o formato dos nomes e que não há versões repetidas.
As *edge functions* do Supabase estão em `supabase/functions/`.

Antes de hoje, estas migrações existiam *apenas* dentro do projeto Supabase
— nunca tinham sido versionadas em git. O `schema.sql` na raiz do repo era
uma tentativa manual de descrever a estrutura da BD, mas ficava sempre
desatualizado em relação à realidade (faltavam tabelas inteiras como
`credits`, `ad_slots`, `request_offers`, `plan_limits`, `reserved_slugs`,
o bucket `proliga-media`, e triggers como `protect_privileged_profile_columns`).

## Qual é a fonte de verdade agora

- **Esta pasta (`supabase/migrations/*.sql`)** é o histórico real,
  cronológico, de tudo o que já foi aplicado à base de dados de produção.
  Cada ficheiro é o SQL exato que foi executado, na ordem em que foi
  executado. Os nomes seguem `<version>_<nome>.sql`, onde `version` é o
  timestamp `YYYYMMDDHHmmss` usado pelo próprio Supabase.
- **`schema.sql`** (raiz do repo) continua a existir como um resumo legível
  para quem quiser perceber a estrutura rapidamente, mas é só isso — um
  resumo. Em caso de dúvida ou divergência, esta pasta é que manda.

## Workflow daqui para a frente

Qualquer alteração à base de dados de produção — nova tabela, nova coluna,
nova política RLS, nova function — deve ser feita como uma migração nova
nesta pasta, não só aplicada "ao vivo" via MCP/dashboard e esquecida:

1. Escreve o SQL da alteração num ficheiro novo aqui, com o nome
   `<timestamp>_<descricao_curta>.sql` (timestamp no mesmo formato dos
   ficheiros existentes, sempre maior que o último).
2. Aplica essa mesma migração à BD de produção (via `apply_migration` do
   Supabase MCP, ou `supabase db push` se estiveres a usar a CLI local).
3. Faz commit do ficheiro `.sql` no mesmo PR/commit que motivou a mudança.

Isto garante que o git e a base de dados nunca voltam a divergir como
aconteceu até agora.

## Migrações de 21 de agosto de 2026 (auditoria de segurança)

As duas últimas migrações desta lista foram as correções da auditoria de
segurança feita nesta data:

- `20260821214306_fix_messages_tamper_and_storage_insert_idor.sql` —
  impede alterar mensagens já enviadas (faltava `WITH CHECK` na política de
  UPDATE) e fecha um IDOR no upload de storage (faltava verificar a posse
  da pasta no INSERT, só existia no UPDATE/DELETE).
- `20260821214333_revoke_public_exec_protect_message_fields.sql` — remove
  a exposição automática via RPC pública de uma função que só devia correr
  como trigger interno.
