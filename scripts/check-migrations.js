// Verifica a pasta supabase/migrations: nomes no formato do Supabase
// (<versão de 14 dígitos>_<nome_em_snake_case>.sql), versões únicas e ficheiros
// não vazios. Uma versão repetida ou um nome mal formado faz o `supabase db push`
// falhar ou aplicar as migrações fora de ordem.
//
// Uso: node scripts/check-migrations.js
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const FORMATO = /^(\d{14})_([a-z0-9_]+)\.sql$/;

const erros = [];
const versoes = new Map();
const ficheiros = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

for (const f of ficheiros) {
  const m = FORMATO.exec(f);
  if (!m) {
    erros.push(`Nome inválido: ${f} (esperado <14 dígitos>_<nome_snake_case>.sql)`);
    continue;
  }
  if (versoes.has(m[1])) erros.push(`Versão repetida ${m[1]}: ${versoes.get(m[1])} e ${f}`);
  versoes.set(m[1], f);
  if (!fs.readFileSync(path.join(DIR, f), 'utf8').trim()) erros.push(`Ficheiro vazio: ${f}`);
}

if (erros.length) {
  console.error(erros.join('\n'));
  console.error(`\n${erros.length} problema(s) em supabase/migrations.`);
  process.exit(1);
}
console.log(`${ficheiros.length} migrações verificadas, sem problemas.`);
