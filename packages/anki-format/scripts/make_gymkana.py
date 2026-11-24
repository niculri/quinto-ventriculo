#!/usr/bin/env python3
"""Builds test/fixtures/gymkana.apkg, a small synthetic gymkana (photos with a pin, the name to write in «Etiqueta»,
regions and sources as tags, priorities) for the importer, the web and e2e tests.

    python3 packages/anki-format/scripts/make_gymkana.py   # with genanki and Pillow
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
OUTPUT = os.path.join(HERE, "..", "test", "fixtures", "gymkana.apkg")

DECK_ID = 2059400120
PRESET_ID = 1700000000002
DECK = "() Medicina UCH::2° Semestre::🦴 Anatomía II::Certamen 2::Gymkana"

CSS = """
.card { font-family: Arial, sans-serif; font-size: 20px; text-align: center; color: #1f2328; background: #fff; }
.card.nightMode, .nightMode .card { color: #e6e8eb; background: #1c1f24; }
.encabezado { font-size: 0.8em; margin-bottom: 8px; }
.io-img img { max-width: 100%; }
.respuesta { margin-top: 10px; }
.pie { position: fixed; right: 10px; bottom: 6px; font-size: 8px; opacity: 0.5; }
"""

FOOTER = (
    '{{#Código}}<div class="pie">{{#Prioridad}}Prioridad {{Prioridad}} · {{/Prioridad}}'
    "Hecho para las pruebas · {{Código}}</div>{{/Código}}"
)

PHOTO = genanki.Model(
    1607392330,
    "Prueba · Foto",
    fields=[
        {"name": n}
        for n in [
            "ID",
            "Encabezado",
            "Pregunta",
            "Respuesta",
            "Etiqueta",
            "Extra",
            "Fuente",
            "Código",
            "Creación",
            "Actualización",
            "Prioridad",
        ]
    ],
    templates=[
        {
            "name": "Foto",
            "qfmt": '<div class="encabezado">{{Encabezado}}</div><div class="io-img">{{Pregunta}}</div>'
            + FOOTER,
            "afmt": '<div class="encabezado">{{Encabezado}}</div><div class="io-img">{{Respuesta}}</div>'
            '<hr id="answer"><div class="respuesta"><b>{{Etiqueta}}</b></div>'
            '{{#Extra}}<div class="extra">{{Extra}}</div>{{/Extra}}' + FOOTER,
        }
    ],
    css=CSS,
    sort_field_index=4,
)

# name, tags, priority, colour of the shape
STATIONS = [
    ("Músculo recto lateral", ["S1", "orbita", "atlas_a"], "1", "#c0392b"),
    ("Nervio óptico", ["S1", "orbita", "atlas_a"], "1", "#d4ac0d"),
    ("Arteria carótida interna", ["S1", "cuello", "atlas_a"], "1", "#a93226"),
    ("Vena yugular interna", ["S1", "cuello", "modelo"], "1", "#2e86c1"),
    ("Glándula parótida", ["S1", "cara", "modelo"], "3", "#7d3c98"),
    ("Hueso cigomático (hueso malar)", ["S1", "cara", "atlas_a"], "3", "#229954"),
]


def draw(folder, i, colour):
    """The question (the shape with a red pin) and the answer (the same, with a box where the name goes)."""
    paths = []
    for side in ("q", "a"):
        img = Image.new("RGB", (480, 360), "#f4efe6")
        d = ImageDraw.Draw(img)
        d.ellipse((90 + i * 10, 80, 330 + i * 10, 280), fill=colour, outline="#333333", width=4)
        d.line((240, 180, 380, 60), fill="#111111", width=3)
        d.ellipse((372, 52, 388, 68), fill="#e74c3c", outline="#111111", width=2)
        if side == "a":
            d.rectangle((300, 300, 460, 340), fill="#ffe08a", outline="#333333", width=2)
        path = os.path.join(folder, f"prueba_estacion_{i}_{side}.png")
        img.save(path)
        paths.append(path)
    return paths


def build(folder):
    deck = genanki.Deck(DECK_ID, DECK, "Gymkana sintética para las pruebas")
    media = []
    for i, (name, tags, priority, colour) in enumerate(STATIONS, start=1):
        media += draw(folder, i, colour)
        deck.add_note(
            genanki.Note(
                PHOTO,
                [
                    f"gym{i}",
                    "¿Qué estructura señala el alfiler rojo?",
                    f'<img src="prueba_estacion_{i}_q.png">',
                    f'<img src="prueba_estacion_{i}_a.png">',
                    name,
                    "",
                    "Dibujo hecho para las pruebas",
                    f"T-PR-G2-{i:04d}.1",
                    "24-11-2026",
                    "",
                    priority,
                ],
                guid=f"gymkana-{i}",
                tags=["gymkana", *tags],
            )
        )
    package = genanki.Package([deck], media_files=media)
    raw = os.path.join(folder, "raw.apkg")
    package.write_to_file(raw)
    return raw


def add_preset(raw, output):
    """The «Gymkana» preset: new cards at random, as the real gymkanas have it."""
    folder = tempfile.mkdtemp()
    try:
        with zipfile.ZipFile(raw) as z:
            z.extractall(folder)
            names = z.namelist()
        db = sqlite3.connect(os.path.join(folder, "collection.anki2"))
        decks_json, dconf_json = db.execute("select decks, dconf from col").fetchone()
        decks = json.loads(decks_json)
        dconf = json.loads(dconf_json)
        preset = json.loads(json.dumps(dconf["1"]))
        preset.update({"id": PRESET_ID, "name": "Gymkana", "newGatherPriority": 4, "newSortOrder": 4})
        dconf[str(PRESET_ID)] = preset
        decks[str(DECK_ID)]["conf"] = PRESET_ID
        db.execute("update col set decks = ?, dconf = ?", (json.dumps(decks), json.dumps(dconf)))
        db.commit()
        db.close()
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as z:
            for name in names:
                info = zipfile.ZipInfo(name, date_time=(2026, 11, 24, 12, 0, 0))
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
        add_preset(raw, OUTPUT)
    finally:
        shutil.rmtree(folder)
    print(f"Escrito {os.path.relpath(OUTPUT)}", file=sys.stderr)


if __name__ == "__main__":
    main()
