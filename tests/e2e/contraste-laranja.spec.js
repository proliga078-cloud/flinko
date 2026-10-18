// Contraste (out/2026, WebAIM Million: texto com pouco contraste é a falha
// mais comum na web). Letra branca sobre o laranja #E8720A dava 3,1:1 e o
// mínimo para texto normal é 4,5:1. O mesmo para texto laranja sobre branco.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';
const PAGINAS = ['/index.html', '/eletricistas.html', '/categoria.html', '/pedidos.html', '/profile.html?id=1', '/pricing.html', '/sobre.html', '/contacto.html', '/como-funciona.html', '/profissionais.html', '/auth.html', '/avaliar.html?t=x'];

for (const pagina of PAGINAS) {
  test('laranja legível em ' + pagina, async ({ page }) => {
    await page.route(SUPABASE_CDN_URL, (r) => r.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
    await page.addInitScript(() => {
      window.__testAuthConfig = {
        tableData: { profiles: { data: [{ id: '1', name: 'Ana', category: 'Eletricistas', location: 'Porto', approved: true, verified: true, account_type: 'professional', bio: 'Bio' }] }, services: { data: [] }, reviews: { data: [] } },
        rpcResults: { spotlight_pros: [], review_invite_info: [{ professional_id: '1', pro_name: 'Ana', pro_category: 'Eletricistas', used: false }] },
      };
    });
    await page.goto(pagina);
    await page.waitForTimeout(1200);
    const falhas = await page.evaluate(() => {
      const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number);
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const laranja = ([r, g, b]) => r > 170 && g > 70 && g < 150 && b < 70;
      const branco = ([r, g, b]) => r > 245 && g > 245 && b > 245;
      const fundo = (el) => { while (el) { const cs = getComputedStyle(el); const c = parse(cs.backgroundColor); if (cs.backgroundImage !== 'none') return /232, 114, 10|238, 124, 31/.test(cs.backgroundImage) ? [232, 114, 10] : null; /* outro gradiente ou imagem: não dá para medir */ if (c.length >= 3 && (c[3] === undefined || c[3] > 0.9)) return c; el = el.parentElement; } return [255, 255, 255]; };
      const out = [];
      document.querySelectorAll('body *').forEach((el) => {
        if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)) return;
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
        const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity < 0.5) return;
        const fg = parse(cs.color); if (fg[3] !== undefined && fg[3] < 1) return;
        const bg = fundo(el);
        if (!bg) return;
        if (!((branco(fg) && laranja(bg)) || (laranja(fg) && branco(bg)))) return;
        const grande = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700);
        if (ratio(fg, bg) < (grande ? 3 : 4.5)) out.push(el.textContent.trim().slice(0, 30) + ' (' + ratio(fg, bg).toFixed(2) + ')');
      });
      return out;
    });
    expect(falhas).toEqual([]);
  });
}
