// The texts of AdminDialog.

export const adminDialogStrings = {
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
      'Puede usar todo este panel: publicar, el modo admin, los reportes y el acceso (invitar y sacar personas).',
      'No puede nombrar ni quitar administradores: eso queda solo para ti.',
      'Verá «Administración» en el menú de su cuenta la próxima vez que abra o recargue el sitio.',
      'Se le puede quitar cuando quieras, desde aquí.',
    ],
    unappointRules: [
      'Sigue invitado, con su cuenta, su avance y sus sesiones.',
      'Deja de poder cambiar cosas de inmediato: publicar, deshacer, el interruptor del sitio, invitar o sacar personas.',
      'Ver el modo admin y lo que muestran Publicaciones, Ajustes y Fuera del sitio puede quedarle hasta un minuto.',
      'Después, si hace falta, se puede sacar como a cualquier invitado.',
    ],
    confirm: 'Para confirmar, escribe el correo (',
    longestRefusal: 'Solo el dueño del sitio nombra o quita administradores.',
    cancel: 'Cancelar',
    saving: 'Guardando…',
  },
} as const;
