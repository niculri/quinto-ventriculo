// How tall the home page was the last time on this device, so its space is kept while it loads.

import { storageKeys } from '../../../shared/lib/storage';

const HEIGHT_KEY = storageKeys.homeHeight;
const DEFAULT_HEIGHT = 1100;

export function savedHeight(): number {
  try {
    const n = Number(window.localStorage.getItem(HEIGHT_KEY));
    return Number.isFinite(n) && n > 200 && n < 10_000 ? n : DEFAULT_HEIGHT;
  } catch {
    return DEFAULT_HEIGHT;
  }
}

export function saveHeight(height: number) {
  try {
    window.localStorage.setItem(HEIGHT_KEY, String(Math.round(height)));
  } catch {
    // blocked storage
  }
}
