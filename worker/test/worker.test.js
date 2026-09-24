import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, Response } from 'miniflare';

const ORIGEN = 'https://franciscovergarap.github.io';
const DOC = `<!DOCTYPE html><html><head><title>x</title></head><body>
<nav>menú</nav>
<main>
<!-- ZONA-DIALECTICA:INICIO -->
<section class="hero"><h1>Centro Producción del Espacio</h1><p>Texto original de la portada, con suficiente extensión para las pruebas.</p></section>
<!-- ZONA-DIALECTICA:FIN -->
</main>
<script src="assets/sitio.js"></script>
</body></html>`;

let mf;
let github; // estado simulado del repositorio
let respuestaModelo;
let moderacion;

function b64(t) {
  return Buffer.from(t, 'utf8').toString('base64');
}

before(async () => {
  mf = new Miniflare({
    modules: true,
    modulesRoot: new URL('..', import.meta.url).pathname,
    scriptPath: new URL('./entrada.js', import.meta.url).pathname,
    modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }],
    compatibilityDate: '2026-08-01',
    bindings: {
      GITHUB_TOKEN: 'falso',
      FIRMA_SECRETA: 'secreto-de-prueba',
      REPO_DUENO: 'yo',
      REPO_NOMBRE: 'sitio',
      MODO: 'directo',
      ORIGENES_PERMITIDOS: ORIGEN,
    },
    serviceBindings: {
      async AI_FALSO(req) {
        const { modelo } = await req.json();
        if (modelo.includes('llama-guard')) return Response.json({ response: moderacion });
        return Response.json({ response: respuestaModelo });
      },
    },
    async outboundService(req) {
      const url = new URL(req.url);
      assert.equal(url.hostname, 'api.github.com');
      github.llamadas.push(`${req.method} ${url.pathname}`);
      if (req.method === 'GET' && url.pathname === '/repos/yo/sitio/contents/index.html') {
        return Response.json({ sha: github.sha, content: b64(github.contenido) });
      }
      if (req.method === 'PUT' && url.pathname === '/repos/yo/sitio/contents/index.html') {
        const cuerpo = await req.json();
        if (cuerpo.sha !== github.sha) return new Response('conflict', { status: 409 });
        github.contenido = Buffer.from(cuerpo.content, 'base64').toString('utf8');
        github.sha = `sha${github.llamadas.length}`;
        github.mensaje = cuerpo.message;
        return Response.json({ commit: { sha: 'abc123', html_url: 'https://github.com/yo/sitio/commit/abc123' } });
      }
      if (req.method === 'GET' && url.pathname === '/repos/yo/sitio/commits') {
        return Response.json([{ sha: 'abcdef123', html_url: 'u', commit: { message: 'dialéctica: x\n\ncuerpo', author: { date: '2026-09-24' } } }]);
      }
      return new Response('no simulado', { status: 404 });
    },
  });
});

after(() => mf.dispose());

beforeEach(() => {
  github = { sha: 'sha0', contenido: DOC, llamadas: [] };
  moderacion = 'safe';
  respuestaModelo = '';
});

