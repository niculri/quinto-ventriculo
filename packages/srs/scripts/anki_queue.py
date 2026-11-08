"""Studies a deck tree in real Anki (25.9.x, v3 scheduler, FSRS on) and records the queue, to compare the
@qv/srs queue with it.

    ANKI_TEST_MODE=1 python3 packages/srs/scripts/anki_queue.py \
        packages/srs/test/golden/queue.json

For each scenario: a parent deck with two subdecks (one with 0 new cards a day, like «Extras»), notes with
one, two and three cards (siblings), cards put straight into every state (new, learning today, learning on a
later day, reviews due and not due, suspended, buried), the counters of what was «studied today» and the three
presets. Then it studies: shows the next card, records it with the whole queue and the counts (new, learning,
review), answers it with a fixed pattern and goes on until the deck is finished. Card and note ids and the
cards' modification times go in the trace: the test gives them to the queue, so Anki's random tie-breaks
(fnvhash of the card id and its mtime) are the same.
"""

import json
import os
import sys
import tempfile
import time

os.environ.setdefault("TZ", "America/Santiago")
time.tzset()

import anki.lang  # noqa: E402

anki.lang.set_lang("es_ES")

from anki.collection import Collection  # noqa: E402
from anki.scheduler_pb2 import CardAnswer  # noqa: E402

DAY = 86_400

SCENARIOS = [
    {
        "name": "defaults, with burying and limits through the tree",
        "presets": {
            "parent": {"perDayNew": 6, "perDayRev": 9, "buryNew": True, "buryRev": True},
            "extras": {"perDayNew": 0, "perDayRev": 9},
            "sub": {"perDayNew": 3, "perDayRev": 2},
        },
        "studied": {"parent": (1, 1), "sub": (0, 1)},
        "ratings": [3, 3, 1, 3, 4, 2, 3, 3, 1, 3],
    },
    {
        "name": "new after reviews, interday learning before, positions descending",
        "presets": {
            "parent": {"perDayNew": 8, "perDayRev": 20, "newMix": 1, "interdayLearningMix": 2,
                       "newGatherPriority": 2, "newSortOrder": 1, "buryInterdayLearning": True},
            "extras": {"perDayNew": 0, "perDayRev": 20},
            "sub": {"perDayNew": 2, "perDayRev": 20},
        },
        "studied": {},
        "ratings": [3, 1, 3, 3, 2, 4, 3],
    },
    {
        "name": "intervals ascending, new before reviews, the lowest position first",
        "presets": {
            "parent": {"perDayNew": 4, "perDayRev": 6, "newMix": 2, "reviewOrder": 3, "newGatherPriority": 1,
                       "learnSteps": [1, 30]},
            "extras": {"perDayNew": 0, "perDayRev": 6},
            "sub": {"perDayNew": 4, "perDayRev": 6},
        },
        "studied": {"extras": (0, 2)},
        "ratings": [1, 3, 3, 2, 3, 4, 3, 1],
    },
]

# Cards put straight into a state: (type, queue, due as an offset, ivl, left, s, d, days since last review).
# due: days from today for review/day learning; seconds from now for intraday learning.
STATES = {
    "learn_now": (1, 1, -120, 0, 1, 2.31, 5.1, 0),
    "learn_soon": (1, 1, 300, 0, 2, 1.2, 6.0, 0),
    "learn_ahead": (3, 1, 900, 4, 1, 3.4, 7.2, 0),
    "learn_later": (1, 1, 3 * 3600, 0, 1, 2.0, 5.0, 0),
    "daylearn_due": (1, 3, 0, 0, 1, 2.9, 5.5, 2),
    "daylearn_late": (1, 3, -2, 0, 1, 2.2, 5.3, 4),
    "review_due_0": (2, 2, 0, 5, 0, 6.1, 4.0, 5),
    "review_due_1": (2, 2, -1, 3, 0, 4.0, 5.0, 4),
    "review_due_3": (2, 2, -3, 10, 0, 11.0, 3.5, 13),
    "review_due_7": (2, 2, -7, 2, 0, 2.5, 6.5, 9),
    "review_due_12": (2, 2, -12, 30, 0, 25.0, 2.5, 42),
    "review_future": (2, 2, 4, 8, 0, 9.0, 4.4, 4),
}

# Notes: deck, number of cards (1 basic, 2 basic and reversed, 3 cloze), state of each card (None = new).
NOTES = [
    ("parent", 1, [None]),
    ("parent", 2, [None, None]),
    ("parent", 2, ["review_due_3", None]),
    ("parent", 1, ["learn_now"]),
    ("parent", 3, [None, None, None]),
    ("parent", 2, ["review_due_0", "review_due_7"]),
    ("parent", 1, ["daylearn_due"]),
    ("parent", 1, ["learn_ahead"]),
    ("parent", 1, ["review_future"]),
    ("parent", 1, [None]),
    ("parent", 2, ["suspended", None]),
    ("parent", 1, ["buried"]),
    ("extras", 1, [None]),
    ("extras", 2, ["review_due_1", None]),
    ("extras", 1, ["learn_soon"]),
    ("sub", 1, [None]),
    ("sub", 2, [None, None]),
    ("sub", 1, ["review_due_12"]),
    ("sub", 1, ["daylearn_late"]),
    ("sub", 1, ["learn_later"]),
    ("sub", 1, [None]),
    ("parent", 1, [None]),
]


