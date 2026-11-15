// The tab a test opens without one in its URL: the one remembered, or else the one saved last, or else the first.
import type { QuizDetail } from '@qv/schema';
import type { SavedQuiz } from '@qv/schema/user';

export function lastUsedTab(quiz: QuizDetail, saved: SavedQuiz, remembered: string | null): string {
  if (remembered && quiz.sections.some((s) => s.id === remembered)) return remembered;
  let best: { id: string; at: string } | null = null;
  for (const s of quiz.sections) {
    const at = saved[s.id]?.updatedAt;
    if (at && (!best || at > best.at)) best = { id: s.id, at };
  }
  return best?.id ?? quiz.sections[0]!.id;
}