async function post(ruta, cuerpo, origen = ORIGEN) {
  const r = await mf.dispatchFetch(`http://w${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origen },
    body: JSON.stringify(cuerpo),
  });
  return { status: r.status, datos: await r.json() };
}

async function sanear(html) {
  const r = await mf.dispatchFetch('http://w/__sanear', { method: 'POST', body: html });
  return r.json();
}

test('el saneador elimina scripts, manejadores, URLs peligrosas y comentarios', async () => {
  const { html } = await sanear(`
    <p onclick="x()" class="a">hola<script>alert(1)</script></p>
    <a href="javascript:alert(1)">j</a><a href="  JaVaScRiPt:alert(1)">k</a>
    <a href="publicaciones.html#pub-1" target="x">ok</a>
    <img src="data:image/png;base64,AAA" onerror="x()"><img src="assets/logo.png" alt="l">
    <iframe src="https://evil"></iframe><style>body{display:none}</style>
    <div style="position: fixed; inset:0">tapa</div><div style="color:red">rojo</div>
    <form action="https://evil" method="post"><input type="password" name="c"><button>ir</button></form>
    <!-- ZONA-DIALECTICA:FIN --><marquee>texto</marquee><svg><script>x</script></svg>`);
  assert.doesNotMatch(html, /script|onclick|onerror|javascript|data:|iframe|<style|fixed|action=|method=|password|ZONA|marquee|svg/i);
  assert.match(html, /<p class="a">hola<\/p>/);
  assert.match(html, /<a href="publicaciones.html#pub-1" target="_blank" rel="noopener noreferrer">ok<\/a>/);
  assert.match(html, /<img src="assets\/logo.png" alt="l">/);
  assert.match(html, /<div style="color:red">rojo<\/div>/);
  assert.match(html, /texto/);
});

test('proponer + aplicar escribe solo dentro de la zona y deja constancia en el commit', async () => {
  respuestaModelo = '```html\n<section class="hero"><h1>La ciudad como obra</h1><p onclick="x()">Texto nuevo, extenso y deliberado para la portada del centro.</p><script>1</script></section>\n```';
  const p = await post('/proponer', { instruccion: 'Cambia el título por "La ciudad como obra"', firma: 'Ana <b>' });
  assert.equal(p.status, 200, JSON.stringify(p.datos));
  assert.match(p.datos.fragmento, /La ciudad como obra/);
  assert.doesNotMatch(p.datos.fragmento, /script|onclick/);
  assert.ok(p.datos.advertencias.some((a) => a.includes('script')));

  const a = await post('/aplicar', { fragmento: p.datos.fragmento, token: p.datos.token });
  assert.equal(a.status, 200, JSON.stringify(a.datos));
  assert.equal(a.datos.modo, 'directo');
  assert.match(github.contenido, /<nav>menú<\/nav>/);
  assert.match(github.contenido, /<script src="assets\/sitio.js"><\/script>/);
  assert.match(github.contenido, /<!-- ZONA-DIALECTICA:INICIO -->\n<section class="hero"><h1>La ciudad como obra<\/h1>/);
  assert.match(github.mensaje, /^dialéctica: Cambia el título/);
  assert.match(github.mensaje, /Firma: Ana b/);
});

test('aplicar rechaza un fragmento distinto del propuesto', async () => {
  respuestaModelo = '<section><h1>Propuesta legítima con texto suficiente para la prueba</h1></section>';
  const p = await post('/proponer', { instruccion: 'cambia el título' });
  const a = await post('/aplicar', { fragmento: '<section><h1>otra cosa</h1></section>', token: p.datos.token });
  assert.equal(a.status, 400);
  const b = await post('/aplicar', { fragmento: p.datos.fragmento, token: p.datos.token.replace(/.$/, 'A') + 'x' });
  assert.equal(b.status, 400);
  assert.equal(github.contenido, DOC);
});

test('aplicar detecta que otra persona intervino antes (409)', async () => {
  respuestaModelo = '<section><h1>Propuesta legítima con texto suficiente para la prueba</h1></section>';
  const p = await post('/proponer', { instruccion: 'cambia el título' });
  github.sha = 'otra-version';
  const a = await post('/aplicar', { fragmento: p.datos.fragmento, token: p.datos.token });
  assert.equal(a.status, 409);
  assert.equal(github.contenido, DOC);
});

test('rechazos: moderación, negativa del modelo y origen no autorizado', async () => {
  moderacion = 'unsafe\nS10';
  assert.equal((await post('/proponer', { instruccion: 'algo de odio' })).status, 422);
  moderacion = { safe: false, categories: ['S10'] };
  assert.equal((await post('/proponer', { instruccion: 'algo de odio' })).status, 422);
  moderacion = 'safe';
  respuestaModelo = 'RECHAZO: publicidad';
  const r = await post('/proponer', { instruccion: 'pon un anuncio de casino' });
  assert.equal(r.status, 422);
  assert.match(r.datos.error, /publicidad/);
  assert.equal((await post('/proponer', { instruccion: 'x' }, 'https://otro.sitio')).status, 403);
  assert.equal((await post('/proponer', { instruccion: 'x'.repeat(501) })).status, 400);
});

test('advierte cuando la propuesta parece truncada', async () => {
  respuestaModelo = '<p>x</p>';
  const p = await post('/proponer', { instruccion: 'cambia el color del título' });
  assert.equal(p.status, 200);
  assert.ok(p.datos.advertencias.some((a) => a.includes('truncado')));
});

test('historia y estado', async () => {
  const h = await (await mf.dispatchFetch('http://w/historia')).json();
  assert.deepEqual(h.intervenciones[0], { sha: 'abcdef1', mensaje: 'dialéctica: x', fecha: '2026-09-24', url: 'u' });
  const e = await (await mf.dispatchFetch('http://w/estado')).json();
  assert.equal(e.modo, 'directo');
});
