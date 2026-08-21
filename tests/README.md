# Testes automáticos — checkout e auth

Duas camadas, cada uma a testar uma coisa diferente:

## `tests/functions/` — testes unitários das funções Netlify

Testa `create-checkout-session.js`, `create-portal-session.js` e
`stripe-webhook.js` diretamente (sem servidor, sem rede), com o Stripe e o
Supabase substituídos por objetos falsos controláveis (ver
`tests/functions/helpers/`). O foco principal é regressão de segurança: os
dois primeiros ficheiros só foram corrigidos a 21 de agosto de 2026 (o
userId/customerId tinham de vir sempre da sessão validada, nunca do corpo
do pedido) — estes testes rebentam se essa lógica voltar a partir.

Corre com:

```
npm run test:unit
```

Usa `require.cache` para substituir os pacotes `stripe` e
`@supabase/supabase-js` (ver `helpers/stub-require.js`) em vez do
`mock.module` nativo do Node — o `mock.module` não funciona com estes dois
pacotes específicos porque ambos declaram um mapa de `exports` com
condições `import`/`require` diferentes (dual package hazard), e a
substituição do `mock.module` fica presa à condição errada.

## `tests/e2e/` — testes end-to-end (Playwright)

Carrega `auth.html` e `pricing.html` num browser real (Chromium) servidos
tal como estão no repositório, com o SDK do Supabase (carregado via CDN)
substituído por um duplo controlável (`tests/e2e/fixtures/fake-supabase-sdk.js`)
para não depender de rede real nem de contas verdadeiras. Cobre validação
de formulários, o fluxo de login/registo, e duas proteções de segurança já
existentes no código:

- proteção contra open-redirect no `?redirect=` do login;
- o botão de upgrade em `pricing.html` disparar sempre o checkout real do
  Stripe (via `assets/billing.js`), e não o modal antigo de pedir por email
  que ainda está no HTML mas ficou morto — ver o comentário no topo de
  `checkout.spec.js` para o porquê.

Corre com:

```
npm run test:e2e
```

(a primeira vez pode pedir `npx playwright install chromium` se os
browsers não estiverem instalados.)

## Correr tudo

```
npm test
```

Também corre automaticamente em cada push/PR — ver
`.github/workflows/tests.yml`.
