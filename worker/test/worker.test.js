import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, Response } from 'miniflare';

const ORIGEN = 'https://franciscovergarap.github.io';
const CUERPO = `<button class="menu-toggle" id="menuToggle" aria-label="Abrir menú">Menú</button>
<aside class="sidebar" id="sidebar"><nav class="nav"><ul>
<li><a href="index.html" class="active">Inicio</a></li><li><a href="publicaciones.html">Publicaciones</a></li></ul></nav>
<img src="assets/logo-cpe.png" alt="Centro Producción del Espacio"></aside>
<main class="main"><section class="hero"><p class="kicker">Núcleo de Investigación</p><h1>Centro Producción del Espacio</h1>
<p class="sub">Investigación crítica sobre la producción del espacio urbano: vivienda, financiarización, derecho a la ciudad y métodos socioespaciales.</p></section>
<div class="grid"><a class="card" href="sobre.html"><span class="tag">Quiénes somos</span><h3>Sobre el CPE</h3></a></div>
<footer class="footer"><a href="mailto:jvergara@udla.cl">jvergara@udla.cl</a></footer></main>`;
const DOC = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="script-src 'self'">
<link rel="stylesheet" href="assets/style.css">
<style id="estilo-dialectico"></style>
</head>
<body data-menu-open="Menú">
<!-- ZONA-DIALECTICA:INICIO -->
${CUERPO}
<!-- ZONA-DIALECTICA:FIN -->
<script src="assets/site.js"></script>
</body></html>`;
const PUBLICACIONES = `<html><body><main><article class="pub" id="pub-6-locked"><h3>Locked in extraction: unveiling the path dependence of Chile's neoextractivist economy</h3></article>
<figure class="video"><iframe src="https://www.youtube-nocookie.com/embed/jlTSNq0pLiQ" title="Economía política de la vivienda"></iframe></figure></main></body></html>`;
const BIBLIOTECA = [
  { id: 'pub-6-locked', titulo: "Locked in extraction: unveiling the path dependence of Chile's neoextractivist economy", texto: 'rsaf041.md' },
  { id: 'pub-9-otro', titulo: 'Unveiling Place-Based Effects at Scale', texto: null },
];

let mf;
let github;
let respuestaModelo;
let moderacion;
let ultimaEntradaLector;
let ultimaEntradaEditor;
let modoModelo; // 'json' | 'sse' | 'falla'

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
      EDITABLES: 'index.html',
      FUENTE_TEXTOS: 'https://raw.githubusercontent.com/cpe/repo/main/papers/markdown/',
      ORIGENES_PERMITIDOS: ORIGEN,
    },
    serviceBindings: {
      async AI_FALSO(req) {
        const { modelo, entrada } = await req.json();
        if (modelo.includes('llama-guard')) return Response.json({ response: moderacion });
        if (modelo.includes('llama-4-scout')) {
          ultimaEntradaLector = entrada.messages[1].content;
          return Response.json({ response: '**Hallazgos:** la economía chilena sigue una trayectoria dependiente.' });
        }
        ultimaEntradaEditor = entrada.messages[1].content;
        if (modoModelo === 'falla') return new Response('AiError: 3046: Request timeout', { status: 500 });
        if (modoModelo === 'sse') {
          // Trocea la respuesta como lo hace Workers AI en modo streaming.
          const trozos = respuestaModelo.match(/[\s\S]{1,37}/g) || [];
          const sse = trozos.map((t) => `data: ${JSON.stringify({ response: t })}\n\n`).join('') + 'data: [DONE]\n\n';
          return new Response(sse, { headers: { 'content-type': 'text/event-stream' } });
        }
        return Response.json({ response: respuestaModelo });
      },
    },
    async outboundService(req) {
      const url = new URL(req.url);
      if (url.hostname === 'raw.githubusercontent.com') {
        return url.pathname.endsWith('/rsaf041.md')
          ? new Response('# Locked in extraction\nABSTRACT: we find path dependence in copper exports.')
          : new Response('no', { status: 404 });
      }
      assert.equal(url.hostname, 'api.github.com');
      github.llamadas.push(`${req.method} ${url.pathname}`);
      const archivos = {
        'index.html': () => ({ sha: github.sha, content: b64(github.contenido) }),
        'assets/style.css': () => ({ sha: 'css', content: b64('.hero{margin-bottom:60px}') }),
        'publicaciones.html': () => ({ sha: 'p', content: b64(PUBLICACIONES) }),
        'terminal/biblioteca.json': () => ({ sha: 'b', content: b64(JSON.stringify(BIBLIOTECA)) }),
      };
      const ruta = url.pathname.replace('/repos/yo/sitio/contents/', '');
      if (req.method === 'GET' && archivos[ruta]) return Response.json(archivos[ruta]());
      if (req.method === 'PUT' && ruta === 'index.html') {
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
  ultimaEntradaLector = null;
  ultimaEntradaEditor = null;
  modoModelo = 'json';
});

async function post(ruta, cuerpo, origen = ORIGEN) {
  const r = await mf.dispatchFetch(`http://w${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origen },
    body: JSON.stringify(cuerpo),
  });
  const datos = await r.json();
  // Las operaciones largas responden 200 y llevan el código real en el cuerpo si fallan.
  return { status: datos.status || r.status, datos };
}

