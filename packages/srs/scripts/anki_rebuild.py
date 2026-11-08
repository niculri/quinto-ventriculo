"""Like anki_queue.py, but the queue is built again before every card, as the web builds it every time the
study page opens, after burying or suspending and after an undo: from the cards as they are and from the
deck counters of what was studied today, which Anki adds up in the deck and in every deck above it.

    ANKI_TEST_MODE=1 python3 packages/srs/scripts/anki_rebuild.py \
        packages/srs/test/golden/queue-rebuild.json

Each step records the queue and the counts after the rebuild, the time, and the cards that changed since the
step before (the answer and the siblings it buried), so the test can build its own queue from the same cards
and from the answers so far (test/queue-rebuild.test.ts).
"""

import json
import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from anki_queue import NOTES, SCENARIOS, STATES, card_dict, make_config  # noqa: E402
from anki.collection import Collection  # noqa: E402
from anki.scheduler_pb2 import CardAnswer  # noqa: E402

DAY = 86_400

REBUILD_SCENARIOS = [
    *SCENARIOS,
    {
        "name": "the parent's new limit counts the new cards studied in the subdecks",
        "presets": {
            "parent": {"perDayNew": 6, "perDayRev": 40},
            "extras": {"perDayNew": 0, "perDayRev": 40},
            "sub": {"perDayNew": 10, "perDayRev": 40},
        },
        "studied": {"sub": (1, 0)},
        "notes": [("parent", 1, [None]), ("parent", 1, [None]), ("extras", 1, [None])]
        + [("sub", 1, [None])] * 8,
        "ratings": [4],
    },
    {
        "name": "the parent's review limit counts the reviews of the subdecks",
        "presets": {
            "parent": {"perDayNew": 20, "perDayRev": 3},
            "extras": {"perDayNew": 0, "perDayRev": 40},
            "sub": {"perDayNew": 20, "perDayRev": 40},
        },
        "studied": {},
        "notes": [("sub", 1, ["review_due_0"]), ("sub", 1, ["review_due_1"]), ("sub", 1, ["review_due_7"]),
                  ("parent", 1, ["review_due_3"]), ("extras", 1, ["review_due_12"]), ("parent", 1, [None])],
        "ratings": [3],
    },
]


def run(sc, index):
    folder = tempfile.mkdtemp()
    col = Collection(os.path.join(folder, f"rebuild{index}.anki2"))
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
    other = col.decks.id("Otro")
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

    def all_cards():
        return [card_dict(col, cid) for cid in col.db.list("select id from cards order by id")]

    start = all_cards()
    last = {c["id"]: c for c in start}
    steps = []
    for n in range(200):
        time.sleep(1.05)
        # Selecting another deck and back drops the queue (Op::SetCurrentDeck): the next one is built anew.
        col.decks.select(other)
        col.decks.select(decks["parent"])
        # Only the cards that changed since the step before (the first step: since `start`).
        changed = [c for c in all_cards() if c != last[c["id"]]]
        last.update({c["id"]: c for c in changed})
        queued = col.sched.get_queued_cards(fetch_limit=1000)
        timing = col._backend.sched_timing_today()
        step = {
            "timing": {"now": int(time.time()), "today": timing.days_elapsed, "nextDayAt": timing.next_day_at},
            "changed": changed,
            "counts": [queued.new_count, queued.learning_count, queued.review_count],
            "order": [c.card.id for c in queued.cards],
        }
        if not queued.cards:
            steps.append(step)
            break
        top = queued.cards[0]
        rating = sc["ratings"][n % len(sc["ratings"])]
        new_state = [top.states.again, top.states.hard, top.states.good, top.states.easy][rating - 1]
        answer = CardAnswer(card_id=top.card.id, current_state=top.states.current, new_state=new_state,
                            rating=rating - 1, answered_at_millis=int(time.time() * 1000),
                            milliseconds_taken=1500)
        col.sched.answer_card(answer)
        step["card"] = top.card.id
        step["queueBefore"] = top.card.queue
        steps.append(step)
    col.close()
    return {
        "name": sc["name"],
        "decks": [{"key": k, "id": decks[k], "name": col_name, "config": configs[k]}
                  for k, col_name in (("parent", "Mazo"), ("extras", "Mazo::Extras"), ("sub", "Mazo::Sub"))],
        "studied": {key: list(sc["studied"].get(key, (0, 0))) for key in decks},
        "cards": start,
        "steps": steps,
    }


def main(out_path):
    out = {"testMode": bool(os.environ.get("ANKI_TEST_MODE")), "timeZone": os.environ["TZ"],
           "scenarios": [run(sc, i) for i, sc in enumerate(REBUILD_SCENARIOS)]}
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(f"{len(out['scenarios'])} escenarios, "
          f"{sum(len(s['steps']) for s in out['scenarios'])} colas rehechas → {out_path}")


if __name__ == "__main__":
    main(sys.argv[1])
