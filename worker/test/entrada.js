// Punto de entrada solo para pruebas: expone el saneador y sustituye el
// binding de Workers AI por un servicio simulado controlado desde Node.
import principal from '../src/index.js';
import { sanear, sanearCss } from '../src/sanear.js';

export default {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === '/__sanear') {
      return Response.json(await sanear(await request.text()));
    }
    if (new URL(request.url).pathname === '/__css') {
      return Response.json(sanearCss(await request.text()));
    }
    const AI = {
      async run(modelo, entrada) {
        const r = await env.AI_FALSO.fetch('http://ai/', { method: 'POST', body: JSON.stringify({ modelo, entrada }) });
        if (r.status >= 500) throw new Error(await r.text());
        return (r.headers.get('content-type') || '').includes('event-stream') ? r.body : r.json();
      },
    };
    return principal.fetch(request, { ...env, AI }, ctx);
  },
};
