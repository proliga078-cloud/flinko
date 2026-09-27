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

Até 27/09/2026 todas as funções desta pasta coincidiam com a produção (`send-notifications`
v11 e `public-assistant` v6 publicadas a 19/09/2026):

- **`send-notifications`**: marca e domínio Flinko. O `?diag=1` só funciona
  quando `PROLIGA_HOOK_SECRET` está definido.
- **`public-assistant`**: limite de 20 pedidos por hora por IP (em memória, por
  instância; não substitui um limite persistente).

## Por publicar (27/09/2026)

Estas alterações estão no repositório mas **ainda não foram publicadas** no
Supabase. Para ficarem ativas: aplicar a migração
`20260927100000_limite_uso_ia.sql` e depois publicar as funções.

- **`ai-assistant`** e **`ai-profile-builder`**: limite diário por conta (40 e
  30 pedidos), contado na base de dados pela função `ai_consume()`. Sem a
  migração aplicada, as funções continuam a responder (sem limite) e deixam o
  erro em log.
- **`send-notifications`**: botões dos emails na cor da marca (laranja), como
  os emails enviados pelas funções Netlify.

## Problemas conhecidos

- **`public-assistant`** só tem o limite por IP em memória (por instância).
- **`send-notifications` fica aberta se `PROLIGA_HOOK_SECRET` não estiver
  definido** (o trigger da BD não envia esse cabeçalho). Só processa a fila.
