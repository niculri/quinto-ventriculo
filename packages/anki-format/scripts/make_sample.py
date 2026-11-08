#!/usr/bin/env python3
"""Builds test/fixtures/sample.apkg: a small synthetic deck for the tests (reader, renderer, importer, e2e).

It covers what the real decks use and the corners of Anki's template language: conditionals, negated
conditionals, FrontSide, text:, hint:, special fields (Deck, Subdeck, Tags, Type, Card), empty fields
(only <br>), cloze with hints, nested and repeated clozes, Image Occlusion with every shape, a subdeck with
its own preset («Extras», 0 new cards per day) and media. The images are drawn here (no copyrighted
material).

Run it with the Python that has genanki (and Pillow):
    python3 packages/anki-format/scripts/make_sample.py
"""

import json
import os
import shutil
import sqlite3
import sys
import tempfile
import zipfile

import genanki
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUTPUT = os.path.join(HERE, "..", "test", "fixtures", "sample.apkg")

ROOT_DECK_ID = 2059400110
EXTRAS_DECK_ID = 2059400111
EXTRAS_PRESET_ID = 1700000000001
# As the real decks: root, semester, course and assessment as the catalog names them, a week, the deck and its
# «Extras». The package brings only the deck and Extras (Anki exports no parents): the importer creates the rest.
SAMPLE_DECK = "() Medicina UCH::1° Semestre::🦴 Anatomía I::Certamen 1::S1 - Semana de prueba::Mazo de prueba"

CSS = """
.card {
  --fondo: #ffffff; --texto: #1f2328; --acento: #1a64d6;
  font-family: Arial, sans-serif; font-size: 20px; text-align: center;
  color: var(--texto); background-color: var(--fondo); padding: 16px;
}
.card.nightMode, .nightMode .card { --fondo: #1c1f24; --texto: #e6e8eb; --acento: #6ea8ff; }
b, strong { color: var(--acento); }
.cloze { color: var(--acento); font-weight: 700; }
.extra { margin-top: 12px; font-size: 0.8em; }
#image-occlusion-canvas {
  --inactive-shape-color: #ffe08a;
  --active-shape-color: #ff7b72;
  --inactive-shape-border: 1px #3d3d3d;
  --active-shape-border: 1px #3d3d3d;
  --highlight-shape-color: #ff7b7200;
  --highlight-shape-border: 2px #ff4f45;
}
.nightMode #image-occlusion-canvas { --inactive-shape-color: #d9b44a; --active-shape-color: #e5534b; }
.pie { position: fixed; right: 10px; bottom: 6px; font-size: 8px; opacity: 0.5; }
"""

FOOTER = '{{#Código}}<div class="pie">Hecho para las pruebas · {{Código}}</div>{{/Código}}'

BASIC = genanki.Model(
    1607392319,
    "Prueba · Básica",
    fields=[
        {"name": "Frente"},
        {"name": "Reverso"},
        {"name": "Imagen"},
        {"name": "Extra"},
        {"name": "Pista"},
        {"name": "Código"},
    ],
    templates=[
        {
            "name": "Directa",
            "qfmt": (
                "<!-- comentario de la plantilla -->\n"
                '<div class="tema">{{Subdeck}} · {{Type}} · {{Card}}</div>\n'
                '<div class="pregunta">{{Frente}}</div>\n'
                "{{#Pista}}{{hint:Pista}}{{/Pista}}\n"
                "{{^Extra}}<div class=\"sin-extra\">sin extra</div>{{/Extra}}\n" + FOOTER
            ),
            "afmt": (
                "{{FrontSide}}\n\n<hr id=answer>\n\n"
                '<div class="respuesta">{{Reverso}}</div>\n'
                '{{#Imagen}}<div class="imagen">{{Imagen}}</div>{{/Imagen}}\n'
                '{{#Extra}}<div class="extra">{{Extra}}</div>{{/Extra}}\n'
                '<div class="texto">{{text:Frente}}</div>\n'
                '<div class="etiquetas">{{Tags}} · {{Deck}}</div>'
            ),
        },
        {
            "name": "Inversa",
            "qfmt": "{{#Imagen}}<div>{{Reverso}}</div>{{/Imagen}}",
            "afmt": "{{FrontSide}}<hr id=answer>{{Frente}}{{#c1}}nunca{{/c1}}",
        },
    ],
    css=CSS,
)

