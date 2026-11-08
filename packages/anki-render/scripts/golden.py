#!/usr/bin/env python3
"""Golden references: how real Anki renders every card of an .apkg.

Imports the package into a temporary collection with the `anki` library (the same Rust core as the
desktop app) and saves `card.question()` / `card.answer()` of each card, keyed by note guid and ordinal.
The TypeScript tests compare @qv/anki-render against this file.

    PY=python3
    $PY packages/anki-render/scripts/golden.py packages/anki-format/test/fixtures/sample.apkg \
        packages/anki-render/test/golden/sample.json

For a real deck, write the output outside the repository (it has copyrighted content).
"""

import json
import os
import shutil
import sys
import tempfile
import warnings

warnings.filterwarnings("ignore")

from anki.collection import Collection, ImportAnkiPackageOptions, ImportAnkiPackageRequest  # noqa: E402


def main():
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    apkg, output = (os.path.abspath(a) for a in sys.argv[1:])
    folder = tempfile.mkdtemp()
    try:
        col = Collection(os.path.join(folder, "collection.anki2"))
        col.import_anki_package(
            ImportAnkiPackageRequest(
                package_path=apkg,
                options=ImportAnkiPackageOptions(with_scheduling=False, with_deck_configs=True),
            )
        )
        cards = []
        for cid in col.find_cards(""):
            card = col.get_card(cid)
            note = card.note()
            cards.append(
                {
                    "guid": note.guid,
                    "ord": card.ord,
                    "deck": col.decks.name(card.did),
                    "question": card.question(),
                    "answer": card.answer(),
                }
            )
        col.close()
        cards.sort(key=lambda c: (c["guid"], c["ord"]))
        with open(output, "w", encoding="utf-8") as f:
            json.dump(cards, f, ensure_ascii=False, indent=1)
            f.write("\n")
        print(f"{len(cards)} tarjetas → {output}", file=sys.stderr)
    finally:
        shutil.rmtree(folder)


if __name__ == "__main__":
    main()
