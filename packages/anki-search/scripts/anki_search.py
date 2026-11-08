"""Runs many searches in real Anki (25.9.x) and records which cards each one finds, to compare
@qv/anki-search with it.

    python3 packages/anki-search/scripts/anki_search.py \
        packages/anki-search/test/golden/search.json

The collection has the stock note types (basic, basic and reversed, cloze) and one of our own with three
fields; decks with accents and emoji like the real ones («() Medicina UCH::1° Semestre::🦴 Anatomía I::…»,
its «::Extras», a sibling, another course, names with wildcards and quotes); tags with hierarchy and capitals;
texts with accents, capitals and ñ (no HTML); cards put straight into every state (new, learning today and on
a later day, reviews due and not due, relearning, suspended and buried of each type, flags, FSRS s, d, lrt
and decay in `data`) and created on different days; and a revlog over several days (with a manual
reschedule, ease 0). Everything is relative to the moment it runs (TZ America/Santiago, rollover at 4) and
the timing goes in the JSON. For each search: the cards Anki finds (guid and ord) or its error. Searches
marked «unsupported» are valid in Anki but refused by the package (the test expects a SearchError there).
The sidebar terms (`build_search_string`) for every deck, tag and note type go in the JSON too.
"""

import json
import os
import subprocess
import sys
import tempfile
import time

os.environ.setdefault("TZ", "America/Santiago")
time.tzset()

import anki.lang  # noqa: E402

anki.lang.set_lang("es_ES")

from anki.collection import Collection, SearchNode  # noqa: E402

DAY = 86_400

DECKS = {
    "A": "() Medicina UCH::1° Semestre::🦴 Anatomía I::Certamen 1::"
         "S3 - Columna vertebral, músculos del dorso y pared torácica::01 - Columna vertebral",
    "AX": "() Medicina UCH::1° Semestre::🦴 Anatomía I::Certamen 1::"
          "S3 - Columna vertebral, músculos del dorso y pared torácica::01 - Columna vertebral::Extras",
    "B": "() Medicina UCH::1° Semestre::🦴 Anatomía I::Certamen 1::"
         "S3 - Columna vertebral, músculos del dorso y pared torácica::02 - Vértebras",
    "C": "() Medicina UCH::2° Semestre::🧬 Biología celular::Certamen 2::08 - (pre) Ácidos nucleicos",
    "D": "Raro::uno_dos*tres",
    "E": "Raro::unoXdosYYtres",
    "Q": 'Raro::comillas "dobles" y \\barra',
    "P": "Predeterminado",
}

# Card states: (type, queue, due, ivl, reps, lapses, s, d, last review (days ago or None), decay).
# due: "now±N" seconds for intraday learning, "next+N" seconds after the next day starts, or days from today.
STATES = {
    "new": (0, 0, None, 0, 0, 0, None, None, None, None),
    "new_susp": (0, -1, None, 0, 0, 0, None, None, None, None),
    "new_bury": (0, -2, None, 0, 0, 0, None, None, None, None),
    "learn_now": (1, 1, "now-600", 0, 1, 0, 2.31, 5.1, 0, None),
    "learn_ahead": (1, 1, "now+600", 0, 2, 0, 1.2, 6.0, 0, None),
    "learn_later": (1, 1, "now+3600", 0, 1, 0, 2.0, 5.0, 0, None),
    "learn_tomorrow": (1, 1, "next+1800", 0, 1, 0, 2.6, 5.5, 0, None),
    "learn_nolrt": (1, 1, "now-300", 0, 2, 0, 1.5, 5.5, None, None),
    "daylearn_due": (1, 3, 0, 0, 2, 0, 2.9, 5.5, 2, None),
    "daylearn_late": (1, 3, -2, 0, 2, 0, 2.2, 5.3, 4, None),
    "daylearn_future": (1, 3, 1, 0, 2, 0, 3.3, 4.4, 1, None),
    "review_due": (2, 2, 0, 5, 4, 0, 6.1, 4.0, 5, None),
    "review_overdue": (2, 2, -7, 10, 6, 0, 11.0, 3.5, None, None),
    "review_future": (2, 2, 4, 8, 5, 0, 9.0, 4.4, 4, 0.1542),
    "review_far": (2, 2, 40, 60, 9, 2, 70.5, 2.5, 20, None),
    "review_old": (2, 2, -30, 3, 7, 3, 2.5, 8.8, 33, 0.3),
    "relearn": (3, 1, "now-60", 3, 8, 1, 1.9, 7.5, 0, None),
    "relearn_day": (3, 3, 0, 4, 8, 1, 2.4, 7.0, 1, None),
    "review_susp": (2, -1, -3, 6, 4, 0, 7.0, 4.5, 9, None),
    "review_bury": (2, -3, 0, 5, 4, 0, 5.0, 5.0, 5, None),
    "learn_susp": (1, -1, "now-100", 0, 1, 0, 1.0, 6.5, 0, None),
    "learn_bury": (1, -2, "now+100", 0, 1, 0, 1.1, 6.6, 0, None),
    "relearn_susp": (3, -1, "now-200", 2, 5, 2, 1.7, 8.0, 0, None),
    "review_nofsrs": (2, 2, -1, 4, 3, 0, None, None, None, None),
}

