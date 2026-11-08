// Step 2.4 (the owner's yes, 2026-11-08): the pre-push hook stops a push that carries the owner's data (emails,
// names, paths). The patterns live in the private repository, never here: `tests/prohibidos.txt` of
// ../quinto-ventriculo-privado (or QV_PRIVATE_DIR), one regular expression per line, case-insensitive; empty lines
// and lines that start with «#» are skipped. Without that list (anybody else's clone) nothing is checked.
//
// Every commit of the push is read, not only the final tree (a datum added and taken out again would still be public
// in the history): what each one adds (its diff against its first parent), the paths it touches, its message and its
// author and committer. Binary files and package-lock.json (integrity hashes) are not read. An email is never
// printed whole.
//
//   node .githooks/forbidden.mjs <remote>     (the refs to push on the standard input, as git gives them to pre-push)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PRIVATE_FOLDER_NAME = 'quinto-ventriculo-privado';
const LIST = join('tests', 'prohibidos.txt');
const MAX_SHOWN = 20;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

const git = (args, input) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 1 << 30,
    input,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  });

/** «fulano.real@ug.uchile.cl» → «f•••@ug.uchile.cl»: enough to find it, not the datum itself. */
function maskEmails(text) {
  return text.replace(EMAIL, (email) => {
    const at = email.indexOf('@');
    return `${email[0]}•••${email.slice(at)}`;
  });
}

function readPatterns(file) {
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((text, i) => ({ line: i + 1, text: text.trim() }))
    .filter((p) => p.text && !p.text.startsWith('#'))
    .map((p) => {
      try {
        return { ...p, re: new RegExp(p.text, 'i') };
      } catch {
        throw new Error(`la línea ${p.line} de ${file} no es una expresión regular válida`);
      }
    });
}

/** The commits the push sends: for each ref, what the remote does not have yet. */
function commitsToPush(remote, refLines) {
  const commits = new Set();
  for (const line of refLines) {
    const [, localSha, , remoteSha] = line.trim().split(/\s+/);
    if (!localSha || /^0+$/.test(localSha)) continue; // deleting a ref sends nothing
    let list = null;
    if (remoteSha && !/^0+$/.test(remoteSha)) {
      try {
        list = git(['rev-list', `${remoteSha}..${localSha}`]);
      } catch {
        list = null; // the remote's commit is not here: whatever no remote-tracking ref of this remote has
      }
    }
    list ??= git(['rev-list', localSha, '--not', `--remotes=${remote}`]);
    for (const commit of list.split('\n').filter(Boolean)) commits.add(commit);
  }
  return [...commits];
}

/** What a commit adds: [where, text] pairs (its identities and message, its paths and its added lines). */
function addedBy(commit, emptyTree) {
  const short = commit.slice(0, 7);
  const out = [];
  const meta = git(['log', '-1', '--format=%an%n%ae%n%cn%n%ce%n%B', commit]).split('\n');
  meta.forEach((text, i) =>
    out.push([`commit ${short}, ${i < 4 ? 'autor o committer' : 'mensaje'}`, text]),
  );
  const parent =
    git(['rev-list', '--parents', '-n', '1', commit]).trim().split(' ')[1] ?? emptyTree;
  const spec = ['--', '.', ':(exclude)package-lock.json'];
  for (const path of git(['diff', '--name-only', '--no-renames', parent, commit]).split('\n')) {
    if (path) out.push([`commit ${short}, nombre de archivo`, path]);
  }
  const patch = git([
    'diff',
    '-U0',
    '--no-color',
    '--no-ext-diff',
    '--no-renames',
    parent,
    commit,
    ...spec,
  ]);
  let file = '';
  let lineNo = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line
        .slice(4)
        .replace(/^"?b\//, '')
        .replace(/"$/, '');
    } else if (line.startsWith('@@ ')) {
      lineNo = Number(/\+(\d+)/.exec(line)?.[1] ?? 0);
    } else if (line.startsWith('+')) {
      out.push([`commit ${short}, ${file}:${lineNo}`, line.slice(1)]);
      lineNo++;
    }
  }
  return out;
}

function main() {
  const remote = process.argv[2] ?? '';
  const top = git(['rev-parse', '--show-toplevel']).trim();
  const folder = resolve(process.env.QV_PRIVATE_DIR ?? join(top, '..', PRIVATE_FOLDER_NAME));
  const file = join(folder, LIST);
  if (!existsSync(file)) {
    if (process.env.QV_REQUIRE_PRIVATE === '1') {
      console.error(
        `pre-push: aviso: no está ${file}; no se revisó si el push trae datos prohibidos.`,
      );
    }
    return 0;
  }
  const patterns = readPatterns(file);
  const refLines = readFileSync(0, 'utf8').split('\n').filter(Boolean);
  const commits = commitsToPush(remote, refLines);
  const emptyTree = git(['hash-object', '-t', 'tree', '--stdin'], '').trim();
  const hits = [];
  for (const commit of commits) {
    for (const [where, text] of addedBy(commit, emptyTree)) {
      const p = patterns.find((x) => x.re.test(text));
      if (p) hits.push({ where, pattern: p.line, text: maskEmails(text).trim().slice(0, 160) });
    }
  }
  if (!hits.length) return 0;
  console.error('');
  console.error(
    `pre-push: lo que vas a empujar trae datos que no pueden ir a este repositorio (${hits.length}, según ${file}):`,
  );
  for (const h of hits.slice(0, MAX_SHOWN)) {
    console.error(`  ${h.where} · patrón de la línea ${h.pattern}: ${h.text}`);
  }
  if (hits.length > MAX_SHOWN) console.error(`  … y ${hits.length - MAX_SHOWN} más.`);
  console.error('');
  console.error(
    'El push se canceló. Sácalo de los commits (también de los anteriores al último: el historial es público) y',
  );
  console.error('vuelve a empujar. No uses --no-verify para esto.');
  return 1;
}

try {
  process.exitCode = main();
} catch (e) {
  console.error(
    `pre-push: no pude revisar los datos prohibidos: ${e instanceof Error ? e.message : e}`,
  );
  process.exitCode = 2;
}
