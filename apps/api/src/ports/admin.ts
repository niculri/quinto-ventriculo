// Who is an administrator.
export interface AdminChecker {
  /** Remembered by the adapter for reads. */
  isAdmin(token: string): Promise<boolean>;
  /** Never the remembered answer: for writes. `null`: it could not be asked. */
  isAdminNow?(token: string): Promise<boolean | null>;
}

export const NO_ADMINS: AdminChecker = { isAdmin: () => Promise.resolve(false) };