# Notes: deck, note type, fields, tags, days since it was created, (state, flag) of each card by ord.
NOTES = [
    ("A", "basic", ["Árbol bronquial", "Se ramifica"], ["Anatomía::Columna::Lumbar"], 0, [("new", 0)]),
    ("A", "basic", ["árbol de la vida", "cerebelo"], ["anatomía::Dorso"], 1, [("review_due", 1)]),
    ("A", "reversed", ["VÉRTEBRA lumbar", "Vértebra con cuerpo grande"], ["S3"], 1,
     [("review_overdue", 0), ("learn_now", 2)]),
    ("AX", "basic", ["Niño ñandú", "NIÑO"], [], 3, [("review_future", 0)]),
    ("B", "cloze", ["{{c1::Atlas}} y {{c2::axis}} son vértebras {{c3::cervicales::región}}", "C1 y C2"],
     ["S3", "control"], 10, [("relearn", 0), ("review_susp", 4), ("new_bury", 0)]),
    ("B", "custom", ["Pregunta 50% de", "a_b", "T-A1-S3-02-047"], ["repetida_borrar"], 0,
     [("daylearn_due", 0)]),
    ("C", "basic", ["x*y", "barra \\ invertida"], ["BC::clase8"], 3, [("learn_later", 7)]),
    ("C", "reversed", ['comillas "dobles"', "(paréntesis) y dos:puntos"], ["BC::clase8::extra", "Ñandú"], 1,
     [("new_susp", 0), ("review_bury", 0)]),
    ("C", "custom", ["AND", "or", ""], [], 10, [("review_old", 1)]),
    ("D", "basic", ["dato en raro", ""], ["Raro"], 0, [("new", 3)]),
    ("E", "basic", ["otro raro", "12"], ["Raro::sub"], 0, [("learn_ahead", 0)]),
    ("P", "basic", ["cafe café CAFÉ", "Ångström ﬁn"], ["Química"], 1, [("review_far", 5)]),
    ("A", "cloze", ["El {{c1::cuerpo}} vertebral y el {{c2::arco}}", ""], ["Anatomía::Columna"], 3,
     [("learn_susp", 0), ("learn_bury", 0)]),
    ("B", "basic", ["Fóvea costal", "Superior e inferior"], ["S3", "Anatomía::Columna::Torácica"], 2,
     [("daylearn_late", 6)]),
    ("B", "reversed", ["Apófisis espinosa", "Bífida en C2–C6"], ["S3"], 3,
     [("daylearn_future", 0), ("relearn_day", 2)]),
    ("Q", "basic", ["en el mazo con comillas", "x"], ["control"], 30, [("relearn_susp", 0)]),
    ("AX", "custom", ["Fr dato", "Frase dato", "ÁRBOL"], ["Anatomía"], 5,
     [("learn_tomorrow", 0)]),
    ("C", "basic", ["sin fsrs", "repaso antiguo"], [], 30, [("review_nofsrs", 0)]),
    ("A", "basic", ["aprendiendo sin lrt", "x"], [], 1, [("learn_nolrt", 0)]),
]

