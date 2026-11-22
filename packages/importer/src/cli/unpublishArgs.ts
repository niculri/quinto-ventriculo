// The command line of `npm run unpublish`: its help and the options.
import { parseArgs } from 'node:util';
import { UnpublishedKind } from '../manifest/schemas';
import { ImportError } from '../ImportError';
import { PRIVATE_FOLDER_NAME } from '../privateFolder';

export const HELP = `Saca del sitio un artículo, un mazo (con los de abajo), un test o una imagen, en segundos, sin
tocar el avance de los alumnos, y lo anota en content/unpublished.json para que ninguna importación lo
vuelva a publicar.

Uso: npm run unpublish -- <tipo> <id> --reason "…" [opciones]

  <tipo>                 note (artículo: AP-…, QV-… o su slug), deck (id o nombre completo del mazo),
                         quiz (id o slug del test) o image (clave en R2: notes/<hash>.webp, cards/…, tests/…)
  --reason "…"           por qué (obligatorio para sacarlo; queda en la lista y en el registro)
  --dry-run              solo dice qué sacaría (del sitio, o de la lista con --restore)
  --yes                  no pregunta (para un script)
  --above-assessment     acepta un mazo de ramo, semestre o la raíz (se lleva todas sus evaluaciones)
  --by <quién>           quién lo pide (por omisión, el usuario del computador)
  --restore              lo saca de content/unpublished.json; para publicarlo de nuevo, importa después
  --list                 muestra lo que está fuera del sitio
  --content <carpeta>    content/ (por omisión, QV_CONTENT_DIR o content/ del repositorio privado,
                         ${PRIVATE_FOLDER_NAME}/, junto a este)
  -h, --help             esta ayuda

Necesita las variables de la nube (las mismas de npm run import -- --target draft), salvo --restore y --list.
Saca la pieza de lo publicado y del borrador a la vez.
`;

export interface UnpublishArgs {
  help: boolean;
  list: boolean;
  restore: boolean;
  dryRun: boolean;
  yes: boolean;
  aboveAssessment: boolean;
  reason: string | undefined;
  by: string | undefined;
  content: string | undefined;
  /** What came after the options: the kind and the id of the piece, unchecked. */
  positionals: string[];
}

/** The kind and the id of the piece, checked. */
export function pieceOf(args: Pick<UnpublishArgs, 'positionals'>): {
  kind: UnpublishedKind;
  id: string;
} {
  const [kindText, id] = args.positionals;
  const kind = UnpublishedKind.safeParse(kindText);
  if (!kind.success || !id || args.positionals.length !== 2) {
    throw new ImportError(
      'usage',
      `Uso: npm run unpublish -- <note|deck|quiz|image> <id> --reason "…" (--help)`,
    );
  }
  return { kind: kind.data, id };
}

export function parseUnpublishArgs(argv?: string[]): UnpublishArgs {
  const { values, positionals } = parseArgs({
    ...(argv ? { args: argv } : {}),
    allowPositionals: true,
    options: {
      reason: { type: 'string' },
      'dry-run': { type: 'boolean' },
      yes: { type: 'boolean', short: 'y' },
      'above-assessment': { type: 'boolean' },
      by: { type: 'string' },
      restore: { type: 'boolean' },
      list: { type: 'boolean' },
      content: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const args = {
    help: values.help ?? false,
    list: values.list ?? false,
    restore: values.restore ?? false,
    dryRun: values['dry-run'] ?? false,
    yes: values.yes ?? false,
    aboveAssessment: values['above-assessment'] ?? false,
    reason: values.reason,
    by: values.by,
    content: values.content,
  };
  return { ...args, positionals };
}
