// Tests `npm run unpublish` in this process: what it prints, what it asks and what it refuses.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { manifest } from '../../test/importerFixtures';
import { HELP } from '../unpublishArgs';

const cloud = vi.hoisted(() => ({
  rpcs: [] as { fn: string; args: Record<string, unknown> }[],
  answer: {},
  deletedPrefixes: [] as string[],
  asked: [] as string[],
  reply: 's',
}));

vi.mock('../../targets/contentDatabase', () => ({
  contentDatabase: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      cloud.rpcs.push({ fn, args });
      return { data: (cloud.answer as Record<string, unknown>)[fn] ?? null, error: null };
    },
  }),
}));

vi.mock('../../targets/r2', () => ({
  r2Media: () => ({
    has: async () => false,
    delete: async () => undefined,
    deletePrefix: async (p: string) => {
      cloud.deletedPrefixes.push(p);
      return 2;
    },
  }),
}));

vi.mock('node:readline/promises', () => ({
  createInterface: () => ({
    question: async (q: string) => {
      cloud.asked.push(q);
      return cloud.reply;
    },
    close: () => undefined,
  }),
}));

const { appliedSummary, runUnpublish } = await import('../runUnpublish');

let content: string;
let out: string[];
const listFile = () => join(content, 'unpublished.json');

const ENV = {
  CONTENT_SUPABASE_URL: 'https://content.example.test',
  CONTENT_SERVICE_ROLE_KEY: 'service',
  R2_ACCOUNT_ID: 'cuenta',
  R2_ACCESS_KEY_ID: 'id',
  R2_SECRET_ACCESS_KEY: 'secreto',
  R2_BUCKET: 'balde',
};

beforeAll(async () => {
  content = await mkdtemp(join(tmpdir(), 'qv-run-unpublish-'));
  await mkdir(join(content, 'notes'), { recursive: true });
  await writeFile(join(content, 'catalog.json'), JSON.stringify(manifest.catalog));
  await writeFile(join(content, 'notes/bc.json'), JSON.stringify(manifest.notes[0]));
});

afterAll(() => rm(content, { recursive: true, force: true }));

