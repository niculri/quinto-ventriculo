// The first name of a person, from their full name: what the greeting of «Inicio» and the account button call them.
export function firstName(name: string | null | undefined): string | undefined {
  const first = name?.trim().split(/\s+/)[0];
  return first === '' ? undefined : first;
}
