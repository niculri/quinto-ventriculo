// The admin mode for an administrator: whether it is on, how the browser remembers it and what its cache shares with the
// student's (app/AdminModeSwitch.tsx switches the site).
import { createContext, use } from 'react';
import { studyKeys } from '../progress/queries';
import { storageKeys } from '../../shared/lib/storage';

/** The last mode this browser used, in localStorage: the first time, and for anybody else, it is the student's. */
const KEY = storageKeys.adminMode;

export interface AdminMode {
  /** The draft and what is off for the students, over the same progress; only what the draft alone has is not saved. */
  active: boolean;
  /** The site can offer it: it has the API client for it. Only an administrator is given it by the API. */
  available: boolean;
  set: (active: boolean) => void;
}

export const AdminModeContext = createContext<AdminMode>({
  active: false,
  available: false,
  set: () => undefined,
});

export const useAdminMode = () => use(AdminModeContext);

export const storedAdminMode = () => {
  try {
    return window.localStorage.getItem(KEY) === 'admin';
  } catch {
    return false;
  }
};
export const storeAdminMode = (on: boolean) => {
  try {
    window.localStorage.setItem(KEY, on ? 'admin' : 'student');
  } catch {
    // blocked storage: it lasts until a reload
  }
};

/**
 * The cache entries that are the same in the admin mode: the user, their preferences and the administration panel's
 * (their first elements are the admin and reports keys', written here so the startup does not load those pages' reads).
 * The rest of the progress is read again from the same repositories in each mode.
 */
export const sharedWithAdminMode = (key: readonly unknown[]) =>
  key[0] === 'is-admin' ||
  key[0] === 'release' ||
  key[0] === 'report-queue' ||
  key[0] === 'my-reports' ||
  key[0] === 'access-report' ||
  key[0] === 'unpublished-log' ||
  (key[0] === studyKeys.preferences[0] && key[1] === studyKeys.preferences[1]);
