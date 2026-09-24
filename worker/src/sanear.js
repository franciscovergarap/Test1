// Saneamiento del fragmento HTML producido por el modelo.
//
// Todo lo que el modelo devuelve pasa por aquí antes de mostrarse o de
// escribirse en el repositorio. Se usa HTMLRewriter (lol-html, el analizador
// HTML nativo de Cloudflare Workers) con una lista blanca estricta: lo que no
// está permitido de forma explícita se elimina.

// Etiquetas que se eliminan junto con todo su contenido.
const ETIQUETAS_PROHIBIDAS = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
  'noscript', 'template', 'svg', 'math', 'link', 'meta', 'base', 'title',
  'head', 'html', 'body', 'portal', 'canvas', 'video', 'audio', 'source', 'track',
]);

// Etiquetas permitidas. Cualquier otra se reemplaza por su contenido.
const ETIQUETAS_PERMITIDAS = new Set([
  'section', 'article', 'aside', 'header', 'footer', 'nav', 'div', 'span', 'p',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'em', 'strong', 'b', 'i', 'u', 's',
  'small', 'mark', 'blockquote', 'q', 'cite', 'abbr', 'time', 'br', 'hr',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'img',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'code', 'pre', 'sub', 'sup', 'details', 'summary',
  'form', 'input', 'button', 'label', 'textarea', 'select', 'option',
]);

const ATRIBUTOS_GLOBALES = new Set(['class', 'id', 'title', 'lang', 'dir', 'role', 'hidden', 'style']);

const ATRIBUTOS_POR_ETIQUETA = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading']),
  time: new Set(['datetime']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
  ol: new Set(['start', 'reversed']),
  blockquote: new Set(['cite']),
  q: new Set(['cite']),
  details: new Set(['open']),
  // Los formularios quedan inertes: sin action ni method, no envían datos a terceros.
  input: new Set(['type', 'name', 'placeholder', 'required', 'value', 'checked', 'disabled']),
  button: new Set(['type', 'disabled']),
  label: new Set(['for']),
  textarea: new Set(['name', 'placeholder', 'rows', 'cols', 'required']),
  select: new Set(['name', 'required']),
  option: new Set(['value', 'selected']),
};

const ATRIBUTOS_URL = new Set(['href', 'src', 'cite']);

const TIPOS_INPUT = new Set(['text', 'email', 'search', 'checkbox', 'radio', 'submit', 'button', 'number', 'date', 'url', 'tel']);

// CSS en línea: se descarta el atributo entero si contiene algo de esto.
// position:fixed/sticky permitiría superponer contenido falso sobre toda la página.
const CSS_PELIGROSO = /url\s*\(|expression\s*\(|javascript:|@import|behaviou?r\s*:|-moz-binding|\\|position\s*:\s*(fixed|sticky)/i;

export function urlSegura(valor) {
  const v = String(valor).replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase();
  if (v === '' || v.startsWith('#') || v.startsWith('/') || v.startsWith('./') || v.startsWith('../') || v.startsWith('?')) {
    return true;
  }
  if (v.startsWith('http:') || v.startsWith('https:') || v.startsWith('mailto:')) return true;
  // Relativa sin esquema (por ejemplo "publicaciones.html#x"): no hay ":" antes de / ? #
  const corte = v.search(/[/?#]/);
  const cabeza = corte === -1 ? v : v.slice(0, corte);
  return !cabeza.includes(':');
}

export async function sanear(fragmento) {
  const informe = { eliminadas: new Set(), atributos: new Set() };

  const reescritor = new HTMLRewriter()
    .on('*', {
      element(el) {
        const etiqueta = el.tagName.toLowerCase();
        if (ETIQUETAS_PROHIBIDAS.has(etiqueta)) {
          informe.eliminadas.add(etiqueta);
          el.remove();
          return;
        }
        if (!ETIQUETAS_PERMITIDAS.has(etiqueta)) {
          informe.eliminadas.add(etiqueta);
          el.removeAndKeepContent();
          return;
        }
        const propios = ATRIBUTOS_POR_ETIQUETA[etiqueta];
        // Se copia la lista antes de modificar los atributos.
        for (const [nombreOriginal, valor] of [...el.attributes]) {
          const nombre = nombreOriginal.toLowerCase();
          const permitido =
            ATRIBUTOS_GLOBALES.has(nombre) ||
            nombre.startsWith('aria-') ||
            (nombre.startsWith('data-') && /^data-[a-z0-9-]+$/.test(nombre)) ||
            (propios && propios.has(nombre));
          if (
            !permitido ||
            (ATRIBUTOS_URL.has(nombre) && !urlSegura(valor)) ||
            (nombre === 'style' && CSS_PELIGROSO.test(valor)) ||
            (nombre === 'type' && etiqueta === 'input' && !TIPOS_INPUT.has(valor.toLowerCase()))
          ) {
            informe.atributos.add(nombre);
            el.removeAttribute(nombreOriginal);
          }
        }
        if (etiqueta === 'a' && el.getAttribute('target')) {
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer');
        }
      },
      // Los comentarios se eliminan siempre: impide que el fragmento
      // falsifique los marcadores que delimitan la zona editable.
      comments(c) {
        c.remove();
      },
    })
    .onDocument({
      doctype() {},
      comments(c) {
        c.remove();
      },
    });

  const html = await reescritor
    .transform(new Response(fragmento, { headers: { 'content-type': 'text/html; charset=utf-8' } }))
    .text();

  return {
    html: html.trim(),
    eliminadas: [...informe.eliminadas],
    atributos: [...informe.atributos],
  };
}
