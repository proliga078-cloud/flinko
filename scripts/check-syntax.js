// Verifica a sintaxe de todo o JavaScript do site: ficheiros em assets/,
// netlify/functions/ e cada <script> inline das páginas .html.
//
// Como o site não tem bundler nem compilador, um erro de sintaxe num script
// inline só se descobre quando a página abre no browser (e nesse momento
// deixa a página inteira sem funcionar). Isto apanha-o antes do deploy.
//
// Uso: node scripts/check-syntax.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'flinko-check-'));
let erros = 0;
let verificados = 0;

function verificar(ficheiro, origem) {
  verificados++;
  const r = spawnSync(process.execPath, ['--check', ficheiro], { encoding: 'utf8' });
  if (r.status !== 0) {
    erros++;
    console.error(`ERRO DE SINTAXE em ${origem}\n${(r.stderr || '').split('\n').slice(0, 6).join('\n')}\n`);
  }
}

function jsDaPasta(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return;
  for (const f of fs.readdirSync(abs).filter((n) => n.endsWith('.js'))) verificar(path.join(abs, f), `${dir}/${f}`);
}
jsDaPasta('assets');
jsDaPasta('netlify/functions');
jsDaPasta('scripts');

const paginas = [
  ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).map((f) => [path.join(ROOT, f), f]),
  ...fs.readdirSync(path.join(ROOT, 'templates')).filter((f) => f.endsWith('.html')).map((f) => [path.join(ROOT, 'templates', f), `templates/${f}`]),
];
const IGNORAR_TIPOS = /type=["'](application\/ld\+json|text\/template|importmap|text\/html)/i;
for (const [ficheiro, nome] of paginas) {
  const html = fs.readFileSync(ficheiro, 'utf8');
  const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  let i = 0;
  while ((m = re.exec(html))) {
    if (IGNORAR_TIPOS.test(m[1])) continue;
    i++;
    const tmp = path.join(TMP, `${nome.replace(/[\\/]/g, '_')}.${i}.js`);
    fs.writeFileSync(tmp, m[2]);
    verificar(tmp, `${nome} (script inline #${i})`);
  }
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`${verificados} scripts verificados, ${erros} com erros.`);
process.exit(erros ? 1 : 0);
