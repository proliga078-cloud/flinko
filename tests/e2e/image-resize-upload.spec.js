// Testes E2E do redimensionamento/compressão de imagens ANTES do upload
// para o Supabase Storage (assets/resize-image.js).
//
// Bug de auditoria: uma foto tirada com um telemóvel atual (muitas vezes
// vários MB, resolução acima de 4000px) era enviada tal como estava para o
// Supabase Storage e servida a essa resolução total no site, mesmo em
// sítios onde só é mostrada num avatar de 80px ou numa miniatura de
// portfólio de 100px — desperdício real de armazenamento e de dados
// móveis dos utilizadores. Estes testes correm no browser real do
// Playwright (não é mockado) para confirmar que o ficheiro que chega ao
// Storage já vem mais pequeno do que o original quando a foto é grande.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';
const LARGE_PHOTO = path.join(__dirname, 'fixtures', 'large-photo.jpg'); // 2400x1800, ~2.9MB
const SMALL_PHOTO = path.join(__dirname, 'fixtures', 'small-photo.jpg'); // 400x300, poucos KB

async function withFakeSupabase(page, config) {
  await page.route(SUPABASE_CDN_URL, (route) =>
    route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' })
  );
  await page.addInitScript((cfg) => {
    window.__testAuthConfig = cfg;
  }, config);
}

function dashboardConfig() {
  const profile = { id: 'pro-1', name: 'Profissional Teste', plan: 'free', account_type: 'professional', notify_email: true, notify_digest: true };
  return {
    session: { access_token: 'tok', user: { id: 'pro-1', email: 'pro@example.com' } },
    rpcResults: { get_my_profile: [profile] },
    tableData: { plan_limits: { data: [] } },
  };
}

test('foto de perfil grande (2.9MB, 2400x1800) é reduzida antes do upload', async ({ page }) => {
  await withFakeSupabase(page, dashboardConfig());
  await page.goto('/dashboard.html');
  await page.click('.nav-item[data-page="profile"]');

  const fs = require('fs');
  const originalSize = fs.statSync(LARGE_PHOTO).size;

  await page.setInputFiles('#p-photo-file', LARGE_PHOTO);

  await expect.poll(() => page.evaluate(() => (window.__uploadCalls || []).length)).toBeGreaterThan(0);
  const uploadCalls = await page.evaluate(() => window.__uploadCalls);
  expect(uploadCalls).toHaveLength(1);
  const uploaded = uploadCalls[0].file;

  expect(uploaded.size, 'o ficheiro enviado deve ser mais pequeno que o original de 2.9MB').toBeLessThan(originalSize);
  expect(uploaded.type).toBe('image/jpeg');
  // O caminho de upload usa a extensão do ficheiro (possivelmente
  // convertida pelo resize) — confirma que path e ficheiro real ficam
  // consistentes (nada de path .heic com bytes .jpg lá dentro).
  expect(uploadCalls[0].path.endsWith('.jpg')).toBe(true);
});

test('foto já pequena (400x300) não é alterada — resizeImageFile não mexe em imagens que já cabem no limite', async ({ page }) => {
  await withFakeSupabase(page, dashboardConfig());
  await page.goto('/dashboard.html');
  await page.click('.nav-item[data-page="profile"]');

  const fs = require('fs');
  const originalSize = fs.statSync(SMALL_PHOTO).size;

  await page.setInputFiles('#p-photo-file', SMALL_PHOTO);

  await expect.poll(() => page.evaluate(() => (window.__uploadCalls || []).length)).toBeGreaterThan(0);
  const uploadCalls = await page.evaluate(() => window.__uploadCalls);
  const uploaded = uploadCalls[0].file;

  expect(uploaded.size).toBe(originalSize);
  expect(uploadCalls[0].path.endsWith('.jpg')).toBe(true);
});

