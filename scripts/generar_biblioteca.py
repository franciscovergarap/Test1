"""Genera terminal/biblioteca.json: vincula cada publicación de publicaciones.html
con su texto completo en markdown (papers/markdown del repositorio del CPE).

Uso: python3 scripts/generar_biblioteca.py <ruta a cpe-repositorio/papers/markdown>

El asistente de la terminal usa este índice para explicar los hallazgos de un
paper a partir de su texto, y no solo de su título.
"""
import html
import json
import re
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
VACIAS = set("""a al and are as at by con de del el en for from in is la las los of on or para por que the to un una y
with sobre entre como desde hacia chile chilean santiago""".split())


def normalizar(texto):
    t = unicodedata.normalize("NFD", texto.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def palabras(texto):
    return [p for p in normalizar(texto).split() if len(p) > 2 and p not in VACIAS]


def publicaciones():
    fuente = (RAIZ / "publicaciones.html").read_text(encoding="utf-8")
    for bloque in re.finditer(r'<article class="pub" id="([^"]+)">(.*?)</article>', fuente, re.S):
        titulo = html.unescape(re.search(r"<h3>(.*?)</h3>", bloque.group(2), re.S).group(1)).strip()
        pdf = re.search(r'href="pdf/([^"]+)\.pdf"', bloque.group(2))
        yield bloque.group(1), titulo, pdf.group(1) if pdf else None


def main(carpeta):
    textos = {p.name: p for p in sorted(Path(carpeta).glob("*.md"))}
    cabeceras = {n: normalizar(p.read_text(encoding="utf-8", errors="ignore")[:2500]) for n, p in textos.items()}
    biblioteca = []
    for ident, titulo, pdf in publicaciones():
        elegido, puntaje = None, 0.0
        if pdf and f"{pdf}.md" in textos:
            elegido, puntaje = f"{pdf}.md", 1.0
        else:
            clave = palabras(titulo)
            for nombre, cabecera in cabeceras.items():
                if not clave:
                    break
                encontradas = sum(1 for p in clave if f" {p} " in f" {cabecera} ")
                valor = encontradas / len(clave)
                # Exige que el título aparezca casi completo al comienzo del texto.
                if valor > puntaje and valor >= 0.9 and encontradas >= 2:
                    elegido, puntaje = nombre, valor
        biblioteca.append({"id": ident, "titulo": titulo, "texto": elegido})
        print(f"{'✓' if elegido else '·'} {titulo[:70]:70} {elegido or ''}")
    destino = RAIZ / "terminal" / "biblioteca.json"
    destino.write_text(json.dumps(biblioteca, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"\n{sum(1 for b in biblioteca if b['texto'])} de {len(biblioteca)} publicaciones con texto completo -> {destino}")


if __name__ == "__main__":
    main(sys.argv[1])
