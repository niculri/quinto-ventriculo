// Tests that the decks of several packages share one version of each note type: the newest, with fields by name.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readApkgFile } from '@qv/anki-format';
import type { AnkiPackage } from '@qv/anki-format';
import { buildDecks } from '../decks';

const SAMPLE = join(import.meta.dirname, '../../../anki-format/test/fixtures/sample.apkg');
const BASIC = 'Prueba · Básica';

const assessment = {
  id: 'anatomia-1/certamen-1',
  courseId: 'anatomia-1',
  name: 'Certamen 1',
  position: 1,
};

/** A copy of the sample package with its own decks and notes, and its note type changed by `edit`. */
async function variant(
  tag: string,
  edit: (type: AnkiPackage['collection']['noteTypes'][number]) => void,
  notes: (note: AnkiPackage['collection']['notes'][number]) => void = () => {},
  others: (type: AnkiPackage['collection']['noteTypes'][number]) => void = () => {},
): Promise<AnkiPackage> {
  const pkg = await readApkgFile(SAMPLE);
  const c = structuredClone(pkg.collection);
  const id = (x: string) => `${tag.charCodeAt(0)}${x}`;
  c.noteTypes.filter((t) => t.name === BASIC).forEach(edit);
  c.noteTypes.filter((t) => t.name !== BASIC).forEach(others);
  c.decks.forEach((d) => {
    d.id = id(d.id);
    d.name = d.name.replace('Mazo', tag);
  });
  c.cards.forEach((k) => (k.deckId = id(k.deckId)));
  c.notes.forEach((n) => {
    n.guid = `${tag}-${n.guid}`;
    notes(n);
  });
  return { ...pkg, collection: c };
}

async function run(packages: Record<string, AnkiPackage>) {
  const entries = Object.keys(packages).map((apkg) => ({ apkg }));
  return buildDecks({
    manifests: [{ assessmentId: assessment.id, decks: entries }],
    assessments: new Map([[assessment.id, assessment]]),
    courses: [{ id: 'anatomia-1', semester: 1, name: 'Anatomía I', emoji: '🦴', position: 1 }],
    semesters: [{ number: 1, name: '1° Semestre' }],
    root: '/x',
    process: async () => {
      throw new Error('no images here');
    },
    read: async (path) => packages[path.split('/').at(-1)!]!,
  });
}

