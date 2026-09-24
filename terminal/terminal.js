// Terminal dialéctica — cliente.
//
// Se incrusta en la portada con:
//   <link rel="stylesheet" href="terminal/terminal.css">
//   <script src="terminal/terminal.js" data-servidor="https://<worker>.workers.dev" defer></script>
//
// La zona que se puede editar está delimitada en el HTML por los comentarios
// <!-- ZONA-DIALECTICA:INICIO --> y <!-- ZONA-DIALECTICA:FIN -->.
(function () {
  'use strict';

  const guion = document.currentScript;
  const SERVIDOR = ((guion && guion.dataset.servidor) || '').replace(/\/+$/, '');
  const CLAVE_FIRMA = 'terminal-dialectica:firma';

  const estado = {
    propuesta: null, // { fragmento, token, modo }
    original: null, // nodos de la zona antes de la vista previa
    ocupado: false,
    historial: [],
    posicion: 0,
  };

  // ── Zona editable en el DOM ─────────────────────────────────

  function marcadores() {
    const recorrido = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
    let inicio = null;
    let fin = null;
    while (recorrido.nextNode()) {
      const v = recorrido.currentNode.nodeValue.trim();
      if (v === 'ZONA-DIALECTICA:INICIO') inicio = recorrido.currentNode;
      if (v === 'ZONA-DIALECTICA:FIN') fin = recorrido.currentNode;
    }
    return inicio && fin ? { inicio, fin } : null;
  }

  function nodosZona() {
    const m = marcadores();
    if (!m) return [];
    const nodos = [];
    for (let n = m.inicio.nextSibling; n && n !== m.fin; n = n.nextSibling) nodos.push(n);
    return nodos;
  }

  function sustituirZona(nodosNuevos) {
    const m = marcadores();
    if (!m) return false;
    nodosZona().forEach((n) => n.remove());
    nodosNuevos.forEach((n) => m.fin.parentNode.insertBefore(n, m.fin));
    document.dispatchEvent(new CustomEvent('zona-dialectica:actualizada'));
    return true;
  }

  function nodosDesdeHtml(html) {
    // El HTML llega saneado por el servidor; además la política CSP de la
    // página impide ejecutar scripts en línea.
    const plantilla = document.createElement('template');
    plantilla.innerHTML = html;
    return [...plantilla.content.childNodes];
  }

  // ── Interfaz ────────────────────────────────────────────────

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'td-lanzador';
  boton.setAttribute('aria-expanded', 'false');
  boton.setAttribute('aria-controls', 'td-panel');
  boton.title = 'Intervenir la portada (tecla º o `)';
  boton.textContent = '>_ intervenir';

  const panel = document.createElement('section');
  panel.id = 'td-panel';
  panel.className = 'td-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Terminal dialéctica');

  const barra = document.createElement('header');
  barra.className = 'td-barra';
  const titulo = document.createElement('span');
  titulo.textContent = 'terminal dialéctica — la portada en proceso';
  const cerrar = document.createElement('button');
  cerrar.type = 'button';
  cerrar.className = 'td-cerrar';
  cerrar.setAttribute('aria-label', 'Cerrar terminal');
  cerrar.textContent = '×';
  barra.append(titulo, cerrar);

  const registro = document.createElement('div');
  registro.className = 'td-registro';
  registro.setAttribute('role', 'log');
  registro.setAttribute('aria-live', 'polite');

  const formulario = document.createElement('form');
  formulario.className = 'td-linea';
  const indicador = document.createElement('label');
  indicador.className = 'td-indicador';
  indicador.htmlFor = 'td-entrada';
  indicador.textContent = 'espacio:~$';
  const entrada = document.createElement('input');
  entrada.id = 'td-entrada';
  entrada.className = 'td-entrada';
  entrada.autocomplete = 'off';
  entrada.spellcheck = false;
  entrada.maxLength = 500;
  entrada.placeholder = 'describe un cambio o escribe «ayuda»';
  formulario.append(indicador, entrada);

  panel.append(barra, registro, formulario);
  document.body.append(boton, panel);

  function escribir(texto, clase) {
    const linea = document.createElement('div');
    linea.className = `td-l ${clase || ''}`;
    linea.textContent = texto;
    registro.append(linea);
    registro.scrollTop = registro.scrollHeight;
    return linea;
  }

  function enlace(texto, url) {
    const linea = document.createElement('div');
    linea.className = 'td-l';
    if (/^https:\/\//.test(url)) {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = texto;
      linea.append(a);
    } else {
      linea.textContent = texto;
    }
    registro.append(linea);
    registro.scrollTop = registro.scrollHeight;
  }

  function abrir() {
    panel.hidden = false;
    boton.setAttribute('aria-expanded', 'true');
    entrada.focus();
  }

  function ocultar() {
    panel.hidden = true;
    boton.setAttribute('aria-expanded', 'false');
    boton.focus();
  }

  boton.addEventListener('click', () => (panel.hidden ? abrir() : ocultar()));
  cerrar.addEventListener('click', ocultar);
  document.addEventListener('keydown', (e) => {
    const escribiendo = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.key === '`' || e.key === 'º') && !escribiendo) {
      e.preventDefault();
      abrir();
    } else if (e.key === 'Escape' && !panel.hidden) {
      ocultar();
    }
  });

  entrada.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && estado.posicion > 0) {
      estado.posicion -= 1;
      entrada.value = estado.historial[estado.posicion];
      e.preventDefault();
    } else if (e.key === 'ArrowDown' && estado.posicion < estado.historial.length) {
      estado.posicion += 1;
      entrada.value = estado.historial[estado.posicion] || '';
      e.preventDefault();
    }
  });

  formulario.addEventListener('submit', (e) => {
    e.preventDefault();
    const texto = entrada.value.trim();
    if (!texto || estado.ocupado) return;
    estado.historial.push(texto);
    estado.posicion = estado.historial.length;
    entrada.value = '';
    escribir(`espacio:~$ ${texto}`, 'td-eco');
    ejecutar(texto);
  });

  // ── Comandos ────────────────────────────────────────────────

  function leerFirma() {
    try {
      return localStorage.getItem(CLAVE_FIRMA) || '';
    } catch (_) {
      return '';
    }
  }

  function guardarFirma(valor) {
    try {
      if (valor) localStorage.setItem(CLAVE_FIRMA, valor);
      else localStorage.removeItem(CLAVE_FIRMA);
    } catch (_) {
      /* sin almacenamiento: la firma dura lo que dure la página */
    }
    estado.firmaVolatil = valor;
  }

  const COMANDOS = {
    ayuda() {
      [
        'Esta portada no está terminada: cualquiera puede transformarla.',
        'Describe en lenguaje natural el cambio que quieres, por ejemplo:',
        '  «añade una tarjeta sobre el seminario de etnografía»',
        '  «reescribe el subtítulo en clave lefebvriana»',
        'Verás una vista previa en la página. Luego:',
        '  aplicar          publica la intervención (queda registrada en git)',
        '  descartar        vuelve a la versión anterior',
        'Otros comandos:',
        '  historia         últimas intervenciones',
        '  ver              HTML actual de la zona editable',
        '  firma <nombre>   firma tus intervenciones (vacío = anónima)',
        '  limpiar          limpia la terminal',
      ].forEach((l) => escribir(l, 'td-tenue'));
    },
    limpiar() {
      registro.textContent = '';
    },
    ver() {
      const html = nodosZona()
        .map((n) => (n.nodeType === Node.ELEMENT_NODE ? n.outerHTML : n.textContent))
        .join('')
        .trim();
      escribir(html || '(zona vacía)', 'td-codigo');
    },
    firma(arg) {
      guardarFirma(arg.slice(0, 40));
      escribir(arg ? `Tus intervenciones irán firmadas como «${arg.slice(0, 40)}».` : 'Tus intervenciones serán anónimas.');
    },
    async historia() {
      const datos = await pedir('GET', '/historia');
      if (!datos.intervenciones.length) return escribir('Sin intervenciones todavía.');
      datos.intervenciones.forEach((k) => {
        const fecha = k.fecha ? new Date(k.fecha).toLocaleString() : '';
        enlace(`${k.sha}  ${fecha}  ${k.mensaje}`, k.url);
      });
    },
    async aplicar() {
      if (!estado.propuesta) return escribir('No hay ninguna propuesta pendiente.', 'td-aviso');
      escribir('Publicando la intervención…', 'td-tenue');
      const r = await pedir('POST', '/aplicar', {
        fragmento: estado.propuesta.fragmento,
        token: estado.propuesta.token,
      });
      estado.propuesta = null;
      estado.original = null;
      if (r.modo === 'revision') {
        escribir('Propuesta enviada para revisión del CPE. Se publicará cuando sea aceptada:', 'td-ok');
      } else {
        escribir('Intervención publicada. Será visible para todas las personas cuando termine el despliegue (≈1 min):', 'td-ok');
      }
      enlace(r.url, r.url);
    },
    descartar() {
      if (!estado.propuesta) return escribir('No hay ninguna propuesta pendiente.', 'td-aviso');
      sustituirZona(estado.original);
      estado.propuesta = null;
      estado.original = null;
      escribir('Propuesta descartada. La página vuelve a su estado anterior.');
    },
  };

  async function proponer(instruccion) {
    if (estado.propuesta) {
      // Una nueva instrucción reemplaza la propuesta pendiente: se parte de la versión publicada.
      sustituirZona(estado.original);
      estado.propuesta = null;
    }
    const espera = escribir('El modelo está reescribiendo la portada…', 'td-tenue td-pulso');
    try {
      const r = await pedir('POST', '/proponer', { instruccion, firma: estado.firmaVolatil ?? leerFirma() });
      estado.original = nodosZona().map((n) => n.cloneNode(true));
      estado.propuesta = r;
      sustituirZona(nodosDesdeHtml(r.fragmento));
      (r.advertencias || []).forEach((a) => escribir(`! ${a}`, 'td-aviso'));
      escribir('Vista previa aplicada en la página. Escribe «aplicar» para publicarla o «descartar» para volver atrás.', 'td-ok');
    } finally {
      espera.remove();
    }
  }

  async function ejecutar(texto) {
    const [cabeza, ...resto] = texto.split(/\s+/);
    const comando = COMANDOS[cabeza.toLowerCase()];
    const arg = resto.join(' ');
    estado.ocupado = true;
    entrada.disabled = true;
    try {
      if (comando && (cabeza.toLowerCase() === 'firma' || !arg)) {
        await comando(arg);
      } else if (!SERVIDOR) {
        escribir('La terminal no está conectada a ningún servidor (falta data-servidor).', 'td-error');
      } else {
        await proponer(texto);
      }
    } catch (e) {
      escribir(e.message || 'Algo falló.', 'td-error');
    } finally {
      estado.ocupado = false;
      entrada.disabled = false;
      if (!panel.hidden) entrada.focus();
    }
  }

  async function pedir(metodo, ruta, cuerpo) {
    if (!SERVIDOR) throw new Error('La terminal no está conectada a ningún servidor.');
    let r;
    try {
      r = await fetch(SERVIDOR + ruta, {
        method: metodo,
        headers: cuerpo ? { 'Content-Type': 'application/json' } : {},
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      });
    } catch (_) {
      throw new Error('No se pudo contactar al servidor de la terminal.');
    }
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(datos.error || `El servidor respondió ${r.status}.`);
    return datos;
  }

  escribir('Terminal dialéctica. Esta portada es un espacio producido colectivamente.', 'td-tenue');
  escribir('Escribe «ayuda» para empezar.', 'td-tenue');
  if (!marcadores()) escribir('Esta página no declara una zona editable.', 'td-error');
})();
