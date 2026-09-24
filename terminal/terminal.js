// Terminal dialéctica — cliente.
//
// Se incrusta en cada página con:
//   <link rel="stylesheet" href="terminal/terminal.css">
//   <script src="terminal/terminal.js" data-servidor="https://<worker>.workers.dev"
//           data-reiniciar="assets/site.js" defer></script>
//
// Dos modos:
//   intervenir  en páginas con zona dialéctica (<!-- ZONA-DIALECTICA:INICIO/FIN -->):
//               la persona transforma la página y, si quiere, publica el cambio.
//   preguntar   en todas las páginas: un modelo lector explica el contenido, un
//               paper o un vídeo. Junto a cada publicación y vídeo aparece un botón.
(function () {
  'use strict';

  const guion = document.currentScript;
  const SERVIDOR = ((guion && guion.dataset.servidor) || '').replace(/\/+$/, '');
  // Raíz del sitio: la carpeta que contiene terminal/terminal.js.
  const RAIZ = new URL('..', guion ? guion.src : location.href);
  const REINICIAR = ((guion && guion.dataset.reiniciar) || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const CLAVE_FIRMA = 'terminal-dialectica:firma';

  function paginaActual() {
    let ruta = decodeURIComponent(location.pathname);
    if (ruta.startsWith(RAIZ.pathname)) ruta = ruta.slice(RAIZ.pathname.length);
    ruta = ruta.replace(/^\/+/, '');
    return !ruta || ruta.endsWith('/') ? `${ruta}index.html` : ruta;
  }

  const PAGINA = paginaActual();
  const estado = {
    modo: 'preguntar',
    propuesta: null, // { cuerpo, css, token, modo }
    original: null, // { nodos, css } antes de la vista previa
    ocupado: false,
    historial: [],
    posicion: 0,
    firma: undefined,
  };

  // ── Zona editable en el DOM ─────────────────────────────────

  function marcadores() {
    let inicio = null;
    let fin = null;
    for (const n of document.body.childNodes) {
      if (n.nodeType !== Node.COMMENT_NODE) continue;
      const v = n.nodeValue.trim();
      if (v === 'ZONA-DIALECTICA:INICIO') inicio = n;
      if (v === 'ZONA-DIALECTICA:FIN') fin = n;
    }
    return inicio && fin ? { inicio, fin } : null;
  }

  function nodosZona() {
    const m = marcadores();
    const nodos = [];
    if (m) for (let n = m.inicio.nextSibling; n && n !== m.fin; n = n.nextSibling) nodos.push(n);
    return nodos;
  }

  function hojaPropia() {
    return document.getElementById('estilo-dialectico');
  }

  function sustituirZona(nodos, css) {
    const m = marcadores();
    if (!m) return;
    nodosZona().forEach((n) => n.remove());
    nodos.forEach((n) => m.fin.parentNode.insertBefore(n, m.fin));
    if (hojaPropia()) hojaPropia().textContent = css || '';
    document.body.classList.remove('menu-open');
    // Los scripts del sitio se enlazan a los elementos al cargar: se vuelven a ejecutar sobre los nuevos.
    REINICIAR.forEach((src) => {
      const s = document.createElement('script');
      s.src = `${new URL(src, RAIZ).href}?r=${Date.now()}`;
      s.onload = () => s.remove();
      document.body.append(s);
    });
    decorar();
    document.dispatchEvent(new CustomEvent('zona-dialectica:actualizada'));
  }

  function nodosDesdeHtml(html) {
    // El HTML llega saneado por el servidor y la política CSP de la página impide
    // ejecutar scripts en línea.
    const plantilla = document.createElement('template');
    plantilla.innerHTML = html;
    return [...plantilla.content.childNodes];
  }

  function htmlZonaActual() {
    return nodosZona()
      .map((n) => {
        if (n.nodeType !== Node.ELEMENT_NODE) return n.nodeType === Node.TEXT_NODE ? n.textContent : '';
        const copia = n.cloneNode(true);
        copia.querySelectorAll('.td-explicar').forEach((b) => b.remove());
        return copia.outerHTML;
      })
      .join('')
      .trim();
  }

  // ── Interfaz ────────────────────────────────────────────────

  const editable = Boolean(marcadores());
  estado.modo = editable ? 'intervenir' : 'preguntar';

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'td-lanzador';
  boton.setAttribute('aria-expanded', 'false');
  boton.setAttribute('aria-controls', 'td-panel');
  boton.title = 'Abrir la terminal (tecla º o `)';
  boton.textContent = editable ? '>_ Intervenir' : '>_ Preguntar';

  const panel = document.createElement('section');
  panel.id = 'td-panel';
  panel.className = 'td-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Terminal dialéctica');

  const barra = document.createElement('header');
  barra.className = 'td-barra';
  const titulo = document.createElement('span');
  titulo.textContent = editable ? 'Terminal dialéctica — página en proceso' : 'Terminal dialéctica — preguntar';
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
  const entrada = document.createElement('input');
  entrada.id = 'td-entrada';
  entrada.className = 'td-entrada';
  entrada.autocomplete = 'off';
  entrada.spellcheck = false;
  entrada.maxLength = 500;
  formulario.append(indicador, entrada);

  panel.append(barra, registro, formulario);
  document.body.append(boton, panel);

  function fijarModo(modo) {
    estado.modo = modo;
    indicador.textContent = modo === 'intervenir' ? 'espacio:~$' : 'espacio:~?';
    entrada.placeholder = modo === 'intervenir' ? 'describe un cambio, o «?» + pregunta' : 'haz una pregunta sobre esta página';
  }
  fijarModo(estado.modo);

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
    escribir(`${indicador.textContent} ${texto}`, 'td-eco');
    ejecutar(texto);
  });

  // ── Botones «explicar» en publicaciones y vídeos ────────────

  function botonExplicar(etiqueta, pregunta, ancla) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'td-explicar';
    b.textContent = etiqueta;
    b.addEventListener('click', () => {
      abrir();
      if (estado.ocupado) return;
      escribir(`espacio:~? ${pregunta}`, 'td-eco');
      ejecutar(`?${pregunta}`, ancla);
    });
    return b;
  }

  function decorar() {
    document.querySelectorAll('article.pub[id]').forEach((art) => {
      if (art.querySelector('.td-explicar')) return;
      const t = art.querySelector('h3');
      if (!t) return;
      art.append(botonExplicar('Explicar hallazgos ▸', `Explícame los principales hallazgos de «${t.textContent.trim()}»`, art.id));
    });
    document.querySelectorAll('figure.video').forEach((fig) => {
      if (fig.querySelector('.td-explicar')) return;
      const marco = fig.querySelector('iframe[src*="/embed/"]');
      const t = fig.querySelector('figcaption b');
      const id = marco && (marco.getAttribute('src').match(/\/embed\/([A-Za-z0-9_-]+)/) || [])[1];
      if (!id || !t) return;
      (fig.querySelector('figcaption') || fig).append(
        botonExplicar('¿De qué trata? ▸', `¿De qué trata el vídeo «${t.textContent.trim()}»?`, `video:${id}`),
      );
    });
  }

  // ── Comandos ────────────────────────────────────────────────

  function leerFirma() {
    if (estado.firma !== undefined) return estado.firma;
    try {
      return localStorage.getItem(CLAVE_FIRMA) || '';
    } catch (_) {
      return '';
    }
  }

  function guardarFirma(valor) {
    estado.firma = valor;
    try {
      if (valor) localStorage.setItem(CLAVE_FIRMA, valor);
      else localStorage.removeItem(CLAVE_FIRMA);
    } catch (_) {
      /* sin almacenamiento: la firma dura lo que dure la visita */
    }
  }

  const COMANDOS = {
    ayuda() {
      const lineas = editable
        ? [
            'Esta página no está terminada: cualquiera puede transformarla,',
            'en su estética y en su organización, sin borrar información.',
            'Describe el cambio, por ejemplo:',
            '  «convierte la portada en una línea de tiempo de la investigación»',
            '  «reorganiza las tarjetas en una sola columna tipográfica»',
            'Verás una vista previa. Luego:',
            '  aplicar          publica la intervención (queda registrada en git)',
            '  descartar        vuelve a la versión anterior',
            '  historia         últimas intervenciones',
            '  ver              HTML actual de la página',
            '  firma <nombre>   firma tus intervenciones (vacío = anónima)',
          ]
        : ['Pregunta lo que quieras sobre esta página, un paper o un vídeo.'];
      [
        ...lineas,
        '  ? <pregunta>     pregunta sobre esta página, un paper o un vídeo',
        editable ? '  modo preguntar   todo lo que escribas será una pregunta' : '',
        editable ? '  modo intervenir  vuelve a transformar la página' : '',
        '  limpiar          limpia la terminal',
      ]
        .filter(Boolean)
        .forEach((l) => escribir(l, 'td-tenue'));
    },
    limpiar() {
      registro.textContent = '';
    },
    modo(arg) {
      if (arg === 'preguntar' || (arg === 'intervenir' && editable)) {
        fijarModo(arg);
        escribir(`Modo ${arg}.`);
      } else {
        escribir(editable ? 'Modos: «modo preguntar» o «modo intervenir».' : 'En esta página solo se puede preguntar.', 'td-aviso');
      }
    },
    ver() {
      if (!editable) return escribir('Esta página no tiene zona editable.', 'td-aviso');
      escribir(htmlZonaActual() || '(vacía)', 'td-codigo');
    },
    firma(arg) {
      guardarFirma(arg.slice(0, 40));
      escribir(arg ? `Tus intervenciones irán firmadas como «${arg.slice(0, 40)}».` : 'Tus intervenciones serán anónimas.');
    },
    async historia() {
      const datos = await pedir('GET', `/historia?pagina=${encodeURIComponent(PAGINA)}`);
      if (!datos.intervenciones.length) return escribir('Sin intervenciones todavía.');
      datos.intervenciones.forEach((k) => {
        const fecha = k.fecha ? new Date(k.fecha).toLocaleString() : '';
        enlace(`${k.sha}  ${fecha}  ${k.mensaje}`, k.url);
      });
    },
    async aplicar() {
      if (!estado.propuesta) return escribir('No hay ninguna propuesta pendiente.', 'td-aviso');
      escribir('Publicando la intervención…', 'td-tenue');
      const { cuerpo, css, token } = estado.propuesta;
      const r = await pedir('POST', '/aplicar', { cuerpo, css, token });
      estado.propuesta = null;
      estado.original = null;
      escribir(
        r.modo === 'revision'
          ? 'Propuesta enviada para revisión del CPE. Se publicará cuando sea aceptada:'
          : 'Intervención publicada. Será visible para todas las personas cuando termine el despliegue (≈1 min):',
        'td-ok',
      );
      enlace(r.url, r.url);
    },
    descartar() {
      if (!estado.propuesta) return escribir('No hay ninguna propuesta pendiente.', 'td-aviso');
      sustituirZona(estado.original.nodos, estado.original.css);
      estado.propuesta = null;
      estado.original = null;
      escribir('Propuesta descartada. La página vuelve a su estado anterior.');
    },
  };

  async function proponer(instruccion) {
    if (estado.propuesta) {
      // Una instrucción nueva parte de la versión publicada, no de la vista previa.
      sustituirZona(estado.original.nodos, estado.original.css);
      estado.propuesta = null;
    }
    const espera = escribir('El modelo está reescribiendo la página…', 'td-tenue td-pulso');
    try {
      const r = await pedir('POST', '/proponer', { instruccion, pagina: PAGINA, firma: leerFirma() });
      const hoja = hojaPropia();
      estado.original = { nodos: nodosZona().map((n) => n.cloneNode(true)), css: hoja ? hoja.textContent : '' };
      estado.propuesta = r;
      sustituirZona(nodosDesdeHtml(r.cuerpo), r.css);
      (r.advertencias || []).forEach((a) => escribir(`! ${a}`, 'td-aviso'));
      escribir('Vista previa aplicada. Escribe «aplicar» para publicarla o «descartar» para volver atrás.', 'td-ok');
    } finally {
      espera.remove();
    }
  }

  async function preguntar(pregunta, ancla) {
    const espera = escribir('Leyendo…', 'td-tenue td-pulso');
    try {
      const r = await pedir('POST', '/preguntar', { pregunta, pagina: PAGINA, ancla: ancla || location.hash.slice(1) });
      if (r.fuente) {
        const tipo = r.fuente.tipo === 'video' ? 'vídeo' : 'publicación';
        const base = r.fuente.textoCompleto ? 'texto completo' : r.fuente.tipo === 'video' ? 'solo título; sin transcripción' : 'solo metadatos; sin texto completo';
        escribir(`Fuente: ${tipo} «${r.fuente.titulo}» (${base}).`, 'td-tenue');
      }
      escribir(r.respuesta.replace(/\*\*/g, '').replace(/^#+\s*/gm, ''), 'td-respuesta');
    } finally {
      espera.remove();
    }
  }

  async function ejecutar(texto, ancla) {
    const [cabeza, ...resto] = texto.split(/\s+/);
    const nombre = cabeza.toLowerCase();
    const comando = Object.prototype.hasOwnProperty.call(COMANDOS, nombre) ? COMANDOS[nombre] : null;
    const arg = resto.join(' ');
    estado.ocupado = true;
    entrada.disabled = true;
    try {
      if (comando && (nombre === 'firma' || nombre === 'modo' || !arg)) {
        await comando(arg);
      } else if (!SERVIDOR) {
        escribir('La terminal no está conectada a ningún servidor (falta data-servidor).', 'td-error');
      } else if (texto.startsWith('?') || estado.modo === 'preguntar') {
        const pregunta = texto.replace(/^\?\s*/, '');
        if (pregunta) await preguntar(pregunta, ancla);
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

  decorar();
  escribir(
    editable
      ? 'Terminal dialéctica. Esta página es un espacio producido colectivamente: puedes transformarla o hacerle preguntas.'
      : 'Terminal dialéctica. Pregunta sobre esta página, sus publicaciones o sus vídeos.',
    'td-tenue',
  );
  escribir('Escribe «ayuda» para empezar.', 'td-tenue');
})();
