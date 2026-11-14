// The last note opened on this device, for «Seguir» on the home page: a convenience of the device, not reading progress.

const KEY = 'qv-last-note';

export function lastNote(): string | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v && v.length <= 200 ? v : null;
  } catch {
    return null;
  }
}

export function rememberNote(slug: string) {
  try {
    window.localStorage.setItem(KEY, slug);
  } catch {
    // blocked storage
  }
}
