// Control de integridad: la página puede transformarse por completo en su
// estética y organización, pero ninguna intervención puede borrar información.
//
// Se inventaría el HTML antes y después:
//   - enlaces (href), recursos (src de imágenes y vídeos) e identificadores (id):
//     deben conservarse todos; de ellos dependen la navegación, las anclas
//     de las publicaciones y los scripts del sitio;
//   - vocabulario del texto: puede reescribirse, pero no reducirse más allá
//     de un umbral (por defecto, se conserva al menos el 95 % de las palabras).

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodificar(texto) {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entera, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : entera;
    }
    return ENTIDADES[e.toLowerCase()] ?? entera;
  });
}

export function palabrasDe(texto) {
  return decodificar(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9Ѐ-ӿ؀-ۿ一-鿿]+/)
    .filter((p) => p.length >= 4 || /[一-鿿]/.test(p));
}

function normalizarUrl(u) {
  return decodificar(String(u)).trim().replace(/\/+$/, '');
}

export async function inventariar(html) {
  const inv = { enlaces: new Set(), recursos: new Set(), ids: new Set(), palabras: new Set() };
  let texto = '';
  await new HTMLRewriter()
    .on('*', {
      element(el) {
        // Separa las palabras de elementos contiguos (<b>x</b><span>y</span>).
        texto += ' ';
        if (!el.selfClosing && el.canHaveContent) el.onEndTag(() => void (texto += ' '));
        const href = el.getAttribute('href');
        const src = el.getAttribute('src');
        const id = el.getAttribute('id');
        if (href) inv.enlaces.add(normalizarUrl(href));
        if (src) inv.recursos.add(normalizarUrl(src));
        if (id) inv.ids.add(id);
        // Los textos alternativos y títulos también son información.
        for (const a of ['alt', 'title', 'aria-label', 'placeholder']) {
          const v = el.getAttribute(a);
          if (v) texto += ` ${v} `;
        }
      },
    })
    .onDocument({
      text(t) {
        texto += t.text;
      },
    })
    .transform(new Response(html))
    .text();
  for (const p of palabrasDe(texto)) inv.palabras.add(p);
  return inv;
}

export function compararInventarios(antes, despues, umbral = 0.95) {
  const faltan = (a, b) => [...a].filter((x) => !b.has(x));
  const enlaces = faltan(antes.enlaces, despues.enlaces);
  const recursos = faltan(antes.recursos, despues.recursos);
  const ids = faltan(antes.ids, despues.ids);
  const palabras = faltan(antes.palabras, despues.palabras);
  const cobertura = antes.palabras.size ? 1 - palabras.length / antes.palabras.size : 1;
  return {
    enlaces,
    recursos,
    ids,
    palabras,
    cobertura,
    integra: !enlaces.length && !recursos.length && !ids.length && cobertura >= umbral,
  };
}

export function describirPerdidas(c, max = 8) {
  const lista = (xs) => xs.slice(0, max).join(', ') + (xs.length > max ? ` y ${xs.length - max} más` : '');
  const partes = [];
  if (c.enlaces.length) partes.push(`enlaces eliminados: ${lista(c.enlaces)}`);
  if (c.recursos.length) partes.push(`imágenes o vídeos eliminados: ${lista(c.recursos)}`);
  if (c.ids.length) partes.push(`identificadores eliminados: ${lista(c.ids)}`);
  if (c.palabras.length) {
    partes.push(`se conserva el ${Math.round(c.cobertura * 1000) / 10} % del vocabulario; faltan: ${lista(c.palabras)}`);
  }
  return partes.join('; ');
}
