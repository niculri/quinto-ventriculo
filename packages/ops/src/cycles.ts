// Import cycles and their baseline (.import-cycles.json). Two kinds: between files (dependency-cruiser's no-circular),
// and between the web's top folders (a feature, app, ui, lib, shared/<x>), found here on the graph of the web with
// its paths collapsed to those folders, so that splitting a feature into api/, hooks/… changes no key.

export const CYCLES_FILE = '.import-cycles.json';
const WEB = 'apps/web/src/';

export interface Baseline {
  /** «from → to» of a file dependency inside a cycle. */
  files: string[];
  /** «from → to» of a dependency between two top folders of the web that are in a cycle. */
  folders: string[];
}

export interface Cruise {
  modules: { source: string; dependencies: { resolved: string }[] }[];
  summary: { violations: { from: string; to: string; rule: { name: string } }[] };
}

const key = (from: string, to: string) => `${from} → ${to}`;

/** The web folder a path belongs to: features/<x>, shared/<x>, or the first folder (or file) under src. */
export function webFolder(path: string): string | null {
  if (!path.startsWith(WEB)) return null;
  const parts = path.slice(WEB.length).split('/');
  const depth = (parts[0] === 'features' || parts[0] === 'shared') && parts.length > 2 ? 2 : 1;
  return WEB + parts.slice(0, depth).join('/');
}

/** The dependencies between two different web folders that belong to the same strongly connected component. */
export function folderCycles(modules: Cruise['modules']): string[] {
  const graph = new Map<string, Set<string>>();
  for (const m of modules) {
    const from = webFolder(m.source);
    if (!from) continue;
    const out = graph.get(from) ?? new Set<string>();
    graph.set(from, out);
    for (const d of m.dependencies) {
      const to = webFolder(d.resolved);
      if (to && to !== from) out.add(to);
    }
  }
  const component = stronglyConnected(graph);
  const keys: string[] = [];
  for (const [from, out] of graph) {
    for (const to of out) if (component.get(from) === component.get(to)) keys.push(key(from, to));
  }
  return keys.sort();
}

export function currentCycles(cruise: Cruise): Baseline {
  const files = cruise.summary.violations
    .filter((v) => v.rule.name === 'no-circular')
    .map((v) => key(v.from, v.to));
  return { files: [...new Set(files)].sort(), folders: folderCycles(cruise.modules) };
}

export function readBaseline(json: string): Baseline {
  const parsed = JSON.parse(json) as Partial<Baseline>;
  const list = (v: unknown) => {
    if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
      throw new Error(`${CYCLES_FILE} no tiene la forma { files: [...], folders: [...] }.`);
    }
    return v;
  };
  return { files: list(parsed.files), folders: list(parsed.folders) };
}

export const writeBaseline = (b: Baseline) => `${JSON.stringify(b, null, 2)}\n`;

/** The keys of `a` that are not in `b`, by kind. */
export function gained(a: Baseline, b: Baseline): Baseline {
  const without = (x: string[], y: string[]) => x.filter((k) => !y.includes(k));
  return { files: without(a.files, b.files), folders: without(a.folders, b.folders) };
}

export const count = (b: Baseline) => b.files.length + b.folders.length;

/** Tarjan's algorithm: the component number of each node. */
function stronglyConnected(graph: Map<string, Set<string>>): Map<string, number> {
  let next = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const component = new Map<string, number>();
  const visit = (v: string) => {
    index.set(v, next);
    low.set(v, next++);
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
    }
    if (low.get(v) === index.get(v)) {
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.set(w, index.get(v)!);
      } while (w !== v);
    }
  };
  for (const v of graph.keys()) if (!index.has(v)) visit(v);
  return component;
}