async function llamar(ruta, cuerpo) {
  const r = await mf.dispatchFetch(`http://w${ruta}`, { method: 'POST', body: cuerpo });
  return r.json();
}

// Reorganización radical que conserva toda la información: el main pasa antes que la barra lateral.
const REORGANIZADO = `<style id="estilo-dialectico">.main{margin-left:0;display:grid;gap:2rem}.hero h1{font-size:5rem}</style>
<main class="main"><section class="hero"><h1>Centro Producción del Espacio</h1><p class="kicker">Núcleo de Investigación</p>
<p class="sub">Investigación crítica sobre la producción del espacio urbano: vivienda, financiarización, derecho a la ciudad y métodos socioespaciales.</p></section>
<div class="grid"><a class="card" href="sobre.html"><span class="tag">Quiénes somos</span><h3>Sobre el CPE</h3></a></div>
<footer class="footer"><a href="mailto:jvergara@udla.cl">jvergara@udla.cl</a></footer></main>
<button class="menu-toggle" id="menuToggle" aria-label="Abrir menú" onclick="x()">Menú</button>
<aside class="sidebar" id="sidebar"><nav class="nav"><ul><li><a href="publicaciones.html">Publicaciones</a></li><li><a href="index.html" class="active">Inicio</a></li></ul></nav>
<img src="assets/logo-cpe.png" alt="Centro Producción del Espacio"></aside><script>alert(1)</script>`;

test('el saneador elimina scripts, manejadores, URLs peligrosas, comentarios e iframes ajenos', async () => {
  const { html } = await llamar('/__sanear', `
    <p onclick="x()" class="a">hola<script>alert(1)</script></p>
    <a href="javascript:alert(1)">j</a><a href="  JaVaScRiPt:alert(1)">k</a>
    <a href="publicaciones.html#pub-1" target="x">ok</a>
    <img src="data:image/png;base64,AAA" onerror="x()"><img src="assets/logo.png" alt="l">
    <iframe src="https://evil.example/x"></iframe><iframe src="https://www.youtube-nocookie.com/embed/jlTSNq0pLiQ" title="v" onload="x()"></iframe>
    <style>body{display:none}</style>
    <div style="position: fixed; inset:0">tapa</div><div style="color:red">rojo</div>
    <form action="https://evil" method="post"><input type="password" name="c"><button>ir</button></form>
    <!-- ZONA-DIALECTICA:FIN --><marquee>texto</marquee><svg><script>x</script></svg>`);
  assert.doesNotMatch(html, /script|onclick|onerror|onload|javascript|data:|evil|<style|fixed|action=|method=|password|ZONA|marquee|svg/i);
  assert.match(html, /<p class="a">hola<\/p>/);
  assert.match(html, /<a href="publicaciones.html#pub-1" target="_blank" rel="noopener noreferrer">ok<\/a>/);
  assert.match(html, /<iframe src="https:\/\/www.youtube-nocookie.com\/embed\/jlTSNq0pLiQ" title="v"><\/iframe>/);
  assert.match(html, /<div style="color:red">rojo<\/div>/);
});

