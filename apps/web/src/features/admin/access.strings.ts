// The texts of «Acceso»: who comes in, the invited by list, the form to invite and the popups to remove and to name.
import type { InviteRejection } from './api/repository';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const genericFailure = 'No se pudo. Revisa tu conexión e intenta de nuevo.';

export const accessStrings = {
  title: 'Acceso',
  notLoaded: 'No se pudo cargar',
  retry: 'Reintentar',
  genericFailure,
  sep: ' · ',
  open: ' (',
  close: ')',
  who: {
    title: 'Quién entra',
    open: 'Cualquier cuenta @ug.uchile.cl, invitada o no. Sacar una invitación cierra las sesiones de esa persona, pero no le quita el acceso.',
    invitedOnly: (invited: number, lists: number) =>
      `Solo las cuentas invitadas: ${invited} en ${lists} ${
        lists === 1 ? 'lista' : 'listas'
      }. Sacar a alguien le cierra el material en menos de un minuto.`,
  },
  invited: {
    title: 'Invitados',
    none: 'Todavía no hay nadie invitado.',
    list: (list: string) => `Lista ${list}`,
    invitedCount: (n: number) => plural(n, 'invitado', 'invitados'),
    withAccount: (n: number) => plural(n, 'con cuenta', 'con cuenta'),
    removeList: 'Sacar la lista',
  },
  strays: {
    title: (n: number) => (n === 1 ? 'Una cuenta sin invitación' : `${n} cuentas sin invitación`),
    before: 'Existen en la base de usuarios pero no están en ninguna lista',
    notSeen: ', así que no ven el material',
    after: '. Invítalas o bórralas en Supabase (Authentication → Users).',
    created: (date: string) => `Creada el ${date}`,
    lastSignIn: (when: string) => ` · último ingreso el ${when}`,
  },
  row: {
    invitedOn: (date: string) => `Invitado el ${date}`,
    lastSignIn: (when: string) => `último ingreso el ${when}`,
    hasAccount: 'tiene cuenta',
    noAccount: 'todavía sin cuenta',
    owner: 'Dueño',
    admin: 'Administrador',
    unappoint: 'Quitar administrador',
    unappointLabel: (email: string) => `Quitar administrador a ${email}`,
    appoint: 'Hacer administrador',
    appointLabel: (email: string) => `Hacer administrador a ${email}`,
    remove: 'Sacar',
    removeLabel: (email: string) => `Sacar a ${email}`,
  },
  form: {
    title: 'Invitar',
    emails: 'Correos @ug.uchile.cl',
    emailsHint: 'Uno por línea, o separados por comas',
    tooMany: (n: number, max: number) => `Son ${n} correos: a lo más ${max} por vez.`,
    count: (emails: number, ignored: number) =>
      `${plural(emails, 'correo', 'correos')}${
        ignored
          ? ` (${ignored === 1 ? '1 palabra no es un correo' : `${ignored} palabras no son correos`})`
          : ''
      }`,
    list: 'Lista',
    newList: 'Lista nueva',
    newName: 'Nombre de la lista nueva',
    newNameHint: 'Por ejemplo, Medicina 2027',
    note: 'Nota',
    optional: '(opcional)',
    inviting: 'Invitando…',
    invite: 'Invitar',
  },
  result: {
    title: (list: string) => `Invitaciones a «${list}»`,
    added: (n: number) => plural(n, 'persona invitada', 'personas invitadas'),
    already: (n: number) => `, ${n} ya ${n === 1 ? 'estaba' : 'estaban'}`,
    rejected: (n: number) => ` y ${plural(n, 'correo rechazado', 'correos rechazados')}`,
    end: '.',
    came: 'Entraron',
    were: 'Ya estaban',
    wereWhy: 'se quedan en su lista, con su fecha',
    refused: 'Rechazados',
    empty: '(vacío)',
    reasons: {
      domain: 'no es @ug.uchile.cl',
      invalid: 'no es un correo',
      repeated: 'repetido en lo pegado',
      empty: 'vacío',
    } satisfies Record<InviteRejection, string>,
    done: 'Listo',
  },
  remove: {
    person: (email: string) => `Sacar a ${email}`,
    list: (list: string) => `Sacar la lista «${list}»`,
    done: 'Listo',
    removed: (n: number) => plural(n, 'invitación sacada', 'invitaciones sacadas'),
    and: ' y ',
    sessions: (n: number) => plural(n, 'sesión cerrada', 'sesiones cerradas'),
    end: '.',
    openToDomain:
      ' El sitio está abierto a toda cuenta @ug.uchile.cl: sacar la invitación no quita el acceso.',
    left: 'Salieron',
    kept: 'Se mantuvo',
    keptWhy: 'es administrador',
    notInvited: 'No estaban invitados',
    personRule:
      'Se borra su invitación y se cierran sus sesiones: deja de ver el material en menos de un minuto.',
    listRule: (n: number) =>
      n === 1
        ? 'Se borra 1 invitación y se cierran sus sesiones: deja de ver el material en menos de un minuto.'
        : `Se borran ${n} invitaciones y se cierran sus sesiones: dejan de ver el material en menos de un minuto.`,
    keeps: 'Su cuenta y su avance quedan: si se vuelve a invitar, sigue donde iba.',
    adminStays: 'Un administrador nunca se saca desde aquí: se mantiene, con sus sesiones.',
    confirm: 'Para confirmar, escribe ',
    theEmail: 'el correo',
    theList: 'el nombre de la lista',
    cancel: 'Cancelar',
    removing: 'Sacando…',
    removePerson: 'Sacar',
    removeList: 'Sacar la lista',
  },
  admin: {
    action: (appoint: boolean) => (appoint ? 'Hacer administrador' : 'Quitar administrador'),
    title: (action: string, email: string) => `${action} a ${email}`,
    done: 'Listo',
    isNow: 'ya es administrador.',
    was: 'ya era administrador.',
    isNoMore:
      'ya no es administrador. Ya no puede cambiar nada; lo que solo se mira puede quedarle hasta un minuto.',
    wasNot: 'no era administrador.',
    appointRules: [
      'Puede usar todo este panel: publicar, la vista previa, los reportes y el acceso (invitar y sacar personas).',
      'No puede nombrar ni quitar administradores: eso queda solo para ti.',
      'Verá «Administración» en el menú de su cuenta la próxima vez que abra o recargue el sitio.',
      'Se le puede quitar cuando quieras, desde aquí.',
    ],
    unappointRules: [
      'Sigue invitado, con su cuenta, su avance y sus sesiones.',
      'Deja de poder cambiar cosas de inmediato: publicar, deshacer, el interruptor del sitio, invitar o sacar personas.',
      'Ver la vista previa y lo que muestran Publicaciones, Sitio y Fuera del sitio puede quedarle hasta un minuto.',
      'Después, si hace falta, se puede sacar como a cualquier invitado.',
    ],
    confirm: 'Para confirmar, escribe el correo (',
    longestRefusal: 'Solo el dueño del sitio nombra o quita administradores.',
    cancel: 'Cancelar',
    saving: 'Guardando…',
  },
} as const;
