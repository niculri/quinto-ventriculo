// The importer's own errors: what the person has to fix, with the kind of problem it is.

export type ImportErrorKind =
  | 'usage' // a wrong command line
  | 'environment' // a missing folder or variable of the machine
  | 'manifest' // the catalog, manifests or lists of content/
  | 'material' // the notes, decks, tests and images themselves
  | 'cloud'; // the content database or the image store

export class ImportError extends Error {
  readonly kind: ImportErrorKind;

  constructor(kind: ImportErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ImportError';
    this.kind = kind;
  }
}
