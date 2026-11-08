"""Studies a deep deck tree in real Anki (25.9.x, v3 scheduler, FSRS on), as the published decks are: the
root «() Medicina UCH», the semesters, the courses, the assessments, the weeks, the decks and their
«Extras». Records the counts of every deck of Anki's deck list and whole study sessions started from the
assessment («Certamen 1») and from the root, to compare the @qv/srs queue with them.

    ANKI_TEST_MODE=1 python3 packages/srs/scripts/anki_tree.py \
        packages/srs/test/golden/queue-tree.json

The parents are created by Anki with the «Default» preset (as when a package without them is imported);
the decks with cards have their own presets. The limits of every level matter: from the assessment, the
limits of the root, the semester and the course do not apply (only with «Límites empiezan desde arriba»).

With --names it records the scenarios of deck names instead (test/golden/queue-tree-names.json): a deck named
like another one plus a suffix, whose subdecks must stay with their own parent («06 - X::Extras» under
«06 - X», not under «06 - X (IMAIOS)»), and the case folding and code points of Anki's order of decks.
"""

import json
import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from anki_queue import DAY, STATES, card_dict, make_config  # noqa: E402  (sets TZ and the language)

from anki.collection import Collection  # noqa: E402
from anki.scheduler_pb2 import CardAnswer  # noqa: E402

ROOT = "() Medicina UCH"
SEM1 = f"{ROOT}::1° Semestre"
ANAT = f"{SEM1}::🦴 Anatomía I"
C1 = f"{ANAT}::Certamen 1"
S3 = f"{C1}::S3 - Columna vertebral, músculos del dorso y pared torácica"
S4 = f"{C1}::S4 - Miembro superior"
SEM2 = f"{ROOT}::2° Semestre"
BIO = f"{SEM2}::🧬 Biología celular::Certamen 2"

# key → (full name, preset key). Parents with «Default» (Anki creates them with it).
DECKS = {
    "root": (ROOT, "default"),
    "sem1": (SEM1, "default"),
    "anat": (ANAT, "default"),
    "c1": (C1, "default"),
    "s3": (S3, "default"),
    "d01": (f"{S3}::01 - Columna vertebral", "deck"),
    "x01": (f"{S3}::01 - Columna vertebral::Extras", "extras"),
    "d02": (f"{S3}::02 - Vértebras", "deck"),
    "s4": (S4, "default"),
    "d41": (f"{S4}::01 - Plexo braquial", "deck"),
    "sem2": (SEM2, "default"),
    "bio": (f"{SEM2}::🧬 Biología celular", "default"),
    "bc2": (BIO, "default"),
    "d10": (f"{BIO}::10 - Núcleo celular", "deck"),
}

SCENARIOS = [
    {
        "name": "from Certamen 1: the deck limits and the parents' «Default»",
        "root": "c1",
        "presets": {
            "default": {"perDayNew": 7, "perDayRev": 9},
            "deck": {"perDayNew": 4, "perDayRev": 5, "buryNew": True, "buryRev": True},
            "extras": {"perDayNew": 0, "perDayRev": 5},
        },
        "studied": {"c1": (1, 1), "d01": (1, 0)},
        "ratings": [3, 3, 1, 3, 4, 2, 3, 3, 1, 3],
    },
    {
        "name": "from the root: every course, the root's limits",
        "root": "root",
        "presets": {
            "default": {"perDayNew": 9, "perDayRev": 12, "newMix": 1},
            "deck": {"perDayNew": 3, "perDayRev": 6, "interdayLearningMix": 2},
            "extras": {"perDayNew": 0, "perDayRev": 6},
        },
        "studied": {"sem2": (2, 0), "d41": (0, 2)},
        "ratings": [3, 1, 3, 3, 2, 4, 3],
    },
    {
        "name": "from the root, the gather by position and reviews by interval",
        "root": "root",
        "presets": {
            "default": {"perDayNew": 20, "perDayRev": 200, "newGatherPriority": 1, "reviewOrder": 3},
            "deck": {"perDayNew": 2, "perDayRev": 3},
            "extras": {"perDayNew": 0, "perDayRev": 3},
        },
        "studied": {},
        "ratings": [3, 3, 2, 1, 3, 4],
    },
]

WEEK = f"{ROOT}::S4 - Visión y audición"
IMAGES = f"{WEEK}::06 - Imagenología de órbita y oído"
IMAIOS = f"{IMAGES} (IMAIOS)"

