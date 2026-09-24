# Terminal dialéctica

La portada deja de ser un objeto terminado y pasa a ser un espacio producido colectivamente. Cualquier visitante abre una terminal (botón `>_ intervenir`, o tecla `` ` `` / `º`), describe en lenguaje natural el cambio que quiere, ve la propuesta aplicada *in situ* sobre la página y decide si la publica o la descarta. Cada intervención queda en el historial de git con su instrucción, su firma (opcional) y el modelo que la ejecutó: el repositorio es el archivo de la página en proceso.

## Arquitectura

```
navegador (GitHub Pages)                Cloudflare Worker                     GitHub
┌──────────────────────┐  instrucción  ┌──────────────────────────┐  lee    ┌──────────────┐
│ terminal/terminal.js │ ────────────▶ │ 1. Llama Guard (filtro)  │ ◀────── │ index.html   │
│                      │               │ 2. Qwen2.5-Coder reescribe│         │ (rama main)  │
│ vista previa in situ │ ◀──────────── │ 3. saneador HTMLRewriter │         │              │
│                      │  fragmento +  │ 4. firma HMAC            │         │              │
│ «aplicar»            │  token firmado│                          │ commit  │              │
│                      │ ────────────▶ │ 5. verifica y escribe    │ ──────▶ │ → despliegue │
└──────────────────────┘               └──────────────────────────┘  o PR   └──────────────┘
```

- **Modelo**: `@cf/qwen/qwen2.5-coder-32b-instruct` en Workers AI, especializado en código. Se cambia con la variable `MODELO` (por ejemplo `@cf/meta/llama-3.1-8b-instruct-fast`, más liviano pero menos fiable al reescribir HTML extenso).
- **Zona editable**: solo el HTML entre `<!-- ZONA-DIALECTICA:INICIO -->` y `<!-- ZONA-DIALECTICA:FIN -->`. Cabecera, navegación, estilos, scripts y pie quedan fuera del alcance del modelo. El Worker lee siempre la zona desde GitHub; el navegador nunca decide qué HTML se edita.

## Salvaguardas

| Riesgo | Medida |
|---|---|
| Inyección de código (XSS) | Saneador de lista blanca (`worker/src/sanear.js`): elimina `<script>`, `<style>`, `<iframe>`, `<svg>`, atributos `on*`, URLs `javascript:`/`data:`, CSS con `url()` o `position:fixed`, formularios con `action`. Además, la página declara una CSP `script-src 'self'` que impide ejecutar cualquier script en línea aunque algo se filtrara. |
| Romper la página | La zona está acotada; los comentarios se eliminan, de modo que nadie puede falsificar los marcadores. |
| Manipular la propuesta en el navegador | `/aplicar` solo acepta el fragmento exacto que el servidor generó y firmó (HMAC + hash), válido 30 minutos. |
| Dos personas editando a la vez | Control de concurrencia optimista: si la página cambió entre la propuesta y la publicación, se rechaza (409) y hay que proponer de nuevo sobre la versión nueva. |
| Contenido ofensivo o spam | Llama Guard 3 filtra la instrucción; el modelo editor tiene orden de responder `RECHAZO` ante odio, acoso, difamación, publicidad, etc. |
| Abuso masivo | Límite de 6 escrituras por minuto e IP; solo se aceptan peticiones desde los orígenes declarados. |
| Vandalismo que pasa los filtros | Todo queda en git: se revierte con `git revert`. El modo `revision` convierte cada intervención en un pull request que alguien del CPE acepta o rechaza. |

## Modos de gobierno

- `MODO = "directo"`: cada intervención se publica de inmediato como commit en `main`. La página es plenamente abierta.
- `MODO = "revision"`: cada intervención abre un pull request. La página sigue abierta a la propuesta, pero su publicación pasa por deliberación.

## Puesta en marcha

Requisitos: cuenta gratuita de Cloudflare y Node 20 o superior.

1. **Token de GitHub.** En GitHub → Settings → Developer settings → Fine-grained tokens, crea un token limitado al repositorio del sitio con permiso *Contents: Read and write* (y *Pull requests: Read and write* si usarás el modo `revision`).
2. **Configura** `worker/wrangler.toml`: `REPO_DUENO`, `REPO_NOMBRE`, `RAMA`, `MODO` y `ORIGENES_PERMITIDOS` (el dominio de GitHub Pages, sin ruta ni barra final, p. ej. `https://cpe-udla.github.io`).
3. **Despliega el Worker:**
   ```sh
   cd worker
   npm install
   npx wrangler login
   npx wrangler secret put GITHUB_TOKEN     # pega el token
   npx wrangler secret put FIRMA_SECRETA    # pega el resultado de: openssl rand -hex 32
   npx wrangler deploy
   ```
   Wrangler imprime la URL, del tipo `https://terminal-dialectica.<subdominio>.workers.dev`.
4. **Conecta la página:** en `index.html`, escribe esa URL en `data-servidor` de la etiqueta `<script src="terminal/terminal.js" ...>`.
5. Haz commit y push. GitHub Pages redespliega y la terminal queda activa.

Pruebas del Worker (se ejecutan en el runtime real de Workers con GitHub y el modelo simulados): `cd worker && npm test`.

## Integración en cpe-udla/cpe-repositorio

1. Copia `terminal/` a la raíz del repositorio del CPE.
2. En `<head>` de `index.html` agrega:
   ```html
   <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data:; connect-src 'self' https://*.workers.dev; object-src 'none'; base-uri 'none'; form-action 'none'">
   <link rel="stylesheet" href="terminal/terminal.css">
   ```
   Antes de publicar, comprueba que `assets/site.js` no dependa de scripts en línea (la CSP los bloquearía).
3. Marca la zona editable dentro de `<main class="main">`, desde antes de `<section class="hero">` hasta antes de `<footer class="footer">`:
   ```html
   <main class="main">
     <!-- ZONA-DIALECTICA:INICIO -->
     <section class="hero">…</section>
     …
     <div class="grid">…</div>
     <!-- ZONA-DIALECTICA:FIN -->
     <footer class="footer">…</footer>
   </main>
   ```
4. Antes de `</body>`, después de `assets/site.js`:
   ```html
   <script src="terminal/terminal.js" data-servidor="https://terminal-dialectica.<subdominio>.workers.dev" defer></script>
   ```
5. En `worker/wrangler.toml`: `REPO_DUENO = "cpe-udla"`, `REPO_NOMBRE = "cpe-repositorio"`, `ORIGENES_PERMITIDOS = "https://cpe-udla.github.io"`.

Las versiones en otros idiomas (`en/`, `fr/`, …) pueden abrirse con su propio Worker (variable `ARCHIVO`, p. ej. `en/index.html`) o quedar fijas como traducciones de referencia.

Si algún script del sitio anima o registra elementos al cargar, puede escuchar el evento `zona-dialectica:actualizada`, que la terminal emite cada vez que reescribe la zona (así lo hace `assets/sitio.js` en este repositorio).

## Costo aproximado

Workers AI incluye 10 000 *neurons* diarias gratuitas. Con Qwen2.5-Coder 32B ($0,66 por millón de tokens de entrada, $1,00 por millón de salida), una propuesta sobre una zona como la portada del CPE (~2 000 tokens de ida y ~2 000 de vuelta) cuesta del orden de medio centavo de dólar. El Worker cabe en el plan gratuito.

## Comandos de la terminal

| Comando | Efecto |
|---|---|
| *(texto libre)* | Pide al modelo una propuesta y la muestra en la página |
| `aplicar` | Publica la propuesta pendiente |
| `descartar` | Devuelve la página a su estado anterior |
| `historia` | Últimas intervenciones, con enlace a cada commit |
| `ver` | HTML actual de la zona editable |
| `firma <nombre>` | Firma las intervenciones (sin nombre, anónimas) |
| `ayuda`, `limpiar` | — |