describe('buildDecks note types', () => {
  it('uses the newest version of a note type for every package, even when it is read first', async () => {
    const nuevo = await variant('Nuevo', (t) => {
      t.mod += 100;
      t.css += '\n.version-nueva {}';
      t.fields = [...t.fields, 'Prioridad'];
    });
    const viejo = await variant('Viejo', () => {});
    const { noteTypes, notes, warnings } = await run({ 'Nuevo.apkg': nuevo, 'Viejo.apkg': viejo });
    const basic = noteTypes.filter((t) => t.name === BASIC);
    expect(basic).toHaveLength(1);
    expect(basic[0]!.css).toContain('.version-nueva');
    expect(basic[0]!.fields.at(-1)).toBe('Prioridad');
    expect(warnings.filter((w) => /tipo de nota/.test(w))).toEqual([]);
    const fromOld = notes.filter(
      (n) => n.guid.startsWith('Viejo-') && n.noteTypeId === basic[0]!.id,
    );
    expect(fromOld.length).toBeGreaterThan(0);
    expect(fromOld.every((n) => n.fields['Prioridad'] === '')).toBe(true);
  });

  it('maps a note with fewer fields by name, and renders it with the newest templates', async () => {
    const nuevo = await variant('Nuevo', (t) => {
      t.mod += 100;
      t.templates[0]!.qfmt += '<i class="de-la-nueva">{{Frente}}</i>';
    });
    const viejo = await variant(
      'Viejo',
      () => {},
      (n) => (n.fields = n.fields.slice(0, 2)),
    );
    const { notes } = await run({ 'Viejo.apkg': viejo, 'Nuevo.apkg': nuevo });
    const old = notes.find((n) => n.guid.startsWith('Viejo-') && n.fields['Frente'])!;
    expect(old.fields['Código']).toBe('');
    expect(old.cards[0]!.frontHtml).toContain('de-la-nueva');
  });

  it('on equal mod and different content, the order of the packages does not matter, and it is reported', async () => {
    const a = await variant('A', (t) => (t.css += '\n.de-a {}'));
    const b = await variant('B', (t) => (t.css += '\n.de-b {}'));
    const forward = await run({ 'A.apkg': a, 'B.apkg': b });
    const backward = await run({ 'B.apkg': b, 'A.apkg': a });
    const css = (r: typeof forward) => r.noteTypes.find((t) => t.name === BASIC)!.css;
    expect(css(forward)).toBe(css(backward));
    expect(forward.warnings.filter((w) => /misma fecha/.test(w))).toHaveLength(1);
  });

  it('puts the site footer on the newest version, which the notes of every package render', async () => {
    const nuevo = await variant('Nuevo', (t) => {
      t.mod += 100;
      t.fields = [...t.fields, 'Creación', 'Actualización'];
      t.templates[0]!.afmt += '{{#Código}}<div class="pie">de Anki {{Código}}</div>{{/Código}}';
    });
    const viejo = await variant('Viejo', () => {});
    const { noteTypes, notes } = await run({ 'Viejo.apkg': viejo, 'Nuevo.apkg': nuevo });
    const basic = noteTypes.find((t) => t.name === BASIC)!;
    expect(basic.templates[0]!.afmt).toContain('creada el {{Creación}}');
    expect(basic.templates[0]!.afmt).not.toContain('de Anki');
    expect(basic.css).toContain('the footer goes in the flow');
    const old = notes.find((n) => n.guid.startsWith('Viejo-') && n.fields['Código'])!;
    expect(old.cards[0]!.backHtml).toContain('creada el');
    expect(old.cards[0]!.backHtml).not.toContain('de Anki');
  });

  it('keeps the fields by name when the newest version drops one in the middle', async () => {
    const nuevo = await variant('Nuevo', (t) => {
      t.mod += 100;
      t.fields = t.fields.filter((f) => f !== 'Pista');
    });
    const viejo = await variant('Viejo', () => {});
    const { notes } = await run({ 'Viejo.apkg': viejo, 'Nuevo.apkg': nuevo });
    const old = notes.find((n) => n.guid.startsWith('Viejo-') && n.fields['Frente'])!;
    expect(old.fields['Pista']).toBeUndefined();
    expect(old.fields['Código']).toMatch(/^T-PR-/);
    expect(old.code).toBe('T-PR-01-001');
  });

  it('an occlusion note type keeps working when the newest version adds a field', async () => {
    const nuevo = await variant(
      'Nuevo',
      () => {},
      () => {},
      (t) => {
        t.mod += 100;
        t.fields = [...t.fields, 'Prioridad'];
      },
    );
    const viejo = await variant('Viejo', () => {});
    const { noteTypes, notes } = await run({ 'Viejo.apkg': viejo, 'Nuevo.apkg': nuevo });
    const occlusion = noteTypes.find((t) => t.name === 'Prueba · Oclusión')!;
    expect(occlusion.occlusion).toBe(true);
    const old = notes.find((n) => n.guid.startsWith('Viejo-') && n.noteTypeId === occlusion.id)!;
    expect(old.fields['Prioridad']).toBe('');
    expect(old.cards[0]!.frontHtml).toContain('image-occlusion-container');
  });

  it('says which fields of an older note are dropped', async () => {
    const nuevo = await variant('Nuevo', (t) => {
      t.mod += 100;
      t.fields = t.fields.filter((f) => f !== 'Pista');
    });
    const viejo = await variant('Viejo', () => {});
    const { warnings } = await run({ 'Viejo.apkg': viejo, 'Nuevo.apkg': nuevo });
    expect(warnings.some((w) => /Viejo\.apkg.*«Prueba · Básica».*Pista/.test(w))).toBe(true);
  });
});