NAMES_DECKS = {
    "root": (ROOT, "default"),
    "week": (WEEK, "default"),
    "images": (IMAGES, "parent"),
    "imagesx": (f"{IMAGES}::Extras", "extras"),
    "imaios": (IMAIOS, "deck"),
    "imaiosx": (f"{IMAIOS}::Extras", "extras"),
    "bang": (f"{IMAGES}!", "deck"),
    "colon": (f"{IMAGES}:1", "deck"),
    "lower": (f"{WEEK}::a minúscula", "deck"),
    "upper": (f"{WEEK}::B mayúscula", "deck"),
    "enye": (f"{WEEK}::Ñu", "deck"),
    "acute": (f"{WEEK}::éter", "deck"),
    "sa": (f"{WEEK}::sa", "deck"),
    "eszett": (f"{WEEK}::ß", "deck"),
    "st": (f"{WEEK}::st", "deck"),
    "wide": (f"{WEEK}::\uff21 ancho", "deck"),
    "bone": (f"{WEEK}::🦴 Hueso", "deck"),
}

NAMES_NOTES = [
    ("images", 1, [None]),
    ("images", 1, ["review_due_1"]),
    *[("imagesx", 1, [None]) for _ in range(5)],
    ("imagesx", 1, ["review_due_3"]),
    *[("imaios", 1, [None]) for _ in range(3)],
    ("imaiosx", 1, [None]),
    ("bang", 1, [None]),
    ("colon", 1, [None]),
    ("lower", 1, [None]),
    ("upper", 1, [None]),
    ("enye", 1, [None]),
    ("acute", 1, [None]),
    ("sa", 1, [None]),
    ("eszett", 1, [None]),
    ("st", 1, [None]),
    ("wide", 1, [None]),
    ("bone", 1, [None]),
]

NAMES_SCENARIOS = [
    {
        "name": "a deck and its namesake with a suffix: the «Extras» of a parent with 0 new cards a day",
        "root": "week",
        "decks": NAMES_DECKS,
        "notes": NAMES_NOTES,
        "presets": {
            "default": {"perDayNew": 40, "perDayRev": 40},
            "parent": {"perDayNew": 0, "perDayRev": 40},
            "deck": {"perDayNew": 20, "perDayRev": 40},
            "extras": {"perDayNew": 20, "perDayRev": 40},
        },
        "studied": {},
        "ratings": [3, 3, 1, 3],
    },
    {
        "name": "a limit on the week: the order of the decks picks which new cards come out",
        "root": "week",
        "decks": NAMES_DECKS,
        "notes": NAMES_NOTES,
        "presets": {
            "default": {"perDayNew": 7, "perDayRev": 40},
            "parent": {"perDayNew": 1, "perDayRev": 40},
            "deck": {"perDayNew": 1, "perDayRev": 40},
            "extras": {"perDayNew": 1, "perDayRev": 40},
        },
        "studied": {},
        "ratings": [3, 3, 3, 1],
    },
]

# Notes: deck key, number of cards (1 basic, 2 basic and reversed, 3 cloze), state of each card.
NOTES = [
    ("d01", 1, [None]),
    ("d01", 2, [None, None]),
    ("d01", 1, ["review_due_3"]),
    ("d01", 1, ["learn_now"]),
    ("d01", 3, [None, "review_due_0", None]),
    ("d01", 1, ["daylearn_due"]),
    ("d01", 1, [None]),
    ("x01", 1, [None]),
    ("x01", 2, ["review_due_1", None]),
    ("d02", 1, [None]),
    ("d02", 2, ["review_due_7", None]),
    ("d02", 1, ["learn_soon"]),
    ("d02", 1, [None]),
    ("d41", 1, [None]),
    ("d41", 1, ["review_due_12"]),
    ("d41", 2, [None, None]),
    ("d41", 1, ["daylearn_late"]),
    ("d10", 1, [None]),
    ("d10", 1, ["review_due_0"]),
    ("d10", 2, [None, "review_future"]),
    ("d10", 1, ["learn_ahead"]),
    ("d01", 1, ["suspended"]),
    ("d02", 1, ["buried"]),
]


def tree_counts(col):
    """Anki's deck list: new, learning and review of every deck (with what is below it)."""
    out = {}

    def walk(node):
        for child in node.children:
            out[str(child.deck_id)] = [child.new_count, child.learn_count, child.review_count]
            walk(child)

    walk(col.sched.deck_due_tree())
    return out