# Revlog: (note index, ord, days ago (0 = today), ease, type). ease 0 = manual reschedule.
REVLOG = [
    (1, 0, 0, 3, 1),
    (1, 0, 5, 1, 0),
    (2, 0, 9, 3, 0),
    (2, 0, 2, 2, 1),
    (2, 1, 0, 1, 0),
    (3, 0, 3, 4, 0),
    (4, 0, 0, 1, 1),
    (4, 0, 10, 3, 0),
    (5, 0, 1, 3, 0),
    (5, 0, 0, 2, 0),
    (6, 0, 0, 3, 0),
    (7, 1, 6, 4, 1),
    (7, 1, 1, 3, 1),
    (9, 0, 12, 0, 4),
    (9, 0, 1, 3, 0),
    (11, 0, 0, 4, 0),
    (11, 0, 20, 3, 1),
    (13, 0, 0, 1, 0),
    (14, 1, 2, 3, 0),
    (14, 0, 4, 2, 0),
    (15, 0, 29, 1, 0),
    (15, 0, 0, 0, 4),
    (16, 0, 0, 3, 0),
    (18, 0, 0, 2, 0),
]

U = "unsupported"
SEARCHES = [
    # loose text, accents and case (SQLite LIKE folds only ASCII)
    "", "   ", "árbol", "Árbol", "ÁRBOL", "arbol", "ARBOL", "vértebra", "VÉRTEBRA", "VÉRTEBRA lumbar",
    '"vértebra lumbar"', '"VÉRTEBRA lumbar"', "niño", "NIÑO", "ñandú", "Ñandú", "cafe", "café", "CAFÉ",
    "CAFE", "ﬁn", "fin", "caf_", "c_fe", "v*bra", "v*bra*lumbar", "árbol*cerebelo", "vida*cerebelo",
    "x\\*y", "x*y", "a\\_b", "a_b", "50%", "50\\%", "barra \\\\ invertida", '"barra \\\\ invertida"',
    '"comillas \\"dobles\\""', 'comillas \\"dobles\\"', "\\(paréntesis\\)", '"(paréntesis)"',
    "dos\\:puntos", '"dos:puntos"', "dos:puntos", "T-A1-S3-02-047", "-T-A1", "t-a1-s3", "12", "C2",
    "árbol　vida", "árbol\tvida", "  árbol  ", "*", "_", "**", "\\\\", "and", "AND", '"and"', '"or"',
    "atlas", "{{c1::atlas", "c1", "región", "Ångström", "angstrom",
    # nc:, re:, w:, sc:
    "nc:arbol", "nc:ARBOL", "nc:nino", "nc:NINO", "nc:vertebra", "nc:cafe", "nc:angstrom", "nc:fin",
    "nc:ñandu", "nc:a*b", "re:^árbol", "re:ÁRBOL", '"re:v.rtebra\\s+lumbar"', "re:\\d{2}",
    '"re:(atlas|axis)"', "re:^dato", "re:raro$", "re:^$", '"re:\\bcafé\\b"', "re:c\\x{e1}f", "re:(",
    '"re:a[b"', "re:\\x1f", "w:raro", "w:rar", "w:atlas", "w:café", "w:caf*", "w:vértebra",
    "sc:Atlas y axis", "Atlas y axis", "sc:cervicales", '"sc:atlas y axis"', '"sc:son vértebras cervicales"',
    "sc:región",
    # fields
    "anverso:árbol*", '"anverso:árbol bronquial"', "anverso:ÁRBOL*", "anverso:Árbol*",
    "anverso:*bronquial", "ANVERSO:*bronquial", "reverso:", "reverso:_*", "reverso:*", "reverso:*_",
    "Reverso:12", "código:t-a1*", "CÓDIGO:T-A1-S3-02-047", "código:T-A1-S3-02-04_", "fr*:a_b", "fr*:*a_b",
    "fr*:pregunta*", "fr*:*", "fr*:_*", "fr*:fr dato", "fr*:fr dato*", '"fr*:fr dato*"',
    '"fr*:*frase dato"', "frase:frase dato", '"frase:frase dato"', "*:dog", "*:atlas*", "*:*atlas*",
    "*:ÁRBOL*", "*:árbol", "*:12", "_*:12", "*:re:^árbol", "anverso:re:lumbar$", "anverso:re:^ÁRBOL",
    "anverso:nc:arbol*", "anverso:nc:ARBOL*", "texto:*atlas*", "texto:", "noexiste:x", "a*:x*", "*so:12",
    "re*:*", "anverso:\\(paréntesis\\)*", "reverso:\\(paréntesis\\)*", "reverso:nc:(parentesis)*",
    "reverso:barra \\\\ invertida", '"reverso:barra \\\\ invertida"',
    # decks
    "deck:() Medicina UCH", '"deck:() Medicina UCH"', '"deck:() medicina uch"', "deck:\\(\\)*",
    '"deck:' + DECKS["A"] + '"', '"deck:' + DECKS["AX"] + '"', '"deck:() Medicina UCH::1° Semestre"',
    '"deck:() Medicina UCH::1° Semestre::🦴 Anatomía I"', '"deck:() Medicina UCH::*::Extras"',
    "deck:Raro::uno_dos*tres", "deck:Raro::uno\\_dos\\*tres", "deck:*Vértebras", "deck:*vértebras",
    "deck:*VÉRTEBRAS", "deck:vértebras", "deck:", "deck:*", "deck:filtered", "-deck:Raro*",
    "deck:predeterminado", "deck:Raro", "deck:raro::*", "deck:Raro::", "deck:Raro:: ", "deck:()",
    '"deck:Raro::comillas \\"dobles\\" y \\\\barra"', "deck:*comillas*", "deck:*1°*",
    ("deck:current", U),
    # tags
    "tag:anatomía", "tag:ANATOMÍA", "tag:Anatomía::Columna", "tag:anatomía::columna::lumbar", "tag:Anat*",
    "tag:*lumbar", "tag:*::lumbar", "tag:none", "tag:*", "-tag:*", "tag:s3", "tag:bc", "tag:bc::clase8",
    "tag:ñandú", "tag:Ñ*", "tag:re:^bc", "tag:re:lumbar$", "tag:re:^$", "tag:raro", "tag:repetida_borrar",
    "tag:repetida\\_borrar", "tag:repetida?borrar", "tag:anatomía::", "tag:*a", "tag:_3", '"tag:a b"',
    "-tag:none",
    # note types and templates
    "note:básico", "note:BÁSICO", "note:Básico*", "note:*invertida*", "note:respuesta anidada",
    '"note:respuesta anidada"', '"note:Medicina (código) · Básica"', "note:medicina*", "note:b_sico",
    "card:1", "card:2", "card:3", "card:0", "card:Tarjeta 1", '"card:tarjeta 2"', '"card:Respuesta anidada"',
    "card:pregunta", "card:tarjeta*", "card:TARJETA*", "card:+2",
    # states and flags
    "is:new", "is:learn", "is:review", "is:due", "is:suspended", "is:buried", "-is:suspended",
    "is:new -is:suspended", "is:foo", "is:NEW", "-is:due", "is:due is:learn",
    "flag:0", "flag:1", "flag:3", "flag:7", "flag:8", "flag:x", "-flag:0", "flag:+4",
    # properties
    "prop:due=0", "prop:due<0", "prop:due>0", "prop:due<=-2", "prop:due=1", "prop:due>=4", "prop:due!=0",
    "prop:due=-7", "prop:due>-100", "prop:ivl>=5", "prop:ivl=0", "prop:ivl<4", "prop:reps>3",
    "prop:lapses>0", "prop:lapses=1", "prop:lapses!=0", "prop:s>2", "prop:s<5", "prop:s>=2.31",
    "prop:s=2.31", "prop:s<2.31", "-prop:s>2", "prop:s!=6.1", "prop:d>0.5", "prop:d<0.3", "prop:d=0.5",
    "prop:d>=0.5", "-prop:d<0.5", "prop:r<0.9", "prop:r>0.8", "prop:r<0.5", "-prop:r<0.9", "prop:r>=0.99",
    "prop:r<0.95", "prop:r>0.6", "prop:foo", "prop:ivl", "prop:ivl>x", "prop:due>1.5", "prop:IVL>1",
    "prop:ivl==3", "prop:s>x", "prop:ivl>-1", ("prop:ease>2", U), ("prop:pos>1", U),
    ("prop:rated=-1", U), ("prop:resched=0", U), ("prop:cdn:x>1", U), "prop:rated>1",
    # rated, introduced, added
    "rated:1", "rated:2", "rated:3:1", "rated:7", "rated:7:3", "rated:30", "rated:0", "rated:x",
    "rated:1:5", "rated:1:0", "-rated:7", "rated:2:2", "rated:11", "rated:13",
    "introduced:1", "introduced:2", "introduced:5", "introduced:13", "introduced:30", "introduced:x",
    "added:1", "added:2", "added:4", "added:30", "added:0", "added:-1", "added:x",
    # boolean structure and errors
    "árbol or vértebra", "árbol OR vértebra", "árbol vértebra", "árbol and vértebra",
    "árbol or vértebra is:new", "(árbol or vértebra) is:new", "-(árbol or vértebra)", "-árbol -vértebra",
    "is:new or is:due -flag:0", "(is:new or is:due) (deck:Raro* or tag:s3)", "- árbol", "--árbol", "-",
    "a and", "or a", "a or or b", "a and and b", "(a", "a)", "()", "( )", '""', '"a', ":a", "a\\x", "a\\",
    "(árbol)", "((árbol))", "((árbol) or (raro))", '"is:new"', "IS:new", "Deck:Raro*", "árbol (",
    "is:new or (flag:3 tag:raro)", "-(-árbol)", "árbol -(vida or bronquial)", "a\\ b", '"a\\"',
    "árbol)(", "x:y:z", "\\-árbol", "dato -\\-",
    "re:(?-i)ÁRBOL", '"re:(?-i)ÁRBOL"', '"re:(?-i)Árbol"', '"re:(?-i)árbol"', '"re:(?i)árbol"',
    '"re:(?-i:Á)rbol"', '"re:(?s)dato.en"', "re:\\pL+\\x1f", '"re:a(?-i)RBOL|ÑANDÚ"',
    "prop:r<0.7", "prop:r<0.6", "prop:r>0.97", "prop:r!=1", "prop:due=-30", "prop:due<=0 is:learn",
    "w:c2", "w:bífida", "card:2 note:respuesta*", "tag:control -deck:Raro*", "-is:new -is:review",
    ("nid:1", U), ("cid:1", U), ("did:1", U), ("mid:1", U), ("dupe:1,x", U), ("edited:1", U),
    ("preset:Default", U), ("has-cd:x", U), ("resched:1", U), "nid:x", "dupe:1",
]


