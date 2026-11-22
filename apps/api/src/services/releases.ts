// Why the database refuses to publish or to undo a release, as the answer the panel gets: the status, the code and
// the message in Spanish (with the detail for the refusals that name something).
import type { ApiError } from '@qv/schema';
import type { ErrorCode } from '@qv/schema/http';
import { apiError } from '../http';

type Refusal = { status: 400 | 409 | 422; code: ErrorCode; message: string; named?: boolean };

const PUBLISH_INVALID: Refusal = {
  status: 400,
  code: 'invalid_release',
  message: 'Esa publicación no es válida.',
};
const REVERT_INVALID: Refusal = {
  status: 400,
  code: 'invalid_release',
  message: 'Esa publicación no existe.',
};

const PUBLISH_REFUSALS: Record<string, Refusal | undefined> = {
  fingerprint: {
    status: 409,
    code: 'release_changed',
    message: 'El borrador o lo publicado cambió: revisa de nuevo lo que trae.',
  },
  marks: {
    status: 422,
    code: 'release_marks',
    message: 'Faltan las marcas a mano de este borrador.',
  },
  blocked: {
    status: 422,
    code: 'release_blocked',
    message: 'La lista de revisión tiene reglas que impiden publicar.',
  },
  schema_version: {
    status: 422,
    code: 'release_schema_version',
    message:
      'El borrador es de otra versión que la que entiende el sitio en línea: despliega el sitio o sube de nuevo el borrador.',
  },
  unpublished: {
    status: 422,
    code: 'release_unpublished',
    message: 'El borrador trae algo que está fuera del sitio (content/unpublished.json).',
    named: true,
  },
  imaios: {
    status: 422,
    code: 'release_imaios',
    message: 'El borrador trae imágenes de IMAIOS, que no se publican.',
    named: true,
  },
  unique: {
    status: 422,
    code: 'release_unique',
    message:
      'Una pieza que entra usa el slug o el código de otra que sale o cambia: publícalo en dos pasos (primero el borrador sin la que entra; después, con ella).',
    named: true,
  },
  empty: { status: 409, code: 'release_empty', message: 'El borrador es igual a lo publicado.' },
  drift: {
    status: 422,
    code: 'release_drift',
    message: 'El borrador no tiene la forma de lo publicado: falta rehacerlo tras una migración.',
    named: true,
  },
  invalid: PUBLISH_INVALID,
};

const REVERT_REFUSALS: Record<string, Refusal | undefined> = {
  not_last: {
    status: 409,
    code: 'release_not_last',
    message: 'Ya no es la última publicación: recarga la página.',
  },
  reverted: { status: 409, code: 'release_reverted', message: 'Esa publicación ya se deshizo.' },
  migrated: {
    status: 409,
    code: 'release_migrated',
    message:
      'Después de esa publicación hubo una migración de la base: ya no se puede deshacer. Arréglalo publicando otra vez desde el borrador.',
  },
  public_changed: {
    status: 409,
    code: 'release_public_changed',
    message:
      'Lo publicado cambió después de esa publicación (por ejemplo, se despublicó algo): deshacerla volvería a poner lo que se sacó. Arréglalo publicando otra vez desde el borrador.',
    named: true,
  },
  invalid: REVERT_INVALID,
};

const refusalMessage = (refusal: Refusal, detail: string | null) =>
  refusal.named && detail ? `${refusal.message} Detalle: ${detail.slice(0, 500)}` : refusal.message;

export type ReleaseRefusal = { status: 400 | 409 | 422; body: ApiError };

const answer = (refusal: Refusal, detail: string | null): ReleaseRefusal => ({
  status: refusal.status,
  body: apiError(refusal.code, refusalMessage(refusal, detail)),
});

export const publishRefusal = (reason: string, detail: string | null): ReleaseRefusal =>
  answer(PUBLISH_REFUSALS[reason] ?? PUBLISH_INVALID, detail);

export const revertRefusal = (reason: string, detail: string | null): ReleaseRefusal =>
  answer(REVERT_REFUSALS[reason] ?? REVERT_INVALID, detail);
