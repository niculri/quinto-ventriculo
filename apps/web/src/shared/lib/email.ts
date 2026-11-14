// An email as normalize_invite_email() leaves it: lowercase and without any space, also the invisible ones a paste
// brings; for the demo and for counting what the forms will send.
export const normalizeEmail = (raw: string) =>
  raw.replace(/(?:[\s\u00a0\u2007\u202f\u200b\u200c\u2060\ufeff]|\u200d)+/g, '').toLowerCase();
