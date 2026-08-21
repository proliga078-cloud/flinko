// Substitui um pacote de node_modules (ex: "stripe", "@supabase/supabase-js")
// por um valor falso, ANTES de a função Netlify em teste ser exigida (require).
//
// Porque não usamos node:test's `mock.module`: tanto o "stripe" como o
// "@supabase/supabase-js" declaram no seu package.json um mapa de `exports`
// com condições "import" e "require" diferentes (dual package hazard).
// `mock.module` regista a substituição num caminho resolvido que, para
// estes dois pacotes, não coincide com o caminho que o require() normal
// (CommonJS) da função Netlify realmente carrega — por isso o mock nunca
// era acionado e o teste acabava a chamar a API real. Injetar diretamente
// em require.cache (a técnica clássica de mocking em Node/CommonJS) resolve
// exatamente pelo mesmo algoritmo que o require() real usa, por isso é
// garantido que apanha o mesmo ficheiro.
const path = require('path');

function stubModule(specifier, exportsValue, fromFile) {
  const resolved = require.resolve(specifier, { paths: [path.dirname(fromFile)] });
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsValue,
    children: [],
    paths: [],
  };
  return resolved;
}

module.exports = { stubModule };
