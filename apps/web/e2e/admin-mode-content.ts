// The content of the admin mode's demo server: the content of the e2e tests with one note more, only in the draft (the
// published site, and the release files the other specs read, stay as they are). Run before that server starts.
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [from, to] = process.argv.slice(2);
if (!from || !to) throw new Error('Usage: admin-mode-content.ts <content folder> <new folder>');

rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });

const path = join(to, 'draft', 'content.json');
const draft = JSON.parse(readFileSync(path, 'utf8')) as { notes: Record<string, unknown>[] };
const model = draft.notes.find((n) => n.id === 'AP-BC-C2-11');
if (!model) throw new Error('The model note is not in the draft.');
draft.notes.push({
  ...model,
  id: 'AP-BC-C2-12',
  slug: '12-regulacion-del-borrador',
  title: 'Regulación (solo en el borrador)',
  position: 3,
  hash: 'e2e-12',
  code: 'QV-BC-C2-12',
  header: { ...(model.header as object), number: '12' },
});
writeFileSync(path, `${JSON.stringify(draft, null, 2)}\n`);
