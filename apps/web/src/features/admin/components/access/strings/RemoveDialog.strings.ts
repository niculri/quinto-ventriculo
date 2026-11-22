// The texts of RemoveDialog.

import { plural } from '../../../../../shared/lib/plural';

export const removeDialogStrings = {
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
} as const;
