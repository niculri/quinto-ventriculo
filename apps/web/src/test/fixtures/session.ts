// The signed-in student of the tests.
import type { Session } from '../../features/session/api/service';

export const SESSION_ANA: Session = {
  token: 't',
  user: {
    id: 'u1',
    email: 'ana@ug.uchile.cl',
    name: 'Ana Pérez',
    avatar: null,
    createdAt: '2026-10-31T13:00:00.000Z',
    lastSignInAt: '2026-11-01T12:30:00.000Z',
  },
};
