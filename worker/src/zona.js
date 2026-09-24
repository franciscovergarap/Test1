// Partes editables de una página.
//
// Todo el <body> visible (barra lateral, navegación, contenido y pie) está entre
// los marcadores ZONA-DIALECTICA, y la estética propia de la página vive en
// <style id="estilo-dialectico"> dentro de <head>. Fuera de eso solo quedan la
// infraestructura: metadatos, política de seguridad, hojas de estilo y scripts.

export const INICIO = '<!-- ZONA-DIALECTICA:INICIO -->';
export const FIN = '<!-- ZONA-DIALECTICA:FIN -->';
const ESTILO = /<style id="estilo-dialectico">([\s\S]*?)<\/style>/g;

export function extraerPartes(documento) {
  const i = documento.indexOf(INICIO);
  const f = documento.indexOf(FIN);
  if (i === -1 || f === -1 || f < i) {
    throw new Error('La página no contiene los marcadores de la zona dialéctica.');
  }
  if (documento.indexOf(INICIO, i + 1) !== -1 || documento.indexOf(FIN, f + 1) !== -1) {
    throw new Error('La página contiene marcadores de zona duplicados.');
  }
  const estilos = [...documento.matchAll(ESTILO)];
  if (estilos.length !== 1) throw new Error('La página debe tener exactamente un <style id="estilo-dialectico">.');
  return {
    cuerpo: documento.slice(i + INICIO.length, f).trim(),
    css: estilos[0][1].trim(),
  };
}

export function recomponer(documento, { cuerpo, css }) {
  extraerPartes(documento); // valida la estructura
  const i = documento.indexOf(INICIO) + INICIO.length;
  const f = documento.indexOf(FIN);
  const conCuerpo = `${documento.slice(0, i)}\n${cuerpo.trim()}\n${documento.slice(f)}`;
  const bloque = css.trim() ? `<style id="estilo-dialectico">\n${css.trim()}\n</style>` : '<style id="estilo-dialectico"></style>';
  return conCuerpo.replace(ESTILO, () => bloque);
}

// Bloques extensos y repetitivos (como el listado de 46 publicaciones de la barra
// lateral) se marcan con data-compacto="nombre". Antes de enviarlos al modelo se
// vacían y después se restituyen: el modelo puede moverlos o darles estilo, pero no
// necesita copiarlos, lo que reduce su respuesta a una fracción y evita que se agote
// el tiempo de generación.
const BLOQUE_COMPACTO = /<([a-z][a-z0-9]*)([^>]*\sdata-compacto="([a-z0-9-]+)"[^>]*)>([\s\S]*?)<\/\1>/gi;

export function compactar(cuerpo) {
  const guardados = {};
  const compacto = cuerpo.replace(BLOQUE_COMPACTO, (_, etiqueta, atributos, nombre, contenido) => {
    guardados[nombre] = contenido;
    return `<${etiqueta}${atributos}></${etiqueta}>`;
  });
  return { compacto, guardados };
}

export function restituir(cuerpo, guardados) {
  return cuerpo.replace(BLOQUE_COMPACTO, (entero, etiqueta, atributos, nombre, contenido) =>
    nombre in guardados && !contenido.trim() ? `<${etiqueta}${atributos}>${guardados[nombre]}</${etiqueta}>` : entero,
  );
}

// Separa la respuesta del modelo en CSS y cuerpo. El formato pedido es:
//   <style id="estilo-dialectico">…</style>
//   …HTML del cuerpo…
export function separarRespuesta(texto) {
  let t = String(texto || '').trim();
  const bloque = t.match(/```(?:html)?\s*\n([\s\S]*?)```/i);
  if (bloque) t = bloque[1].trim();
  // Si devolvió el documento completo pese a las instrucciones, se toma lo que hay entre marcadores.
  let css = '';
  t = t.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, contenido) => {
    css += `${contenido.trim()}\n`;
    return '';
  });
  if (t.includes(INICIO) && t.includes(FIN)) {
    t = t.slice(t.indexOf(INICIO) + INICIO.length, t.indexOf(FIN));
  } else {
    const cuerpo = t.match(/<body[^>]*>([\s\S]*?)(<\/body>|$)/i);
    if (cuerpo) t = cuerpo[1];
  }
  return { cuerpo: t.trim(), css: css.trim() };
}