def make_config(col, name, p):
    conf = col.decks.get_config(col.decks.add_config_returning_id(name))
    conf["new"]["perDay"] = p.get("perDayNew", 20)
    conf["rev"]["perDay"] = p.get("perDayRev", 200)
    conf["new"]["bury"] = p.get("buryNew", False)
    conf["rev"]["bury"] = p.get("buryRev", False)
    conf["buryInterdayLearning"] = p.get("buryInterdayLearning", False)
    conf["new"]["delays"] = p.get("learnSteps", [1.0, 10.0])
    for key in ("newMix", "interdayLearningMix", "reviewOrder", "newGatherPriority", "newSortOrder"):
        conf[key] = p.get(key, 0)
    col.decks.update_config(conf)
    return col.decks.get_config(conf["id"])


def card_dict(col, cid):
    nid, did, ord_, ctype, queue, due, ivl, left, reps, lapses, data, mod = col.db.first(
        "select nid, did, ord, type, queue, due, ivl, left, reps, lapses, data, mod from cards where id = ?",
        cid)
    data = json.loads(data) if data else {}
    return {"id": cid, "nid": nid, "mod": mod, "guid": col.db.scalar("select guid from notes where id = ?", nid),
            "ord": ord_,
            "deck": did, "type": ctype, "queue": queue, "due": due, "ivl": ivl, "left": left, "reps": reps,
            "lapses": lapses, "s": data.get("s"), "d": data.get("d"), "lrt": data.get("lrt")}


def run(sc, index):
    folder = tempfile.mkdtemp()
    col = Collection(os.path.join(folder, f"queue{index}.anki2"))
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

    decks = {"parent": col.decks.id("Mazo"), "extras": col.decks.id("Mazo::Extras"),
             "sub": col.decks.id("Mazo::Sub")}
    configs = {}
    for key, did in decks.items():
        conf = make_config(col, f"{sc['name']} {key}", sc["presets"][key])
        deck = col.decks.get(did)
        deck["conf"] = conf["id"]
        col.decks.save(deck)
        configs[key] = conf
    timing = col._backend.sched_timing_today()
    today = timing.days_elapsed
    now = int(time.time())
    for key, (new, rev) in sc["studied"].items():
        deck = col.decks.get(decks[key])
        deck["newToday"] = [today, new]
        deck["revToday"] = [today, rev]
        col.decks.save(deck)

    for n, (deck, count, states) in enumerate(NOTES):
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

    col.decks.select(decks["parent"])
    cards = [card_dict(col, cid) for cid in col.db.list("select id from cards order by id")]
    # The days of the collection: the stats of the decks (new and reviews studied today).
    studied = {key: list(sc["studied"].get(key, (0, 0))) for key in decks}
    steps = []
    for n in range(200):
        # A second between answers, as when studying: two learning cards due at the very same second are
        # ordered by where Rust's VecDeque happens to split its buffer, which nobody can reproduce.
        time.sleep(1.05)
        queued = col.sched.get_queued_cards(fetch_limit=1000)
        if not queued.cards:
            break
        top = queued.cards[0]
        order = [(c.card.id, int(c.queue)) for c in queued.cards]
        timing = col._backend.sched_timing_today()
        rating = sc["ratings"][n % len(sc["ratings"])]
        new_state = [top.states.again, top.states.hard, top.states.good, top.states.easy][rating - 1]
        answered_at = int(time.time() * 1000)
        answer = CardAnswer(card_id=top.card.id, current_state=top.states.current, new_state=new_state,
                            rating=rating - 1, answered_at_millis=answered_at, milliseconds_taken=1500)
        col.sched.answer_card(answer)
        steps.append({
            "counts": [queued.new_count, queued.learning_count, queued.review_count],
            "order": order,
            "card": top.card.id,
            "rating": rating,
            "timing": {"now": int(time.time()), "today": timing.days_elapsed, "nextDayAt": timing.next_day_at},
            "answeredAt": answered_at // 1000,
            "after": card_dict(col, top.card.id),
        })
    left = [card_dict(col, cid) for cid in col.db.list("select id from cards order by id")]
    col.close()
    return {
        "name": sc["name"],
        "now": now,
        "timing": {"now": now, "today": today, "nextDayAt": timing.next_day_at},
        "decks": [{"key": k, "id": decks[k], "name": col_name, "config": configs[k]}
                  for k, col_name in (("parent", "Mazo"), ("extras", "Mazo::Extras"), ("sub", "Mazo::Sub"))],
        "studied": studied,
        "cards": cards,
        "steps": steps,
        "end": left,
    }


def main(out_path):
    out = {"testMode": bool(os.environ.get("ANKI_TEST_MODE")), "timeZone": os.environ["TZ"],
           "scenarios": [run(sc, i) for i, sc in enumerate(SCENARIOS)]}
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"{len(out['scenarios'])} escenarios, "
          f"{sum(len(s['steps']) for s in out['scenarios'])} tarjetas estudiadas → {out_path}")


if __name__ == "__main__":
    main(sys.argv[1])
