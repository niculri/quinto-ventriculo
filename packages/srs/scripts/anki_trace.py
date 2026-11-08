"""Answers cards in real Anki (25.9.x, FSRS on) and records what happens, to compare @qv/srs with it.

    ANKI_TEST_MODE=1 python3 packages/srs/scripts/anki_trace.py \
        packages/srs/test/golden/transitions.json
    python3 packages/srs/scripts/anki_trace.py \
        packages/srs/test/golden/transitions-fuzz.json

With ANKI_TEST_MODE Anki does not fuzz (exact comparison); without it, it fuzzes with its own seed (the test
checks the interval falls inside our fuzz range). Each scenario is one card in its own deck with its own
preset; the time between answers is simulated by moving the card into the past (due, last review and revlog),
which is what Anki sees when that time goes by. The load balancer is turned off (see the README of the package).
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
MIN = 60

# FSRS-6 parameters other than the defaults (inside their bounds), to check they are used.
CUSTOM_21 = [0.4, 0.9, 3.1, 10.2, 6.0, 0.6, 2.2, 0.01, 1.6, 0.2, 1.0, 1.7, 0.08, 0.3, 1.9, 0.5, 2.4, 0.6, 0.15, 0.1, 0.2]
CUSTOM_19 = CUSTOM_21[:19]

SCENARIOS = [
    {
        "name": "learning steps, then good reviews",
        "config": {},
        "steps": [(0, 3), (10 * MIN, 3), (DAY, 3), (3 * DAY, 3), (8 * DAY, 3), (20 * DAY, 3)],
    },
    {
        "name": "every button on a new card and in learning",
        "config": {},
        "steps": [(0, 2), (6 * MIN, 1), (MIN, 2), (6 * MIN, 3), (10 * MIN, 1), (MIN, 4), (5 * DAY, 2), (9 * DAY, 4)],
    },
    {
        "name": "easy on a new card",
        "config": {},
        "steps": [(0, 4), (9 * DAY, 3), (30 * DAY, 3)],
    },
    {
        "name": "lapses and relearning",
        "config": {},
        "steps": [(0, 3), (10 * MIN, 3), (DAY, 3), (3 * DAY, 1), (10 * MIN, 2), (10 * MIN, 3),
                  (DAY, 1), (10 * MIN, 1), (10 * MIN, 4), (4 * DAY, 3)],
    },
    {
        "name": "late and early reviews",
        "config": {},
        "steps": [(0, 3), (10 * MIN, 3), (40 * DAY, 3), (DAY, 3), (2 * DAY, 2), (100 * DAY, 4)],
    },
    {
        "name": "three learning steps, one of them over a day",
        "config": {"learnSteps": [1, 60, 2880], "relearnSteps": [5, 1440]},
        "steps": [(0, 3), (60 * MIN, 2), (60 * MIN, 3), (2 * DAY, 3), (DAY, 3), (5 * DAY, 1), (5 * MIN, 3),
                  (DAY, 3), (3 * DAY, 3)],
    },
    {
        "name": "no steps, default parameters",
        "config": {"learnSteps": [], "relearnSteps": []},
        "steps": [(0, 1), (DAY, 3), (3 * DAY, 1), (2 * DAY, 3)],
    },
    {
        "name": "no steps, parameters with short-term",
        "config": {"learnSteps": [], "relearnSteps": [], "fsrsParams6": CUSTOM_21},
        "steps": [(0, 1), (2 * MIN, 1), (5 * MIN, 3), (DAY, 3), (4 * DAY, 1), (DAY, 3), (2 * DAY, 3)],
    },
    {
        "name": "custom FSRS-6 parameters and retention",
        "config": {"fsrsParams6": CUSTOM_21, "desiredRetention": 0.8},
        "steps": [(0, 3), (10 * MIN, 3), (2 * DAY, 3), (5 * DAY, 2), (9 * DAY, 3), (30 * DAY, 1),
                  (10 * MIN, 3), (3 * DAY, 4)],
    },
    {
        "name": "FSRS-5 parameters (19) and high retention",
        "config": {"fsrsParams5": CUSTOM_19, "desiredRetention": 0.97},
        "steps": [(0, 3), (10 * MIN, 3), (DAY, 3), (DAY, 3), (2 * DAY, 3), (3 * DAY, 1),
                  (10 * MIN, 3)],
    },
    {
        "name": "maximum interval",
        "config": {"maximumReviewInterval": 12},
        "steps": [(0, 4), (12 * DAY, 4), (12 * DAY, 4), (12 * DAY, 3), (12 * DAY, 2)],
    },
    {
        "name": "leech that gets suspended",
        "config": {"leechThreshold": 2, "leechAction": 0},
        "steps": [(0, 3), (10 * MIN, 3), (DAY, 1), (10 * MIN, 3), (DAY, 1), (10 * MIN, 3)],
    },
    {
        "name": "leech that gets tagged, every half threshold",
        "config": {"leechThreshold": 3, "leechAction": 1, "relearnSteps": []},
        "steps": [(0, 4), (4 * DAY, 1), (DAY, 1), (DAY, 1), (DAY, 1), (DAY, 1), (DAY, 3)],
    },
    {
        "name": "a single learning step",
        "config": {"learnSteps": [15], "relearnSteps": [3]},
        "steps": [(0, 2), (20 * MIN, 2), (20 * MIN, 3), (DAY, 1), (3 * MIN, 2), (3 * MIN, 3), (2 * DAY, 3)],
    },
]


def card_dict(col, cid):
    ctype, queue, due, ivl, left, reps, lapses, data = col.db.first(
        "select type, queue, due, ivl, left, reps, lapses, data from cards where id = ?", cid)
    data = json.loads(data) if data else {}
    return {"type": ctype, "queue": queue, "due": due, "ivl": ivl, "left": left, "reps": reps,
            "lapses": lapses, "s": data.get("s"), "d": data.get("d"), "lrt": data.get("lrt")}


def memory(m):
    return {"s": m.stability, "d": m.difficulty} if m.ByteSize() else None


def state_dict(state):
    normal = state.normal
    kind = normal.WhichOneof("kind")
    if kind == "new":
        return {"kind": "new", "position": normal.new.position}
    if kind == "learning":
        x = normal.learning
        return {"kind": "learning", "remainingSteps": x.remaining_steps, "scheduledSecs": x.scheduled_secs,
                "memory": memory(x.memory_state)}
    if kind == "review":
        x = normal.review
        return {"kind": "review", "scheduledDays": x.scheduled_days, "elapsedDays": x.elapsed_days,
                "lapses": x.lapses, "leeched": x.leeched, "memory": memory(x.memory_state)}
    if kind == "relearning":
        x = normal.relearning
        return {"kind": "relearning",
                "learning": {"remainingSteps": x.learning.remaining_steps,
                             "scheduledSecs": x.learning.scheduled_secs, "memory": memory(x.learning.memory_state)},
                "review": {"scheduledDays": x.review.scheduled_days, "elapsedDays": x.review.elapsed_days,
                           "lapses": x.review.lapses, "leeched": x.review.leeched,
                           "memory": memory(x.review.memory_state)}}
    raise ValueError(kind)


def age(col, cid, secs):
    """Moves the card `secs` seconds into the past: what Anki sees after that time."""
    if not secs:
        return
    ctype, queue, due, data = col.db.first("select type, queue, due, data from cards where id = ?", cid)
    data = json.loads(data) if data else {}
    if "lrt" in data:
        data["lrt"] -= secs
    if queue in (1, 4) or (queue < 0 and due > 1_000_000_000):
        due -= secs
    elif queue in (2, 3) or (queue < 0 and ctype in (1, 2, 3)):
        # Whole days move the due day; a few minutes do not (the runs start far from the rollover).
        due -= secs // DAY
    col.db.execute("update cards set due = ?, data = ? where id = ?", due,
                   json.dumps(data, separators=(",", ":")), cid)
    col.db.execute("update revlog set id = id - ? where cid = ?", secs * 1000, cid)


def apply_config(col, deck_id, overrides):
    conf = col.decks.add_config_returning_id(f"conf {deck_id}")
    conf = col.decks.get_config(conf)
    conf["new"]["delays"] = overrides.get("learnSteps", [1.0, 10.0])
    conf["lapse"]["delays"] = overrides.get("relearnSteps", [10.0])
    conf["lapse"]["leechFails"] = overrides.get("leechThreshold", 8)
    conf["lapse"]["leechAction"] = overrides.get("leechAction", 1)
    conf["rev"]["maxIvl"] = overrides.get("maximumReviewInterval", 36500)
    conf["new"]["perDay"] = 9999
    conf["rev"]["perDay"] = 9999
    conf["desiredRetention"] = overrides.get("desiredRetention", 0.9)
    conf["fsrsParams6"] = overrides.get("fsrsParams6", [])
    conf["fsrsParams5"] = overrides.get("fsrsParams5", [])
    col.decks.update_config(conf)
    deck = col.decks.get(deck_id)
    deck["conf"] = conf["id"]
    col.decks.save(deck)
    return col.decks.get_config(conf["id"])


def main(out_path):
    folder = tempfile.mkdtemp()
    col = Collection(os.path.join(folder, "trace.anki2"))
    prefs = col.get_preferences()
    prefs.scheduling.rollover = 4
    prefs.scheduling.learn_ahead_secs = 1200
    col.set_preferences(prefs)
    col.set_config("fsrs", True)
    col.set_config("loadBalancerEnabled", False)
    # The stock «Basic» (its name depends on the language).
    basic = next(m for m in col.models.all() if m["type"] == 0 and len(m["tmpls"]) == 1)

    out = {"testMode": bool(os.environ.get("ANKI_TEST_MODE")), "timeZone": os.environ["TZ"],
           "rollover": 4, "scenarios": []}
    for i, sc in enumerate(SCENARIOS):
        deck_id = col.decks.id(f"Escenario {i}")
        config = apply_config(col, deck_id, sc["config"])
        note = col.new_note(basic)
        note.fields[0] = sc["name"]
        note.fields[1] = str(i)
        col.add_note(note, deck_id)
        cid = note.card_ids()[0]
        steps = []
        for n, (advance, rating) in enumerate(sc["steps"]):
            try:
                age(col, cid, advance)
            except AssertionError:
                print(f"escenario «{sc['name']}», paso {n}: {card_dict(col, cid)}", file=sys.stderr)
                raise
            before = card_dict(col, cid)
            now = int(time.time())
            timing = col._backend.sched_timing_today()
            states = col._backend.get_scheduling_states(cid)
            labels = list(col.sched.describe_next_states(states))
            card = col.get_card(cid)
            answered_at = int(time.time() * 1000)
            new_state = [states.again, states.hard, states.good, states.easy][rating - 1]
            answer = CardAnswer(card_id=cid, current_state=states.current, new_state=new_state, rating=rating - 1,
                                answered_at_millis=answered_at, milliseconds_taken=1000)
            col.sched.answer_card(answer)
            after = card_dict(col, cid)
            steps.append({
                "advance": advance, "rating": rating,
                "timing": {"now": now, "today": timing.days_elapsed, "nextDayAt": timing.next_day_at},
                "answeredAt": answered_at // 1000,
                "before": before,
                "states": {k: state_dict(getattr(states, k)) for k in ("current", "again", "hard", "good", "easy")},
                "labels": labels, "after": after,
                "leechTagged": col.get_note(card.nid).has_tag("leech"),
            })
        out["scenarios"].append({"name": sc["name"], "config": config, "steps": steps})
    col.close()
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"{len(out['scenarios'])} escenarios, {sum(len(s['steps']) for s in out['scenarios'])} respuestas → {out_path}")


if __name__ == "__main__":
    main(sys.argv[1])
