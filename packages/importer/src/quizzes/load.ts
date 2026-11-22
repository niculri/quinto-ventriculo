// Reads a test folder as the skill's `cargar()` does: test.json and the question files of its sections.
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { ImportError } from '../errors';
import { asText } from './inline';
import type { LoadedGroup } from './schema';

type Record_ = Record<string, unknown>;

const isRecord = (x: unknown): x is Record_ => !!x && typeof x === 'object' && !Array.isArray(x);

async function readJson(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    throw new ImportError('material', `No existe ${path}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new ImportError('material', `${path}: JSON inválido (${(e as Error).message})`, {
      cause: e,
    });
  }
}

async function jsonFiles(folder: string): Promise<string[]> {
  try {
    return (await readdir(folder)).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return [];
  }
}

/** [section id, folder, prefix of its files' names] for each place the question files are. */
function placesOf(cfg: Record_, folder: string): [string | null, string, string][] {
  const sections = cfg.secciones;
  if (Array.isArray(sections) && sections.length) {
    return (sections as Record_[]).map((s) => {
      const prefix = asText(s.carpeta ?? '');
      return [asText(s.id ?? ''), join(folder, prefix), prefix];
    });
  }
  return [[null, join(folder, 'preguntas'), '']];
}

/** The question files of a place: the ones test.json lists for the only place, else every .json of its folder. */
async function filesOf(cfg: Record_, folder: string, section: string | null, dir: string) {
  return section === null && Array.isArray(cfg.grupos)
    ? (cfg.grupos as string[]).map((g) => join(folder, g))
    : (await jsonFiles(dir)).map((f) => join(dir, f));
}

export async function loadTest(folder: string): Promise<{ cfg: Record_; groups: LoadedGroup[] }> {
  const raw = await readJson(join(folder, 'test.json'));
  const cfg: Record_ = isRecord(raw) ? raw : {};
  const groups: LoadedGroup[] = [];
  for (const [section, dir, prefix] of placesOf(cfg, folder)) {
    for (const p of await filesOf(cfg, folder, section, dir)) {
      const read = await readJson(p);
      const data: unknown = Array.isArray(read) ? { preguntas: read } : read;
      const stem = basename(p).replace(/\.json$/, '');
      const id = isRecord(data) && data.id !== undefined && data.id !== null ? data.id : stem;
      groups.push({
        data,
        id: asText(id),
        file: prefix ? `${prefix}/${basename(p)}` : basename(p),
        section,
      });
    }
  }
  return { cfg, groups };
}