def run(sc, index):
    folder = tempfile.mkdtemp()
    col = Collection(os.path.join(folder, f"tree{index}.anki2"))
    prefs = col.get_preferences()
    prefs.scheduling.rollover = 4
    prefs.scheduling.learn_ahead_secs = 1200
    col.set_preferences(prefs)
    col.set_config("fsrs", True)
    col.set_config("loadBalancerEnabled", False)
    models = col.models.all()
    basic = next(m for m in models if m["type"] == 0 and len(m["tmpls"]) == 1)
    reversed_ = next(m for m in models if m["type"] == 0 and len(m["tmpls"]) == 2 and len(m["flds"]) == 2)
    cloze = next(m for m in models if m["type"] == 1)

    configs = {key: make_config(col, f"{sc['name']} {key}", p) for key, p in sc["presets"].items()}
    tree = sc.get("decks", DECKS)
    decks = {}
    for key, (name, preset) in tree.items():
        did = col.decks.id(name)
        deck = col.decks.get(did)
        deck["conf"] = configs[preset]["id"]
        col.decks.save(deck)
        decks[key] = did
    timing = col._backend.sched_timing_today()
    today = timing.days_elapsed
    now = int(time.time())
    for key, (new, rev) in sc["studied"].items():
        deck = col.decks.get(decks[key])
        deck["newToday"] = [today, new]
        deck["revToday"] = [today, rev]
        col.decks.save(deck)

    for n, (deck, count, states) in enumerate(sc.get("notes", NOTES)):
        if count == 1:
            note = col.new_note(basic)
            note.fields[0] = f"nota {n}"
        elif count == 2:
            note = col.new_note(reversed_)
            note.fields[0] = f"nota {n}"
            note.fields[1] = f"reverso {n}"
        else:
            note = col.new_note(cloze)
            note.fields[0] = f"{{{{c1::uno}}}} {{{{c2::dos}}}} {{{{c3::tres {n}}}}}"
        col.add_note(note, decks[deck])
        for cid, state in zip(sorted(note.card_ids(), key=lambda c: col.get_card(c).ord), states):
            if state is None:
                continue
            if state == "suspended":
                col.db.execute("update cards set queue = -1 where id = ?", cid)
                continue
            if state == "buried":
                col.db.execute("update cards set type = 2, queue = -2, due = ?, ivl = 3, data = ? where id = ?",
                               today, json.dumps({"s": 3.0, "d": 5.0, "lrt": now - 3 * DAY}), cid)
                continue
            ctype, queue, due, ivl, left, s, d, since = STATES[state]
            due = now + due if queue == 1 else today + due
            col.db.execute(
                "update cards set type = ?, queue = ?, due = ?, ivl = ?, left = ?, reps = 3, data = ? where id = ?",
                ctype, queue, due, ivl, left,
                json.dumps({"s": s, "d": d, "lrt": now - since * DAY - 60}, separators=(",", ":")), cid)

    cards = [card_dict(col, cid) for cid in col.db.list("select id from cards order by id")]
    counts = tree_counts(col)
    ours = {name for name, _ in tree.values()}
    deck_order = [d.name for d in col.decks.all_names_and_ids() if d.name in ours]
    col.decks.select(decks[sc["root"]])
    steps = []
    for n in range(200):
        time.sleep(1.05)
        queued = col.sched.get_queued_cards(fetch_limit=1000)
        if not queued.cards:
            break
        top = queued.cards[0]
        rating = sc["ratings"][n % len(sc["ratings"])]
        new_state = [top.states.again, top.states.hard, top.states.good, top.states.easy][rating - 1]
        timing = col._backend.sched_timing_today()
        answered_at = int(time.time() * 1000)
        col.sched.answer_card(CardAnswer(card_id=top.card.id, current_state=top.states.current,
                                         new_state=new_state, rating=rating - 1,
                                         answered_at_millis=answered_at, milliseconds_taken=1500))
        steps.append({
            "counts": [queued.new_count, queued.learning_count, queued.review_count],
            "order": [(c.card.id, int(c.queue)) for c in queued.cards],
            "card": top.card.id,
            "rating": rating,
            "timing": {"now": int(time.time()), "today": timing.days_elapsed, "nextDayAt": timing.next_day_at},
            "answeredAt": answered_at // 1000,
            "after": card_dict(col, top.card.id),
        })
    end_counts = tree_counts(col)
    end_cards = [card_dict(col, cid) for cid in col.db.list("select id from cards order by id")]
    end_timing = col._backend.sched_timing_today()
    end_now = int(time.time())
    col.close()
    return {
        "name": sc["name"],
        "root": str(decks[sc["root"]]),
        "timing": {"now": now, "today": today, "nextDayAt": timing.next_day_at},
        "decks": [{"key": k, "id": decks[k], "name": tree[k][0], "config": configs[tree[k][1]]}
                  for k in tree],
        "deckOrder": deck_order,
        "studied": {k: list(v) for k, v in sc["studied"].items()},
        "cards": cards,
        "counts": counts,
        "steps": steps,
        "endCounts": end_counts,
        "endCards": end_cards,
        "endTiming": {"now": end_now, "today": end_timing.days_elapsed, "nextDayAt": end_timing.next_day_at},
    }


def main(out_path, scenarios):
    out = {"testMode": bool(os.environ.get("ANKI_TEST_MODE")), "timeZone": os.environ["TZ"],
           "scenarios": [run(sc, i) for i, sc in enumerate(scenarios)]}
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"{len(out['scenarios'])} escenarios, "
          f"{sum(len(s['steps']) for s in out['scenarios'])} tarjetas estudiadas → {out_path}")


if __name__ == "__main__":
    main(sys.argv[1], NAMES_SCENARIOS if "--names" in sys.argv[2:] else SCENARIOS)
