// The command line of `npm run import`: its help and the options, checked before anything is built or written.
import { parseArgs } from 'node:util';
import { ImportError } from '../errors';
import { PRIVATE_FOLDER_NAME } from '../privateFolder';

const TARGET_CLOUD_GONE =
  '--target cloud ya no existe: el material va al borrador con --target draft y se publica desde ' +
  'Opciones → Publicaciones (el botón «Publicar», que también se puede deshacer). Ver docs/configuracion.md, ' +
  '«Publicar material».';

export const HELP = `Importa los apuntes y mazos de Anki publicados (content/ del repositorio privado) a la base de
contenido.

Uso: npm run import -- [opciones]

  --target folder|draft
                           folder = modo seco en .output/ (por omisión); draft = el borrador
                           (esquema draft de Supabase + R2: no cambia lo que ven los alumnos;
                           se publica desde Opciones → Publicaciones)
  --output <carpeta>       carpeta del modo seco (por omisión, .output)
  --root <carpeta>         carpeta con el material (por omisión, la que contiene el repositorio)
  --content <carpeta>      content/ con el catálogo y los manifiestos (por omisión, QV_CONTENT_DIR o
                           content/ del repositorio privado, ${PRIVATE_FOLDER_NAME}/, junto a este)
  --assessment <id>        solo esa evaluación del catálogo (se puede repetir), p. ej.
                           biologia-celular/certamen-2: sus apuntes, mazos y tests; no toca ni
                           quita nada de otra
  --only <código>          solo ese apunte (se puede repetir); no toca los mazos
  --only-decks             solo los mazos de Anki (content/decks/); no toca los apuntes
  --only-tests             solo los tests de práctica (content/tests/); no toca apuntes ni mazos
  --reset-draft            con --target draft: antes, deja el borrador igual a lo publicado
                           (reset_draft; lo que tenía sin publicar se pierde)
  --allow-warnings         subir al borrador aunque haya avisos (p. ej., una imagen que falta)
  --cache <carpeta>        caché de las imágenes ya convertidas (por omisión, .cache/images)
  -h, --help               esta ayuda
`;

export interface ImportArgs {
  help: boolean;
  target: 'folder' | 'draft';
  output: string | undefined;
  root: string | undefined;
  content: string | undefined;
  cache: string | undefined;
  only: string[];
  assessments: string[];
  onlyDecks: boolean;
  onlyTests: boolean;
  allowWarnings: boolean;
  resetDraft: boolean;
}

export function parseImportArgs(argv?: string[]): ImportArgs {
  const { values } = parseArgs({
    ...(argv ? { args: argv } : {}),
    options: {
      target: { type: 'string', default: 'folder' },
      output: { type: 'string' },
      root: { type: 'string' },
      content: { type: 'string' },
      only: { type: 'string', multiple: true },
      assessment: { type: 'string', multiple: true },
      cache: { type: 'string' },
      'only-decks': { type: 'boolean' },
      'only-tests': { type: 'boolean' },
      'allow-warnings': { type: 'boolean' },
      'reset-draft': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const args = {
    help: values.help ?? false,
    output: values.output,
    root: values.root,
    content: values.content,
    cache: values.cache,
    only: values.only ?? [],
    assessments: values.assessment ?? [],
    onlyDecks: values['only-decks'] ?? false,
    onlyTests: values['only-tests'] ?? false,
    allowWarnings: values['allow-warnings'] ?? false,
    resetDraft: values['reset-draft'] ?? false,
  };
  if (args.help) return { ...args, target: 'folder' };
  return { ...args, target: targetOf(values.target, args) };
}

function targetOf(
  target: string | undefined,
  args: Pick<ImportArgs, 'only' | 'onlyDecks' | 'onlyTests' | 'resetDraft'>,
): 'folder' | 'draft' {
  if ([args.only.length, args.onlyDecks, args.onlyTests].filter(Boolean).length > 1) {
    throw new ImportError('usage', '--only, --only-decks y --only-tests no se pueden usar juntos.');
  }
  if (target === 'cloud') throw new ImportError('usage', TARGET_CLOUD_GONE);
  if (target !== 'folder' && target !== 'draft') {
    throw new ImportError('usage', `Destino desconocido: ${String(target)} (folder o draft).`);
  }
  if (args.resetDraft && target !== 'draft') {
    throw new ImportError('usage', '--reset-draft va solo con --target draft.');
  }
  return target;
}
