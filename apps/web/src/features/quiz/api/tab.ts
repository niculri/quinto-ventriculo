// The tab of a test the user chose last, kept in this browser.
import { storageKeys } from '../../../shared/lib/storage';

const tabKey = storageKeys.quizTab;

export function rememberTab(quizId: string, sectionId: string) {
  try {
    localStorage.setItem(tabKey(quizId), sectionId);
  } catch {
    // not remembered
  }
}

export function rememberedTab(quizId: string): string | null {
  try {
    return localStorage.getItem(tabKey(quizId));
  } catch {
    return null;
  }
}
