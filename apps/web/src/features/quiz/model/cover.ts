// The cover's arithmetic: the questions chosen, the groups after turning one on or off, and a group name as text.
import type { Preferences } from '@qv/quiz';
import type { QuizSectionSummary } from '@qv/schema';

export const chosenCount = (section: QuizSectionSummary, preferences: Preferences) =>
  section.groups
    .filter((g) => preferences.groups.includes(g.id))
    .reduce((t, g) => t + g.questionCount, 0);

export const toggledGroups = (
  section: QuizSectionSummary,
  preferences: Preferences,
  id: string,
  on: boolean,
) =>
  section.groups.map((g) => g.id).filter((g) => (g === id ? on : preferences.groups.includes(g)));

export const plainText = (html: string) =>
  new DOMParser().parseFromString(html, 'text/html').body.textContent;