beforeEach(async () => {
  out = [];
  cloud.rpcs.length = 0;
  cloud.answer = {};
  cloud.deletedPrefixes.length = 0;
  cloud.asked.length = 0;
  cloud.reply = 's';
  await rm(listFile(), { force: true });
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void out.push(a.join(' ')));
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const noteResult = (over: object = {}) => ({
  kind: 'note',
  id: 'AP-BC-C2-11',
  found: true,
  title: 'Traducción',
  assessmentId: 'biologia-celular/certamen-2',
  removed: { sections: 4 },
  usedBy: [],
  logId: 17,
  ...over,
});

const entry = (kind: string, id: string) => ({
  kind,
  id,
  reason: 'Error grave',
  date: '2026-11-08',
  by: 'yo',
});

describe('runUnpublish: reading', () => {
  it('prints the help and nothing else', async () => {
    await runUnpublish(['--help']);
    expect(out).toEqual([HELP]);
  });

  it('--list shows each piece with its date, kind, id, reason and who, or says there is nothing', async () => {
    await runUnpublish(['--content', content, '--list']);
    expect(out).toEqual(['No hay nada fuera del sitio.']);
    await writeFile(
      listFile(),
      JSON.stringify({
        items: [
          entry('note', 'AP-BC-C2-11'),
          { ...entry('quiz', 'q'), by: undefined, reason: 'Otra' },
        ],
      }),
    );
    out.length = 0;
    await runUnpublish(['--content', content, '--list']);
    expect(out).toEqual([
      '2026-11-08  note  AP-BC-C2-11  — Error grave (yo)\n2026-11-08  quiz  q  — Otra',
    ]);
  });

  it('a piece that is not well named is an error of usage, before the manifest is read', async () => {
    await expect(runUnpublish(['--content', content, 'page', 'x'])).rejects.toThrow(
      /^Uso: npm run unpublish/,
    );
  });
});

describe('runUnpublish --restore', () => {
  it('takes the piece out of the list and says how to publish it again, with its assessment when the manifest has it', async () => {
    await writeFile(listFile(), JSON.stringify({ items: [entry('note', 'AP-BC-C2-11')] }));
    await runUnpublish(['--content', content, '--restore', 'note', 'QV-BC-C2-11']);
    expect(out[0]).toContain('Se sacó note AP-BC-C2-11 de content/unpublished.json.');
    expect(out[0]).toContain(
      'npm run import -- --target draft --assessment biologia-celular/certamen-2',
    );
    expect((JSON.parse(await readFile(listFile(), 'utf8')) as { items: unknown[] }).items).toEqual(
      [],
    );
  });

  it('--dry-run says what it would do and changes nothing; a deck has no assessment in the manifest', async () => {
    await writeFile(
      listFile(),
      JSON.stringify({ items: [entry('note', 'AP-BC-C2-11'), entry('deck', '2059400110')] }),
    );
    await runUnpublish(['--content', content, '--restore', '--dry-run', 'deck', '2059400110']);
    expect(out[0]).toContain(
      'Se sacaría deck 2059400110 de content/unpublished.json (--dry-run: no se cambió nada).',
    );
    expect(out[0]).toContain('npm run import -- --target draft\n');
    expect(
      (JSON.parse(await readFile(listFile(), 'utf8')) as { items: unknown[] }).items,
    ).toHaveLength(2);
  });

  it('a piece that is not in the list says so, and for a deck it hints that it goes by its id', async () => {
    await runUnpublish(['--content', content, '--restore', 'note', 'AP-BC-C2-12']);
    expect(out[0]).toBe('note AP-BC-C2-12 no está en content/unpublished.json.');
    await runUnpublish(['--content', content, '--restore', 'deck', '123']);
    expect(out[1]).toBe(
      'deck 123 no está en content/unpublished.json (un mazo va por su id: --list lo muestra).',
    );
  });
});

describe('runUnpublish taking a piece off', () => {
  const answers = (over: object = {}) => {
    cloud.answer = {
      unpublish_content: noteResult(over),
      unpublish_draft: { found: false, removed: 0 },
    };
  };
  const tty = (input: boolean, output = input) => {
    Object.defineProperty(process.stdin, 'isTTY', { value: input, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: output, configurable: true });
  };

  afterEach(() => {
    delete (process.stdin as { isTTY?: boolean }).isTTY;
    delete (process.stdout as { isTTY?: boolean }).isTTY;
  });

  const args = (...extra: string[]) => [
    '--content',
    content,
    '--reason',
    'Error grave',
    '--by',
    'yo',
    ...extra,
  ];

  it('with --yes it goes without asking, writes the list and tells what happened', async () => {
    answers();
    await runUnpublish(args('--yes', 'note', 'AP-BC-C2-11'));
    expect(cloud.asked).toEqual([]);
    expect((JSON.parse(await readFile(listFile(), 'utf8')) as { items: unknown[] }).items).toEqual([
      expect.objectContaining({ kind: 'note', id: 'AP-BC-C2-11', reason: 'Error grave', by: 'yo' }),
    ]);
    const summary = out.at(-1)!;
    expect(summary).toContain('Fuera del sitio: note AP-BC-C2-11 (registro 17).');
    expect(summary).toContain(
      'Anotado en content/unpublished.json: haz commit en el repositorio privado.',
    );
    expect(summary).toMatch(/Tiempo: \d\.\d s \(2 llamadas a la base, 0 a R2\)\./);
    expect(summary).not.toContain('Explorador de tarjetas');
  });

  it('without a terminal it cannot ask, so it needs --yes and writes nothing', async () => {
    answers();
    for (const [input, output] of [
      [false, false],
      [true, false],
      [false, true],
    ] as const) {
      tty(input, output);
      await expect(runUnpublish(args('note', 'AP-BC-C2-11'))).rejects.toThrow(
        'Sin terminal para confirmar: usa --yes.',
      );
    }
    await expect(readFile(listFile())).rejects.toThrow();
  });

  it('with a terminal it asks, and only an affirmative answer, in any case, takes the piece off', async () => {
    answers();
    tty(true);
    for (const reply of ['No', '', 'nunca', 'sí', ' S ', 'YES', 'y', 'Si']) {
      cloud.reply = reply;
      cloud.rpcs.length = 0;
      await rm(listFile(), { force: true });
      await runUnpublish(args('note', 'AP-BC-C2-11'));
      const took = cloud.rpcs.filter((r) => r.args.apply === true).length === 1;
      expect(took).toBe(/^\s*(s|si|sí|y|yes)\s*$/i.test(reply));
    }
    expect(cloud.asked.every((q) => q === '¿Sacarlo del sitio? (s/N) ')).toBe(true);
    expect(cloud.asked).toHaveLength(8);
  });

  it('a piece already in the list says so, and a deck reports the index files it removed', async () => {
    await writeFile(listFile(), JSON.stringify({ items: [entry('deck', '2059400110')] }));
    cloud.answer = {
      unpublish_content: noteResult({
        kind: 'deck',
        id: '2059400110',
        assessmentId: 'biologia-celular/certamen-2',
        removed: { decks: 1, assessments: ['biologia-celular/certamen-2'] },
        logId: null,
      }),
    };
    await runUnpublish(args('--yes', 'deck', '2059400110'));
    const summary = out.at(-1)!;
    expect(summary).toContain('Fuera del sitio: deck 2059400110.');
    expect(summary).toContain('Ya estaba en content/unpublished.json.');
    expect(summary).toContain('Explorador de tarjetas: 2 archivos de índice borrados');
    expect(cloud.deletedPrefixes).toEqual(['browse/biologia-celular/certamen-2/']);
  });

  it('an image that went with its thumbnail says so', async () => {
    const KEY = `cards/${'a'.repeat(32)}.webp`;
    cloud.answer = {
      unpublish_content: noteResult({
        kind: 'image',
        id: KEY,
        found: false,
        title: null,
        assessmentId: null,
        usedBy: [{ kind: 'note', id: 'AP-1', title: 'Uno' }],
      }),
      unpublish_draft: { found: false, removed: 0 },
    };
    await runUnpublish(args('--yes', 'image', KEY));
    expect(out.at(-1)).not.toContain('miniatura');
  });

  it('--dry-run says what it would take off and counts the calls, without writing or asking', async () => {
    answers();
    await runUnpublish(['--content', content, '--dry-run', 'note', 'AP-BC-C2-11']);
    expect(out.at(-1)).toMatch(
      /^\n\(--dry-run: no se sacó nada; 1 llamada a la base, \d\.\d s\.\)$/,
    );
    expect(cloud.asked).toEqual([]);
    await expect(readFile(listFile())).rejects.toThrow();
  });

  it('with no answer to the question nothing happens and nothing more is printed', async () => {
    answers();
    tty(true);
    cloud.reply = 'n';
    await runUnpublish(args('note', 'AP-BC-C2-11'));
    expect(out.some((l) => l.startsWith('Fuera del sitio'))).toBe(false);
    expect(out).toContain('No se sacó nada.');
  });

  it('the person who asks defaults to the user of the computer, and the reason is needed to take it off', async () => {
    answers();
    await runUnpublish([
      '--content',
      content,
      '--reason',
      'Motivo',
      '--yes',
      'note',
      'AP-BC-C2-11',
    ]);
    expect(cloud.rpcs[0]!.args.requested_by).toEqual(expect.any(String));
    expect(cloud.rpcs[0]!.args.requested_by).not.toBe('');
    await expect(
      runUnpublish(['--content', content, '--yes', 'note', 'AP-BC-C2-11']),
    ).rejects.toThrow(/Falta el motivo/);
  });
});

describe('appliedSummary', () => {
  const outcome = (over: object = {}, result: object = {}) =>
    ({
      result: { kind: 'note', id: 'AP-1', logId: null, ...result },
      applied: true,
      alreadyListed: false,
      calls: { db: 2, store: 3 },
      ms: 1500,
      ...over,
    }) as Parameters<typeof appliedSummary>[0];

  it('a deck says how many index files went, zero when the outcome does not say', () => {
    expect(appliedSummary(outcome({ indexFiles: 4 }, { kind: 'deck' }))).toContain(
      'Explorador de tarjetas: 4 archivos de índice borrados',
    );
    expect(appliedSummary(outcome({}, { kind: 'deck' }))).toContain(
      'Explorador de tarjetas: 0 archivos de índice borrados',
    );
  });

  it('another kind mentions the thumbnail only if one was deleted', () => {
    expect(appliedSummary(outcome({ indexFiles: 1 }, { kind: 'image' }))).toContain(
      'También se borró su miniatura del explorador de tarjetas.',
    );
    for (const o of [{ indexFiles: 0 }, {}]) {
      expect(appliedSummary(outcome(o, { kind: 'image' }))).not.toContain('miniatura');
    }
  });

  it('the log is named only when there is one, and the time and the calls close the summary', () => {
    expect(appliedSummary(outcome({}, { logId: 9 }))).toContain(
      'Fuera del sitio: note AP-1 (registro 9).',
    );
    expect(appliedSummary(outcome())).toContain('Fuera del sitio: note AP-1.');
    expect(appliedSummary(outcome()).split('\n').at(-1)).toBe(
      'Tiempo: 1.5 s (2 llamadas a la base, 3 a R2).',
    );
  });
});