CLOZE = genanki.Model(
    1607392320,
    "Prueba · Cloze",
    fields=[{"name": "Texto"}, {"name": "Extra"}, {"name": "Código"}],
    templates=[
        {
            "name": "Cloze",
            "qfmt": '<div class="texto-cloze">{{cloze:Texto}}</div>\n' + FOOTER,
            "afmt": (
                '<div class="texto-cloze">{{cloze:Texto}}</div>\n'
                '{{#Extra}}<div class="extra">{{Extra}}</div>{{/Extra}}\n'
                "{{#c2}}<div>tarjeta 2</div>{{/c2}}\n" + FOOTER
            ),
        }
    ],
    css=CSS,
    model_type=genanki.Model.CLOZE,
)

IO_QFMT = """{{#Encabezado}}<div class="encabezado">{{Encabezado}}</div>{{/Encabezado}}
<div style="display: none">{{cloze:Oclusión}}</div>
<div id="err"></div>
<div id="image-occlusion-container">
    {{Imagen}}
    <canvas id="image-occlusion-canvas"></canvas>
</div>
<script>
try {
    anki.imageOcclusion.setup();
} catch (exc) {
    document.getElementById("err").innerHTML = `Error al cargar la oclusión de imagen.<br><br>${exc}`;
}
</script>
"""

OCCLUSION = genanki.Model(
    1607392321,
    "Prueba · Oclusión",
    fields=[
        {"name": "Oclusión"},
        {"name": "Imagen"},
        {"name": "Encabezado"},
        {"name": "Reverso extra"},
        {"name": "Comentarios"},
    ],
    templates=[
        {
            "name": "Oclusión",
            "qfmt": IO_QFMT,
            "afmt": IO_QFMT
            + '\n<div><button id="toggle">Mostrar / ocultar máscaras</button></div>\n'
            + '{{#Reverso extra}}<div class="extra">{{Reverso extra}}</div>{{/Reverso extra}}\n'
            + '{{#Comentarios}}<div class="fuente">{{Comentarios}}</div>{{/Comentarios}}',
        }
    ],
    css=CSS,
    model_type=genanki.Model.CLOZE,
)


def draw_images(folder):
    """Two simple diagrams drawn here: a «vertebra» and a «heart» made of shapes."""
    paths = []
    img = Image.new("RGB", (800, 600), "#ffffff")
    d = ImageDraw.Draw(img)
    d.ellipse((250, 150, 550, 400), fill="#e9d8b4", outline="#7a5c2e", width=6)
    d.rectangle((360, 400, 440, 560), fill="#d8c49a", outline="#7a5c2e", width=6)
    d.polygon([(150, 120), (250, 200), (150, 260)], fill="#c9a86b")
    d.polygon([(650, 120), (550, 200), (650, 260)], fill="#c9a86b")
    for x, y, t in [(40, 40, "Cuerpo"), (600, 40, "Apófisis"), (40, 520, "Lámina"), (560, 520, "Pedículo")]:
        d.rectangle((x, y, x + 150, y + 40), outline="#333333", width=2)
        d.text((x + 10, y + 12), t, fill="#111111")
    path = os.path.join(folder, "prueba_vertebra.png")
    img.save(path)
    paths.append(path)

    img = Image.new("RGB", (400, 400), "#fdf6f0")
    d = ImageDraw.Draw(img)
    d.ellipse((80, 60, 320, 340), fill="#d9534f", outline="#7a1f1c", width=5)
    d.line((200, 60, 200, 340), fill="#7a1f1c", width=4)
    path = os.path.join(folder, "prueba_corazon.png")
    img.save(path)
    paths.append(path)
    return paths


