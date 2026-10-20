# Flinko — regras para o Claude

Marketplace português que liga clientes a profissionais (eletricistas,
canalizadores, pintores...). Site estático em HTML/JS servido pelo Netlify,
base de dados e autenticação no Supabase (projeto `cdwinidhtfxfxowflize`),
pagamentos na Stripe. Tudo em português de Portugal: textos do site, commits,
PRs e comentários no código.

## Como trabalhar

- **Ramos e PRs:** cada tarefa num ramo novo a partir do `main`, com PR em
  português. Sou eu (Claude) que faço o merge quando a verificação do GitHub
  fica verde, sem perguntar. Exceção: alterações de aspeto que o dono quer ver
  antes ficam em PR rascunho (com a pré-visualização do Netlify) até ele aprovar.
- **Teste que falha às vezes:** tem uma causa. Abre o trace (artefacto
  `playwright-test-results` da verificação) antes de repetir ou de subir timeouts.
- **Base de dados de produção:** só com autorização explícita do dono para cada
  alteração. Ler para perceber o estado real é permitido.
- **Ordem para publicar:** primeiro o site (merge, esperar o Netlify), depois a
  migração. O site novo tem de funcionar com a base de dados antiga.
- **Migrações:** a pasta `supabase/migrations` tem de bater com a produção.
  Depois de aplicar uma, renomeia o ficheiro para a versão que a produção
  registou (`supabase_migrations.schema_migrations`) e faz um PR só com isso.
- **Páginas geradas:** `eletricistas.html`, `pintores.html`, etc. saem de
  `templates/categoria.template.html` + `scripts/categories-data.json`, e o
  cabeçalho/rodapé de `scripts/site-header.js`. Edita as fontes e corre
  `npm run build`; nunca edites as páginas geradas à mão.
- **Testes antes de cada PR:** `npm run check`, `npm run test:unit`,
  `npm run test:db` e `npx playwright test`. Uma correção leva um teste que
  falha sem ela. Ver `tests/README.md`.
- **Biblioteca do Supabase:** versão fixa (`@supabase/supabase-js@2.117.3`) em
  todas as páginas e testes. Para mudar, muda em todos ao mesmo tempo.

## Segurança (antes de cada commit)

Adaptado de [ECC](https://github.com/affaan-m/ECC) `rules/common/security.md`.

- Nenhum segredo no código (chaves Stripe, service role, palavras-passe). A
  chave `sb_publishable_...` é pública e pode estar nas páginas.
- Tudo o que vem do utilizador entra na página com `escapeHtml`/`esc`; nunca
  `innerHTML` com texto de utilizador ou de IA sem escapar.
- As funções Netlify tiram o utilizador do token validado, nunca do corpo do
  pedido. As de admin usam `requireAdmin` (`netlify/functions/_admin.js`).
- Tabelas novas: RLS ligado e políticas explícitas. Colunas de `profiles` e
  `reviews` são legíveis só uma a uma (`grant select (coluna)`): uma coluna nova
  e pública precisa do seu grant; uma privada (emails, Stripe, créditos, admin)
  nunca o recebe e chega ao dono por `get_my_profile()`.
- Funções `security definer` com `set search_path` e verificação de
  `auth.uid()`; `revoke ... from anon` quando não são para visitantes.
- Colunas que o dono não pode mudar sozinho (plano, créditos, Stripe, selo de
  resposta, Construtor IA): `protect_privileged_profile_columns`.
- Mensagens de erro para o utilizador sem detalhes internos.

## Páginas: estados e design

Adaptado de ECC `skills/frontend-design-direction`.

- Cada lista ou bloco com dados tem estados pensados: a carregar, vazio (com
  uma ação útil, nunca "não há nada"), erro (com o que fazer a seguir) e
  parcial. Um estado vazio no topo de uma página tira confiança: esconde o bloco.
- Funciona a 375px de largura sem deslocar para o lado.
- **Direção de design** (página inicial nova, out/2026): "calorosa e local".
  Papel creme, terracota, títulos em Fraunces, texto em Inter, conteúdo real
  (perfis e pedidos verdadeiros) em vez de fotos de banco de imagens.
- **Evitar os tiques de site feito por IA:** etiquetas pequenas em maiúsculas
  por cima das secções; uma palavra do título destacada com fundo colorido;
  pastilhas por cima do título; faixas de "4 vantagens" com ícone; grelhas de
  cartões todos iguais com ícones em quadrados pastel; animações a aparecer ao
  fazer scroll; emojis como ícones; passos "01 / 02 / 03"; frases feitas ("de
  confiança", "sem compromisso", "o especialista certo"); travessões em vez de
  frases curtas.
- Texto com voz própria, concreto e no "tu" de Portugal.