def add_custom_notetype(col):
    mm = col.models
    m = mm.new("Medicina (código) · Básica")
    for name in ("Frente", "Frase", "Código"):
        mm.add_field(m, mm.new_field(name))
    t = mm.new_template("Pregunta")
    t["qfmt"] = "{{Frente}}"
    t["afmt"] = "{{FrontSide}}<hr id=answer>{{Frase}}"
    mm.add_template(m, t)
    mm.add(m)
    return mm.by_name("Medicina (código) · Básica")


def main(out_path):
    folder = tempfile.mkdtemp()
    path = os.path.join(folder, "search.anki2")
    col = Collection(path)
    # A collection created 400 days ago, so that day numbers are not around zero.
    col.db.execute("update col set crt = crt - ?", 400 * DAY)
    col.close()
    col = Collection(path)
    prefs = col.get_preferences()
    prefs.scheduling.rollover = 4
    prefs.scheduling.learn_ahead_secs = 1200
    col.set_preferences(prefs)
    col.set_config("fsrs", True)

    models = {m["name"]: m for m in col.models.all()}
    note_types = {
        "basic": models["Básico"],
        "reversed": models["Básico (y tarjeta invertida)"],
        "cloze": models["Respuesta anidada"],
        "custom": add_custom_notetype(col),
    }
    decks = {key: (1 if key == "P" else col.decks.id(name)) for key, name in DECKS.items()}

    timing = col._backend.sched_timing_today()
    today = timing.days_elapsed
    next_day_at = timing.next_day_at
    now = int(time.time())

    note_ids = []
    for n, (deck, kind, fields, tags, days_ago, states) in enumerate(NOTES):
        note = col.new_note(note_types[kind])
        for i, value in enumerate(fields):
            note.fields[i] = value
        note.tags = tags
        col.add_note(note, decks[deck])
        old_id = note.id
        # Created at 05:00 (local) of the day `days_ago` days back, with a per-note offset in ms; card id =
        # note id + ord, as close as Anki's.
        new_id = (next_day_at - (days_ago + 1) * DAY + 3600) * 1000 + n * 10
        col.db.execute("update notes set id = ? where id = ?", new_id, old_id)
        cards = col.db.list("select id from cards where nid = ? order by ord", old_id)
        for ord_, cid in enumerate(cards):
            col.db.execute("update cards set id = ?, nid = ? where id = ?", new_id + ord_, new_id, cid)
        note_ids.append(new_id)
        for ord_, (state, flag) in enumerate(states):
            cid = new_id + ord_
            ctype, queue, due, ivl, reps, lapses, s, d, since, decay = STATES[state]
            if isinstance(due, str):
                base, off = (now, due[3:]) if due.startswith("now") else (next_day_at, due[4:])
                due = base + int(off)
            elif due is None:
                due = col.db.scalar("select due from cards where id = ?", cid)
            else:
                due = today + due
            data = {}
            if s is not None:
                data["s"] = s
                data["d"] = d
            if since is not None:
                data["lrt"] = now - since * DAY - 3600
            if decay is not None:
                data["decay"] = decay
            col.db.execute(
                "update cards set type = ?, queue = ?, due = ?, ivl = ?, reps = ?, lapses = ?, flags = ?, "
                "data = ? where id = ?",
                ctype, queue, due, ivl, reps, lapses, flag,
                json.dumps(data, separators=(",", ":")) if data else "", cid)

    for k, (n, ord_, days_ago, ease, rtype) in enumerate(REVLOG):
        cid = note_ids[n] + ord_
        # Today: from 05:00 on; earlier days: 23:00 of that day.
        at = (next_day_at - DAY + 3600 + 60 * k) if days_ago == 0 else (next_day_at - days_ago * DAY - 5 * 3600)
        col.db.execute(
            "insert into revlog (id, cid, usn, ease, ivl, lastIvl, factor, time, type) "
            "values (?, ?, -1, ?, 1, 0, 0, 1000, ?)",
            at * 1000 + k, cid, ease, rtype)

    # Everything back from the database, as the test sees it.
    guid_of = dict(col.db.all("select id, guid from notes"))
    out_decks = [{"id": str(did), "name": name.replace("\x1f", "::")}
                 for did, name in col.db.all("select id, name from decks")]
    out_types = []
    for key, m in note_types.items():
        m = col.models.get(m["id"])
        out_types.append({"id": str(m["id"]), "name": m["name"], "kind": "cloze" if m["type"] == 1 else "normal",
                          "fields": [f["name"] for f in m["flds"]], "templates": [t["name"] for t in m["tmpls"]]})
    out_cards = []
    for (cid, nid, did, ord_, ctype, queue, due, ivl, reps, lapses, flags, data, mid, flds, tags) in col.db.all(
            "select c.id, c.nid, c.did, c.ord, c.type, c.queue, c.due, c.ivl, c.reps, c.lapses, c.flags, c.data, "
            "n.mid, n.flds, n.tags from cards c join notes n on c.nid = n.id order by c.id"):
        data = json.loads(data) if data else {}
        out_cards.append({
            "noteGuid": guid_of[nid], "ord": ord_, "deckId": str(did), "noteTypeId": str(mid),
            "tags": tags.split(), "fields": flds.split("\x1f"), "createdMs": nid,
            "type": ["new", "learn", "review", "relearn"][ctype],
            "queue": {0: "new", 1: "learn", 2: "review", 3: "dayLearn", 4: "learn", -1: "suspended",
                      -2: "buried", -3: "buried"}[queue],
            "due": None if ctype == 0 else due, "interval": ivl, "reps": reps, "lapses": lapses,
            "flag": flags & 7, "stability": data.get("s"), "difficulty": data.get("d"),
            "lastReview": data.get("lrt"), "decay": data.get("decay"),
        })
    card_key = {cid: [guid_of[nid], ord_] for cid, nid, ord_ in col.db.all("select id, nid, ord from cards")}
    out_revlog = [{"noteGuid": card_key[cid][0], "ord": card_key[cid][1], "ease": ease, "atMs": rid}
                  for rid, cid, ease in col.db.all("select id, cid, ease from revlog order by id")]

    results = []
    for entry in SEARCHES:
        query, flag = (entry if isinstance(entry, tuple) else (entry, None))
        record = {"query": query}
        if flag:
            record["unsupported"] = True
        try:
            cids = col.find_cards(query)
            record["cards"] = sorted(card_key[c] for c in cids)
        except Exception as e:  # noqa: BLE001 - Anki raises several kinds (SearchError, DBError…)
            record["error"] = f"{type(e).__name__}: {e}"
        results.append(record)

    terms = []
    for name in sorted({d["name"] for d in out_decks}):
        terms.append({"kind": "deck", "value": name, "term": col.build_search_string(SearchNode(deck=name))})
    for tag in sorted(col.tags.all()):
        terms.append({"kind": "tag", "value": tag, "term": col.build_search_string(SearchNode(tag=tag))})
    for m in out_types:
        terms.append({"kind": "note", "value": m["name"],
                      "term": col.build_search_string(SearchNode(note=m["name"]))})
    for term in terms:
        try:
            term["cards"] = sorted(card_key[c] for c in col.find_cards(term["term"]))
        except Exception as e:  # noqa: BLE001
            term["error"] = f"{type(e).__name__}: {e}"

    timing = col._backend.sched_timing_today()
    out = {
        "ankiVersion": anki.buildinfo.version if hasattr(anki, "buildinfo") else None,
        "generatedAt": now,
        "timing": {"now": now, "today": timing.days_elapsed, "nextDayAt": timing.next_day_at},
        "learnAheadSecs": col.get_preferences().scheduling.learn_ahead_secs,
        "decks": out_decks,
        "noteTypes": out_types,
        "cards": out_cards,
        "revlog": out_revlog,
        "searches": results,
        "terms": terms,
    }
    col.close()
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    # The repository checks formatting with Prettier: leave the JSON as it would.
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
    subprocess.run(["npx", "prettier", "--write", os.path.abspath(out_path)], cwd=root, check=False,
                   stdout=subprocess.DEVNULL)
    errors = sum(1 for r in results if "error" in r)
    print(f"{len(results)} searches ({errors} errors), {len(terms)} terms, {len(out_cards)} cards → {out_path}")


if __name__ == "__main__":
    import anki.buildinfo  # noqa: F401

    main(sys.argv[1] if len(sys.argv) > 1 else "search.json")