test('resizeImageFile (função global) devolve o mesmo ficheiro, inalterado, para vídeo', async ({ page }) => {
  await withFakeSupabase(page, dashboardConfig());
  await page.goto('/dashboard.html');

  const result = await page.evaluate(async () => {
    const file = new File([new Uint8Array(1000)], 'clip.mp4', { type: 'video/mp4' });
    const out = await resizeImageFile(file);
    return { sameRef: out === file, name: out.name, type: out.type, size: out.size };
  });
  expect(result.sameRef).toBe(true);
  expect(result.type).toBe('video/mp4');
});

test('resizeImageFile (função global) devolve o mesmo ficheiro, inalterado, para GIF (evita perder animação)', async ({ page }) => {
  await withFakeSupabase(page, dashboardConfig());
  await page.goto('/dashboard.html');

  const result = await page.evaluate(async () => {
    // Cabeçalho mínimo válido de GIF (GIF89a) — suficiente para o type
    // ficar image/gif, que é o que resizeImageFile verifica antes de
    // sequer tentar descodificar a imagem.
    const file = new File([new Uint8Array(100)], 'animado.gif', { type: 'image/gif' });
    const out = await resizeImageFile(file);
    return { sameRef: out === file };
  });
  expect(result.sameRef).toBe(true);
});

// Out/2026: na página dos eletricistas havia fotos de perfil de 1,1 e 1,3 MB.
// Eram PNG: o resize mantinha o PNG (sem perdas, enorme) e não mexia em
// ficheiros pesados que já cabiam nas dimensões. Uma foto sem transparência
// passa a JPEG, e um ficheiro pesado é sempre recomprimido.
async function pngOpaco(page, lado) {
  return page.evaluate(async (l) => {
    const c = document.createElement('canvas'); c.width = l; c.height = l;
    const ctx = c.getContext('2d'); const img = ctx.createImageData(l, l);
    for (let i = 0; i < img.data.length; i += 4) { img.data[i] = Math.random() * 255; img.data[i + 1] = Math.random() * 255; img.data[i + 2] = Math.random() * 255; img.data[i + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    window.__png = new File([blob], 'foto.png', { type: 'image/png' });
    return blob.size;
  }, lado);
}

test('PNG sem transparência, mesmo já pequeno em dimensões, sai como JPEG mais leve', async ({ page }) => {
  await withFakeSupabase(page, dashboardConfig());
  await page.goto('/dashboard.html');
  const original = await pngOpaco(page, 900);
  expect(original).toBeGreaterThan(1000000);
  const out = await page.evaluate(async () => { const f = await resizeImageFile(window.__png); return { type: f.type, size: f.size, name: f.name }; });
  expect(out.type).toBe('image/jpeg');
  expect(out.name).toBe('foto.jpg');
  expect(out.size).toBeLessThan(original / 2);
});

test('PNG com transparência continua PNG (não perde o fundo transparente)', async ({ page }) => {
  await withFakeSupabase(page, dashboardConfig());
  await page.goto('/dashboard.html');
  const out = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 2000; c.height = 2000;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#E8720A'; ctx.fillRect(500, 500, 1000, 1000);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const f = await resizeImageFile(new File([blob], 'logo.png', { type: 'image/png' }));
    return { type: f.type };
  });
  expect(out.type).toBe('image/png');
});

test('a foto de perfil é guardada no máximo com 600px', async ({ page }) => {
  await withFakeSupabase(page, dashboardConfig());
  await page.goto('/dashboard.html');
  await page.click('.nav-item[data-page="profile"]');
  await page.evaluate(() => {
    const orig = window.resizeImageFile;
    window.__resizeOpts = [];
    window.resizeImageFile = (f, o) => { window.__resizeOpts.push(o || null); return orig(f, o); };
  });
  await page.setInputFiles('#p-photo-file', LARGE_PHOTO);
  await expect.poll(() => page.evaluate(() => (window.__uploadCalls || []).length)).toBeGreaterThan(0);
  const opts = await page.evaluate(() => window.__resizeOpts[0]);
  expect(opts && opts.maxWidth).toBeLessThanOrEqual(600);
  expect(opts && opts.maxHeight).toBeLessThanOrEqual(600);
});
