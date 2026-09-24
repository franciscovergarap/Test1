// Delimitación de la zona editable dentro de index.html.
// Solo el HTML entre estos dos comentarios puede ser modificado por la terminal;
// cabecera, navegación, estilos, scripts y pie quedan fuera del alcance del modelo.

export const INICIO = '<!-- ZONA-DIALECTICA:INICIO -->';
export const FIN = '<!-- ZONA-DIALECTICA:FIN -->';

export function extraerZona(documento) {
  const i = documento.indexOf(INICIO);
  const f = documento.indexOf(FIN);
  if (i === -1 || f === -1 || f < i) {
    throw new Error('index.html no contiene los marcadores de la zona dialéctica.');
  }
  if (documento.indexOf(INICIO, i + 1) !== -1 || documento.indexOf(FIN, f + 1) !== -1) {
    throw new Error('index.html contiene marcadores de zona duplicados.');
  }
  return {
    antes: documento.slice(0, i + INICIO.length),
    zona: documento.slice(i + INICIO.length, f),
    despues: documento.slice(f),
  };
}

export function reemplazarZona(documento, fragmento) {
  const { antes, despues } = extraerZona(documento);
  return `${antes}\n${fragmento.trim()}\n${despues}`;
}

// Limpia la respuesta del modelo: quita bloques ``` y, si devolvió el documento
// completo pese a las instrucciones, recupera solo la zona.
export function limpiarRespuesta(texto) {
  let t = String(texto || '').trim();
  const bloque = t.match(/```(?:html)?\s*\n([\s\S]*?)```/i);
  if (bloque) t = bloque[1].trim();
  if (t.includes(INICIO) && t.includes(FIN)) {
    t = t.slice(t.indexOf(INICIO) + INICIO.length, t.indexOf(FIN)).trim();
  }
  return t;
}
