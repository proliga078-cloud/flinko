# Edge Functions (Supabase)

Estas 6 funções correm **no Supabase** (Deno), não no Netlify. Até 19/09/2026
existiam só dentro do projeto Supabase e nunca tinham sido versionadas: o código
desta pasta foi copiado tal e qual da produção nessa data.

| Função | JWT | O que faz | Variáveis / segredos |
| --- | --- | --- | --- |
| `send-notifications` | não (chamada por um trigger da BD) | Envia por email e push as notificações da fila `notification_queue` (mensagens novas e pedidos de verificação) | `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PROLIGA_FROM_EMAIL`, `PROLIGA_HOOK_SECRET` (opcional) |
| `ai-assistant` | sim | Assistente de IA do dashboard do profissional (responde e sugere alterações ao perfil) | `ANTHROPIC_API_KEY` |
| `public-assistant` | sim (chave anon) | Assistente de IA público do site, que recomenda profissionais | `ANTHROPIC_API_KEY` |
| `ai-profile-builder` | sim | Construtor de perfil com IA (funcionalidade paga, 2,99 EUR) | `ANTHROPIC_API_KEY` |
| `create-ai-builder-checkout` | sim | Cria a sessão de pagamento Stripe do construtor de perfil | `STRIPE_SECRET_KEY` |
| `stripe-webhook-ai-builder` | não (assinatura Stripe) | Desbloqueia o construtor de perfil depois do pagamento | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |

Os segredos vivem em *Project Settings → Edge Functions → Secrets* no Supabase;
**nunca** os escrevas nestes ficheiros.

## Publicar uma alteração

Com o [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase functions deploy <nome-da-funcao> --project-ref cdwinidhtfxfxowflize
```

A configuração `verify_jwt` de cada função (coluna JWT acima) tem de se manter:
`send-notifications` e `stripe-webhook-ai-builder` são chamadas sem sessão de
utilizador, por isso usam `--no-verify-jwt`.

## Estado

Todas as funções desta pasta coincidem com a produção (publicadas a 27/09/2026:
`ai-assistant` v11, `ai-profile-builder` v7, `send-notifications` v12;
`public-assistant` v6 de 19/09/2026):

- **`ai-assistant`** e **`ai-profile-builder`**: limite diário por conta (40 e
  30 pedidos), contado na base de dados por `ai_consume()` (migração
  `20260927011414_limite_uso_ia.sql`).
- **`send-notifications`**: marca e domínio Flinko, botões na cor da marca. O
  `?diag=1` só funciona quando `PROLIGA_HOOK_SECRET` está definido.
- **`public-assistant`**: limite de 20 pedidos por hora por IP (em memória, por
  instância; não substitui um limite persistente).

## Problemas conhecidos

- **`public-assistant`** só tem o limite por IP em memória (por instância).
- **`send-notifications` fica aberta se `PROLIGA_HOOK_SECRET` não estiver
  definido** (o trigger da BD não envia esse cabeçalho). Só processa a fila.
