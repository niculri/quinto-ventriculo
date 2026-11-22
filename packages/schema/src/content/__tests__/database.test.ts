// The content database's jsonb as the Worker reads it: what a contract accepts, the defaults it fills and what a
// document saved before some fields lacks.
import { describe, expect, it } from 'vitest';
import { CONTENT_RPC, NoteDocument, NoteTypeTemplates, PresetRows } from '../database';

describe('the site settings', () => {
  const returns = CONTENT_RPC.site_settings.returns;
  const row = { hideEmptySemesters: true, updatedAt: null, updatedBy: null };

  it('a database before the switch for courses sends no list, and it reads as empty', () => {
    expect(returns.parse(row)).toEqual({ ...row, hiddenCourses: [] });
    expect(returns.parse({ ...row, hiddenCourses: ['a'] }).hiddenCourses).toEqual(['a']);
  });

  it('needs the switch for empty semesters, and either date may be null but not missing', () => {
    expect(returns.safeParse({ hiddenCourses: [], updatedAt: null, updatedBy: null }).success).toBe(
      false,
    );
    expect(
      returns.safeParse({ hideEmptySemesters: true, hiddenCourses: [], updatedBy: null }).success,
    ).toBe(false);
  });

  it('changing them takes either key and the author, nothing else is needed', () => {
    const args = CONTENT_RPC.set_site_settings.args;
    expect(args.safeParse({ p: { by: 'a' } }).success).toBe(true);
    expect(
      args.safeParse({ p: { hiddenCourses: ['x'], hideEmptySemesters: false, by: 'a' } }).success,
    ).toBe(true);
    expect(args.safeParse({ p: { hideEmptySemesters: false } }).success).toBe(false);
  });
});

describe('the other functions', () => {
  it('a function with no arguments takes none', () => {
    expect(CONTENT_RPC.anki_browse_indexes.args.safeParse(undefined).success).toBe(true);
    expect(CONTENT_RPC.anki_browse_indexes.args.safeParse({}).success).toBe(false);
  });

  it('a card or a quiz that does not exist comes back as null, not as an error', () => {
    expect(CONTENT_RPC.anki_card.returns.safeParse(null).success).toBe(true);
    expect(CONTENT_RPC.quiz_detail.returns.safeParse(null).success).toBe(true);
    expect(CONTENT_RPC.anki_card.args.safeParse({ note_guid: 'g', card_ord: 0 }).success).toBe(
      true,
    );
    expect(CONTENT_RPC.anki_card.args.safeParse({ note_guid: 'g' }).success).toBe(false);
  });

  it('the limit of rows is optional where a page can be asked without it, and required where the media list needs it', () => {
    expect(CONTENT_RPC.release_log.args.safeParse({}).success).toBe(true);
    expect(CONTENT_RPC.anki_card_changes_since.args.safeParse({ since: 3 }).success).toBe(true);
    expect(
      CONTENT_RPC.release_media.args.safeParse({ after_key: null, max_rows: 100 }).success,
    ).toBe(true);
    expect(CONTENT_RPC.release_media.args.safeParse({ after_key: null }).success).toBe(false);
    expect(CONTENT_RPC.release_media.returns.safeParse({ keys: [], next: null }).success).toBe(
      true,
    );
  });

  it('a mark is one of the three, with who checked it', () => {
    const args = CONTENT_RPC.set_release_mark.args;
    const base = { fingerprint: 'f', mark: 'phone', checked: true, checked_by: 'a' };
    expect(args.safeParse(base).success).toBe(true);
    expect(args.safeParse({ ...base, mark: 'other' }).success).toBe(false);
  });

  it('publishing takes the draft’s fingerprint, its checks, its marks and who publishes; reverting a release number', () => {
    const checks = { blocking: 0, pending: 0, ready: true, warnings: [], marks: [] };
    const p = { fingerprint: 'f', title: 'T', schemaVersion: 1, checks, marks: ['phone'], by: 'a' };
    expect(CONTENT_RPC.publish_release.args.safeParse({ p }).success).toBe(true);
    expect(CONTENT_RPC.publish_release.args.safeParse({ p: { ...p, marks: ['x'] } }).success).toBe(
      false,
    );
    expect(CONTENT_RPC.revert_release.args.safeParse({ p: { id: 3, by: 'a' } }).success).toBe(true);
    expect(CONTENT_RPC.revert_release.args.safeParse({ p: { id: '3', by: 'a' } }).success).toBe(
      false,
    );
  });
});

describe('what is stored in jsonb columns', () => {
  it('a note’s document may be null, and a saved one may lack any of its parts', () => {
    expect(NoteDocument.safeParse(null).success).toBe(true);
    expect(NoteDocument.parse({})).toEqual({});
    expect(
      NoteDocument.safeParse({
        sources: ['a'],
        html: '<p>x</p>',
        toc: [1],
        createdOn: '2026-01-01',
      }).success,
    ).toBe(true);
    expect(NoteDocument.safeParse({ sources: 'a' }).success).toBe(false);
  });

  it('the templates keep only their names', () => {
    expect(NoteTypeTemplates.parse([{ name: 'Tarjeta 1', qfmt: '{{Front}}' }])).toEqual([
      { name: 'Tarjeta 1' },
    ]);
    expect(NoteTypeTemplates.safeParse([{ qfmt: 'x' }]).success).toBe(false);
  });

  it('a preset is a name and its whole configuration', () => {
    expect(
      PresetRows.safeParse([{ name: 'Default', config: { new: { perDay: 20 } } }]).success,
    ).toBe(true);
    expect(PresetRows.safeParse([{ name: 'Default', config: [] }]).success).toBe(false);
  });
});