test('el CSS propio rechaza url(), @import, position:fixed, cierre de <style> y reglas sobre la terminal', async () => {
  assert.deepEqual(await llamar('/__css', '.hero h1{font-size:5rem;color:#000}'), { css: '.hero h1{font-size:5rem;color:#000}', rechazado: false });
  for (const malo of ['body{background:url(https://x/t.gif)}', '@import "x.css";', '.a{position:fixed}', '</style><script>1</script>', '.td-lanzador{display:none}', '#td-panel{opacity:0}']) {
    assert.equal((await llamar('/__css', malo)).rechazado, true, malo);
  }
});

test('reorganización completa de la página + CSS propio, conservando la infraestructura', async () => {
  respuestaModelo = '```html\n' + REORGANIZADO + '\n```';
  const p = await post('/proponer', { instruccion: 'Pon el contenido antes de la barra lateral y agranda el título', pagina: 'index.html', firma: 'Ana <b>' });
  assert.equal(p.status, 200, JSON.stringify(p.datos));
  assert.match(p.datos.css, /font-size:5rem/);
  assert.ok(p.datos.cuerpo.indexOf('<main') < p.datos.cuerpo.indexOf('<aside'));
  assert.doesNotMatch(p.datos.cuerpo, /script|onclick/);

  const a = await post('/aplicar', { cuerpo: p.datos.cuerpo, css: p.datos.css, token: p.datos.token });
  assert.equal(a.status, 200, JSON.stringify(a.datos));
  assert.match(github.contenido, /<meta http-equiv="Content-Security-Policy" content="script-src 'self'">/);
  assert.match(github.contenido, /<style id="estilo-dialectico">\n\.main\{margin-left:0/);
  assert.match(github.contenido, /<!-- ZONA-DIALECTICA:INICIO -->\n<main class="main">/);
  assert.match(github.contenido, /<!-- ZONA-DIALECTICA:FIN -->\n<script src="assets\/site.js"><\/script>/);
  assert.equal((github.contenido.match(/<script/g) || []).length, 1);
  assert.match(github.mensaje, /^dialéctica: Pon el contenido/);
  assert.match(github.mensaje, /Página: index.html/);
  assert.match(github.mensaje, /Firma: Ana b/);
});

test('se rechaza toda propuesta que borre información', async () => {
  const casos = {
    enlace: REORGANIZADO.replace('<li><a href="publicaciones.html">Publicaciones</a></li>', ''),
    imagen: REORGANIZADO.replace('<img src="assets/logo-cpe.png" alt="Centro Producción del Espacio">', ''),
    identificador: REORGANIZADO.replace(' id="menuToggle"', ''),
    texto: REORGANIZADO.replace(
      'Investigación crítica sobre la producción del espacio urbano: vivienda, financiarización, derecho a la ciudad y métodos socioespaciales.',
      'Investigación.',
    ),
  };
  for (const [caso, respuesta] of Object.entries(casos)) {
    respuestaModelo = respuesta;
    const p = await post('/proponer', { instruccion: 'simplifica', pagina: 'index.html' });
    assert.equal(p.status, 422, caso);
    assert.match(p.datos.error, /borraba información/, caso);
  }
  assert.equal(github.contenido, DOC);
});

test('el CSS con reglas prohibidas se descarta sin perder el resto de la propuesta', async () => {
  respuestaModelo = REORGANIZADO.replace('.hero h1{font-size:5rem}', '.td-lanzador{display:none}');
  const p = await post('/proponer', { instruccion: 'oculta la terminal', pagina: 'index.html' });
  assert.equal(p.status, 200);
  assert.equal(p.datos.css, '');
  assert.ok(p.datos.advertencias.some((a) => a.includes('CSS propuesto')));
});

test('aplicar rechaza contenido manipulado y detecta intervenciones concurrentes', async () => {
  respuestaModelo = REORGANIZADO;
  const p = await post('/proponer', { instruccion: 'reorganiza', pagina: 'index.html' });
  assert.equal((await post('/aplicar', { cuerpo: p.datos.cuerpo + '<p>x</p>', css: p.datos.css, token: p.datos.token })).status, 400);
  assert.equal((await post('/aplicar', { cuerpo: p.datos.cuerpo, css: '', token: p.datos.token })).status, 400);
  assert.equal((await post('/aplicar', { cuerpo: p.datos.cuerpo, css: p.datos.css, token: p.datos.token + 'x' })).status, 400);
  github.sha = 'otra-version';
  assert.equal((await post('/aplicar', { cuerpo: p.datos.cuerpo, css: p.datos.css, token: p.datos.token })).status, 409);
  assert.equal(github.contenido, DOC);
});

test('rechazos: moderación, negativa del modelo, origen, página no abierta y exceso de texto', async () => {
  moderacion = 'unsafe\nS10';
  assert.equal((await post('/proponer', { instruccion: 'algo de odio', pagina: 'index.html' })).status, 422);
  moderacion = { safe: false, categories: ['S10'] };
  assert.equal((await post('/preguntar', { pregunta: 'algo de odio', pagina: 'index.html' })).status, 422);
  moderacion = 'safe';
  respuestaModelo = 'RECHAZO: publicidad';
  const r = await post('/proponer', { instruccion: 'pon un anuncio de casino', pagina: 'index.html' });
  assert.equal(r.status, 422);
  assert.match(r.datos.error, /publicidad/);
  assert.equal((await post('/proponer', { instruccion: 'x', pagina: 'publicaciones.html' })).status, 403);
  assert.equal((await post('/proponer', { instruccion: 'x', pagina: '../secreto.html' })).status, 403);
  assert.equal((await post('/proponer', { instruccion: 'x', pagina: 'index.html' }, 'https://otro.sitio')).status, 403);
  assert.equal((await post('/proponer', { instruccion: 'x'.repeat(501), pagina: 'index.html' })).status, 400);
});

test('preguntar por una publicación usa su texto completo', async () => {
  const r = await post('/preguntar', { pregunta: 'Explícame los hallazgos', pagina: 'publicaciones.html', ancla: 'pub-6-locked' });
  assert.equal(r.status, 200, JSON.stringify(r.datos));
  assert.match(r.datos.respuesta, /trayectoria dependiente/);
  assert.deepEqual(r.datos.fuente, { tipo: 'publicacion', titulo: BIBLIOTECA[0].titulo, id: 'pub-6-locked', textoCompleto: true });
  assert.match(ultimaEntradaLector, /TEXTO COMPLETO DE «Locked in extraction/);
  assert.match(ultimaEntradaLector, /path dependence in copper exports/);
  assert.match(ultimaEntradaLector, /PÁGINA «publicaciones.html»/);
});

test('preguntar reconoce la publicación por el título y admite las que no tienen texto', async () => {
  const r = await post('/preguntar', { pregunta: '¿Qué dice Locked in extraction sobre la dependencia de trayectoria?', pagina: 'index.html' });
  assert.equal(r.datos.fuente.id, 'pub-6-locked');
  const s = await post('/preguntar', { pregunta: 'hallazgos', pagina: 'publicaciones.html', ancla: 'pub-9-otro' });
  assert.equal(s.datos.fuente.textoCompleto, false);
  assert.match(ultimaEntradaLector, /no hay texto completo disponible/);
  const g = await post('/preguntar', { pregunta: '¿Qué es el CPE?', pagina: 'index.html' });
  assert.equal(g.datos.fuente, null);
  assert.match(ultimaEntradaLector, /Centro Producción del Espacio/);
});

test('preguntar por un vídeo sin transcripción lo declara', async () => {
  const r = await post('/preguntar', { pregunta: '¿De qué trata?', pagina: 'publicaciones.html', ancla: 'video:jlTSNq0pLiQ' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.datos.fuente, { tipo: 'video', titulo: 'Economía política de la vivienda', id: 'jlTSNq0pLiQ', textoCompleto: false });
  assert.match(ultimaEntradaLector, /VÍDEO «Economía política de la vivienda»: no hay transcripción/);
});

test('historia y estado', async () => {
  const h = await (await mf.dispatchFetch('http://w/historia?pagina=index.html')).json();
  assert.deepEqual(h.intervenciones[0], { sha: 'abcdef1', mensaje: 'dialéctica: x', fecha: '2026-09-24', url: 'u' });
  const e = await (await mf.dispatchFetch('http://w/estado')).json();
  assert.deepEqual(e.editables, ['index.html']);
});

test('la portada real del CPE atraviesa el saneador y el control de integridad sin pérdidas', async () => {
  const { readFileSync } = await import('node:fs');
  const real = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  github.contenido = real;
  const cuerpo = real.slice(real.indexOf('<!-- ZONA-DIALECTICA:INICIO -->') + 32, real.indexOf('<!-- ZONA-DIALECTICA:FIN -->'));
  respuestaModelo = `<style id="estilo-dialectico">.grid{grid-template-columns:1fr}</style>\n${cuerpo}`;
  const p = await post('/proponer', { instruccion: 'pon las tarjetas en una columna', pagina: 'index.html' });
  assert.equal(p.status, 200, JSON.stringify(p.datos));
  assert.deepEqual(p.datos.advertencias, []);
  const a = await post('/aplicar', { cuerpo: p.datos.cuerpo, css: p.datos.css, token: p.datos.token });
  assert.equal(a.status, 200, JSON.stringify(a.datos));
  // Fuera de la zona y del estilo propio, el documento queda idéntico.
  const sinZona = (d) => d.replace(/<!-- ZONA-DIALECTICA:INICIO -->[\s\S]*<!-- ZONA-DIALECTICA:FIN -->/, '').replace(/<style id="estilo-dialectico">[\s\S]*?<\/style>/, '');
  assert.equal(sinZona(github.contenido), sinZona(real));
  assert.equal((github.contenido.match(/<li>/g) || []).length, (real.match(/<li>/g) || []).length);
});

test('los cambios que se resuelven con CSS no reescriben el HTML', async () => {
  modoModelo = 'sse';
  respuestaModelo = '<style id="estilo-dialectico">body,.main,.sidebar{background:#c0392b;color:#fff}</style>';
  const p = await post('/proponer', { instruccion: 'Usa rojo de fondo', pagina: 'index.html' });
  assert.equal(p.status, 200, JSON.stringify(p.datos));
  assert.equal(p.datos.css, 'body,.main,.sidebar{background:#c0392b;color:#fff}');
  assert.match(p.datos.cuerpo, /<h1>Centro Producción del Espacio<\/h1>/);
  const a = await post('/aplicar', { cuerpo: p.datos.cuerpo, css: p.datos.css, token: p.datos.token });
  assert.equal(a.status, 200, JSON.stringify(a.datos));
  assert.match(github.contenido, /<style id="estilo-dialectico">\nbody,.main,.sidebar\{background:#c0392b/);
});

test('el listado de publicaciones viaja compacto al modelo y se restituye', async () => {
  const { readFileSync } = await import('node:fs');
  const real = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  github.contenido = real;
  modoModelo = 'sse';
  // El modelo devuelve la página reorganizada con el listado vacío, como se le pidió.
  const inicio = real.indexOf('<!-- ZONA-DIALECTICA:INICIO -->') + 32;
  const cuerpo = real.slice(inicio, real.indexOf('<!-- ZONA-DIALECTICA:FIN -->'));
  const compacto = cuerpo.replace(/(<ul data-compacto="publicaciones">)[\s\S]*?(<\/ul>)/, '$1$2');
  respuestaModelo = compacto.replace('<main class="main">', '<main class="main portada-roja">');
  const p = await post('/proponer', { instruccion: 'marca la portada', pagina: 'index.html' });
  assert.equal(p.status, 200, JSON.stringify(p.datos));
  assert.ok(ultimaEntradaEditor.length < real.length * 0.75, 'el modelo recibe la página compacta');
  assert.doesNotMatch(ultimaEntradaEditor, /pub-46-urban-food-deserts/);
  assert.match(p.datos.cuerpo, /portada-roja/);
  assert.match(p.datos.cuerpo, /pub-46-urban-food-deserts/);
  assert.equal((p.datos.cuerpo.match(/publicaciones.html#pub-/g) || []).length, 46);
});

test('si el modelo falla, el error llega legible a la terminal', async () => {
  modoModelo = 'falla';
  const p = await post('/proponer', { instruccion: 'Usa rojo de fondo', pagina: 'index.html' });
  assert.equal(p.status, 502);
  assert.match(p.datos.error, /no respondió: .*timeout/i);
});
