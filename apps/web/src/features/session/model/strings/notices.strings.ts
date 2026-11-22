// The texts of notices.

import { ACCOUNT_DELETION_DAYS, CONTACT_EMAIL } from '@qv/schema';

export const noticesStrings = {
  notices: {
    domain: 'El Quinto Ventrículo es solo para cuentas @ug.uchile.cl. Entra con tu cuenta de la U.',
    google: 'No se pudo entrar con Google. Intenta de nuevo.',
    deletion: `Pediste eliminar tu cuenta: se cerraron tus sesiones y se borrará en ${ACCOUNT_DELETION_DAYS} días. Si vuelves a entrar antes, se cancela.`,
    invite: `El Quinto Ventrículo está en prueba y por ahora solo entran personas invitadas. Si deberías tener acceso, escribe a ${CONTACT_EMAIL}.`,
  },
  titles: {
    deletion: 'Tu cuenta se eliminará',
    failed: 'No se pudo entrar',
  },
} as const;
