# Terminal dialéctica

El sitio del CPE deja de ser un objeto terminado. En cada página hay una terminal (botón `>_ Intervenir` o `>_ Preguntar`, o tecla `` ` `` / `º`) con dos usos:

1. **Intervenir** (páginas abiertas, por ahora `index.html`). Cualquier visitante describe en lenguaje natural un cambio y un modelo de código reescribe la página **completa**: su estética (una hoja de estilos propia de la página) y su organización (todo el `<body>`: barra lateral, navegación, contenido y pie). La única condición es que **no se borre información**. La persona ve la propuesta aplicada *in situ* y decide si la publica o la descarta. Cada intervención queda en git con su instrucción, su firma (opcional) y el modelo que la ejecutó: el repositorio es el archivo de la página en proceso.
2. **Preguntar** (todas las páginas). Un modelo lector explica el contenido de la página, los hallazgos de un paper a partir de su **texto completo**, o de qué trata un vídeo. Junto a cada publicación aparece un botón «Explicar hallazgos ▸» y junto a cada vídeo «¿De qué trata? ▸».

## Arquitectura

```
navegador (GitHub Pages)              Cloudflare Worker                              GitHub
┌─────────────────────┐ instrucción  ┌──────────────────────────────────┐   lee    ┌───────────────────┐
│ terminal/terminal.js│ ───────────▶ │ Llama Guard (filtro)             │ ◀─────── │ index.html        │
│                     │              │ Qwen2.5-Coder reescribe la página│          │ assets/style.css  │
│ vista previa in situ│ ◀─────────── │ saneador + control de integridad │          │                   │
│ «aplicar»           │ ───────────▶ │ firma HMAC · verifica · escribe  │ ───────▶ │ commit o PR       │
│                     │              │                                  │          │                   │
│ «?» / «Explicar ▸»  │ ───────────▶ │ Llama 4 Scout lee página + paper │ ◀─────── │ biblioteca.json   │
└─────────────────────┘  pregunta    └──────────────────────────────────┘          │ papers/markdown   │
                                                                                   └───────────────────┘
```

- **Editor**: `@cf/qwen/qwen2.5-coder-32b-instruct` (variable `MODELO`). Recibe la hoja común `assets/style.css` como referencia, la hoja propia de la página y su `<body>`.
- **Lector**: `@cf/meta/llama-4-scout-17b-16e-instruct` (variable `MODELO_LECTOR`), con 131 000 tokens de contexto: admite un paper completo.
- **Qué es editable**: todo lo que está entre `<!-- ZONA-DIALECTICA:INICIO -->` (justo después de `<body>`) y `<!-- ZONA-DIALECTICA:FIN -->` (justo antes de los scripts), más `<style id="estilo-dialectico">` en `<head>`. Metadatos, política de seguridad, hojas comunes y scripts quedan fuera del alcance del modelo.
- **Textos completos**: `terminal/biblioteca.json` vincula cada publicación con su texto en `papers/markdown` del repositorio del CPE. Hoy 19 de 46 publicaciones tienen texto completo; las demás se explican solo a partir de sus metadatos, y la terminal lo indica. Para regenerar el índice cuando se agreguen papers: `python3 scripts/generar_biblioteca.py <cpe-repositorio>/papers/markdown`.
- **Vídeos**: el modelo solo conoce su título y contexto, y lo declara. Si se agrega una transcripción en `transcripciones/<id-de-YouTube>.md`, la usa.

## Control de integridad: transformar sin borrar

Antes de mostrar una propuesta y otra vez antes de publicarla, el Worker inventaría la página original y la propuesta:

- **Deben sobrevivir todos** los enlaces (`href`), imágenes y vídeos (`src`) e identificadores (`id`). Garantizan la navegación, las anclas de cada publicación y el funcionamiento de los scripts del sitio.
- **El vocabulario puede reescribirse, no reducirse**: debe conservarse al menos el 95 % de las palabras de la página (`UMBRAL_TEXTO`). Se puede añadir sin límite.

Si una propuesta no cumple, se descarta y la terminal explica qué se habría perdido. Si reescribe algo dentro del margen, lo advierte antes de publicar.

## Otras salvaguardas

| Riesgo | Medida |
|---|---|
| Inyección de código | Saneador de lista blanca (`worker/src/sanear.js`): elimina scripts, atributos `on*`, URLs `javascript:`/`data:` e iframes que no sean de YouTube. El CSS propio rechaza `url()`, `@import`, `position:fixed` y cualquier regla sobre la terminal (nadie puede ocultarla a los demás). La portada declara una CSP `script-src 'self'`: aunque algo se filtrara, no se ejecutaría. |
| Manipular la propuesta en el navegador | `/aplicar` solo acepta el HTML y el CSS exactos que el servidor generó y firmó (HMAC), válidos 30 minutos. |
| Dos personas editando a la vez | Si la página cambió entre la propuesta y la publicación, se rechaza y hay que proponer sobre la versión nueva. |
| Contenido ofensivo o spam | Llama Guard 3 filtra instrucciones y preguntas; el editor responde `RECHAZO` ante odio, difamación, publicidad, etc. |
| Abuso masivo | 6 peticiones por minuto e IP; solo se aceptan peticiones desde los orígenes declarados. |
| Respuestas inventadas | El lector responde solo con el material entregado y declara cuándo no tiene el texto completo o la transcripción. |
| Vandalismo que pasa los filtros | Todo queda en git y se revierte con `git revert`. El modo `revision` convierte cada intervención en un pull request. |

## Modos de gobierno

- `MODO = "directo"`: cada intervención se publica de inmediato como commit.
- `MODO = "revision"`: cada intervención abre un pull request que alguien del CPE acepta o rechaza.

Para abrir otra página a intervenciones: agrégala a `EDITABLES` y ponle los marcadores y el `<style id="estilo-dialectico">` (ver `index.html`).

## Puesta en marcha

Requisitos: cuenta gratuita de Cloudflare y Node 20 o superior.

1. **Token de GitHub.** En GitHub → Settings → Developer settings → Fine-grained tokens, crea un token limitado al repositorio del sitio con permiso *Contents: Read and write* (y *Pull requests: Read and write* para el modo `revision`).
2. **Configura** `worker/wrangler.toml`: `REPO_DUENO`, `REPO_NOMBRE`, `RAIZ_SITIO`, `MODO` y `ORIGENES_PERMITIDOS`.
3. **Despliega el Worker:**
   ```sh
   cd worker
   npm install
   npx wrangler login
   npx wrangler secret put GITHUB_TOKEN     # pega el token
   npx wrangler secret put FIRMA_SECRETA    # pega el resultado de: openssl rand -hex 32
   npx wrangler deploy
   ```
   Wrangler imprime una URL del tipo `https://terminal-dialectica.<subdominio>.workers.dev`.
4. **Conecta las páginas**: escribe esa URL en `data-servidor` de `<script src="terminal/terminal.js" …>` en cada página.
5. Commit y push. GitHub Pages redespliega y la terminal queda activa.

Pruebas del Worker, en el runtime real de Workers con GitHub y los modelos simulados: `cd worker && npm test`.

## Llevarlo a cpe-udla/cpe-repositorio

Este repositorio (Test1) es una réplica del sitio (`docs/` del repositorio del CPE, en la raíz) con la terminal integrada. Para trasladarlo:

1. Copia `terminal/` a `docs/terminal/` y `scripts/generar_biblioteca.py` a `scripts/`.
2. Aplica a las páginas de `docs/` los mismos cambios que tienen aquí (`git diff` contra el commit que copió el sitio): la hoja `terminal/terminal.css` y el script `terminal/terminal.js` en las siete páginas en castellano; en `index.html`, además, la CSP, el `<style id="estilo-dialectico">` y los marcadores de zona.
3. En `worker/wrangler.toml`: `REPO_DUENO = "cpe-udla"`, `REPO_NOMBRE = "cpe-repositorio"`, `RAIZ_SITIO = "docs"`, `ORIGENES_PERMITIDOS = "https://cpe-udla.github.io"`.

Las versiones en otros idiomas (`en/`, `fr/`, …) pueden recibir la terminal del mismo modo; el lector responde en el idioma de la pregunta.

## Costo aproximado

Workers AI incluye 10 000 *neurons* diarias gratuitas. Una intervención sobre la portada (~9 000 tokens de entrada y ~5 000 de salida con Qwen2.5-Coder) cuesta del orden de un centavo de dólar; una explicación de un paper completo con Llama 4 Scout (~25 000 tokens de entrada), menos de un centavo. El Worker cabe en el plan gratuito.

## Comandos de la terminal

| Comando | Efecto |
|---|---|
| *(texto libre)* | En modo intervenir: propuesta de cambio con vista previa. En modo preguntar: respuesta. |
| `? <pregunta>` | Pregunta sobre la página, un paper o un vídeo (en cualquier modo) |
| `aplicar` / `descartar` | Publica la propuesta pendiente / vuelve al estado anterior |
| `historia` | Últimas intervenciones sobre la página, con enlace a cada commit |
| `ver` | HTML actual de la página |
| `firma <nombre>` | Firma las intervenciones (sin nombre, anónimas) |
| `modo preguntar` / `modo intervenir` | Cambia el modo |
| `ayuda`, `limpiar` | — |