def build(folder):
    root = genanki.Deck(ROOT_DECK_ID, SAMPLE_DECK, "Mazo sintético para las pruebas")
    extras = genanki.Deck(EXTRAS_DECK_ID, SAMPLE_DECK + "::Extras", "")

    root.add_note(
        genanki.Note(
            BASIC,
            [
                "¿Cuántas vértebras <b>cervicales</b> hay?",
                "<b>7</b>",
                '<img src="prueba_vertebra.png">',
                "Contando el atlas y el axis &amp; la C7.",
                "Empieza con 7",
                "T-PR-01-001.2",
            ],
            guid="Or&8~[!Z2<",
            tags=["prueba", "columna::cervical"],
        )
    )
    root.add_note(
        genanki.Note(
            BASIC,
            ["Pregunta sin extra ni pista", "Respuesta", "", "<br>", " ", "T-PR-01-002.1"],
            guid="s@/AqX%n?#",
            tags=["prueba"],
        )
    )
    extras.add_note(
        genanki.Note(
            BASIC,
            ["Frente con espacios&nbsp;duros", "Detrás", "", "<div><br /></div>", "", ""],
            guid="extra-basica-1",
            tags=[],
        )
    )
    root.add_note(
        genanki.Note(
            CLOZE,
            [
                "La columna tiene {{c1::7}} vértebras cervicales, {{c2::12::número}} torácicas y "
                "{{c3::5}} lumbares; en total {{c1::33 a 34}}.",
                "El sacro y el cóccix están <i>fusionados</i>.",
                "T-PR-01-003.1",
            ],
            guid="cloze-1",
            tags=["prueba", "cloze"],
        )
    )
    extras.add_note(
        genanki.Note(
            CLOZE,
            ["Anidado: {{c1::uno {{c2::dos}} tres::pista}} y {{c3::<b>negrita</b>}}.", "", ""],
            guid="cloze-anidado",
            tags=["cloze"],
        )
    )
    shapes = "<br>".join(
        [
            "{{c1::image-occlusion:rect:left=.05:top=.0667:width=.1875:height=.0667:oi=1}}",
            "{{c1::image-occlusion:rect:left=.75:top=.0667:width=.1875:height=.0667:oi=1}}",
            "{{c2::image-occlusion:ellipse:left=.3125:top=.25:width=.375:height=.4167:rx=.1875:ry=.2083:oi=1}}",
            "{{c3::image-occlusion:polygon:left=.1875:top=.2:points=.1875,.2 .3125,.3333 .1875,.4333:oi=1}}",
            "{{c4::image-occlusion:rect:left=.05:top=.8667:width=.1875:height=.0667:angle=500:fill=#00aaff:oi=1}}",
            "{{c5::image-occlusion:text:left=.7:top=.85:text=Pedículo\\: base:scale=1.2:fs=.04:oi=1}}",
            "{{c6::image-occlusion:rect:left=.45:top=.6667:width=.1:height=.2667}}",
        ]
    )
    root.add_note(
        genanki.Note(
            OCCLUSION,
            [
                shapes,
                '<img src="prueba_vertebra.png">',
                "Vértebra de prueba",
                "Partes de la vértebra",
                "Dibujo hecho para las pruebas",
            ],
            guid="oclusion-1",
            tags=["oclusion"],
        )
    )
    extras.add_note(
        genanki.Note(
            OCCLUSION,
            [
                "{{c1::image-occlusion:rect:left=.45:top=.1:width=.1:height=.8}}",
                '<img src="prueba_corazon.png">',
                "",
                "",
                "",
            ],
            guid="oclusion-2",
            tags=["oclusion"],
        )
    )

    package = genanki.Package([root, extras], media_files=draw_images(folder))
    raw = os.path.join(folder, "raw.apkg")
    package.write_to_file(raw)
    return raw


def add_presets(raw, output):
    """genanki writes a single preset («Default»): add «Extras» (0 new cards per day) for the subdeck."""
    folder = tempfile.mkdtemp()
    try:
        with zipfile.ZipFile(raw) as z:
            z.extractall(folder)
        db = sqlite3.connect(os.path.join(folder, "collection.anki2"))
        decks_json, dconf_json = db.execute("select decks, dconf from col").fetchone()
        decks = json.loads(decks_json)
        dconf = json.loads(dconf_json)
        extras = json.loads(json.dumps(dconf["1"]))
        extras.update({"id": EXTRAS_PRESET_ID, "name": "Extras"})
        extras["new"]["perDay"] = 0
        dconf[str(EXTRAS_PRESET_ID)] = extras
        decks[str(EXTRAS_DECK_ID)]["conf"] = EXTRAS_PRESET_ID
        db.execute("update col set decks = ?, dconf = ?", (json.dumps(decks), json.dumps(dconf)))
        db.commit()
        db.close()
        with zipfile.ZipFile(raw) as z:
            names = z.namelist()
        # Deterministic zip: same order, fixed timestamps.
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as z:
            for name in names:
                info = zipfile.ZipInfo(name, date_time=(2026, 10, 31, 12, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                with open(os.path.join(folder, name), "rb") as f:
                    z.writestr(info, f.read())
    finally:
        shutil.rmtree(folder)


def main():
    folder = tempfile.mkdtemp()
    try:
        raw = build(folder)
        os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
        add_presets(raw, OUTPUT)
    finally:
        shutil.rmtree(folder)
    print(f"Escrito {os.path.relpath(OUTPUT)}", file=sys.stderr)


if __name__ == "__main__":
    main()
