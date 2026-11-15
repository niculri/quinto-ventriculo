// «Ocultar respuestas» of the cards page, remembered in this browser.

import { useState } from 'react';
import { storageKeys } from '../../../shared/lib/storage';

const HIDE_KEY = storageKeys.cardsHideAnswers;

export function useHideAnswers() {
  const [hide, setHide] = useState(() => {
    try {
      return localStorage.getItem(HIDE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const update = (on: boolean) => {
    setHide(on);
    try {
      if (on) localStorage.setItem(HIDE_KEY, '1');
      else localStorage.removeItem(HIDE_KEY);
    } catch {
      // blocked storage: for this visit
    }
  };
  return [hide, update] as const;
}
