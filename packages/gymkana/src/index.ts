// The gymkana's writing mode: checking a written name, filtering the stations and playing a round.
export {
  CORRECT_SCORE,
  alternatives,
  checkAnswer,
  isCorrect,
  levenshtein,
  normalize,
} from './answer';
export {
  answer,
  currentResult,
  currentStation,
  next,
  restoreRound,
  score,
  shuffled,
  startRound,
  toggle,
  wrongStations,
} from './round';
export type { CaOrigin, CaResult, CaRound, Random } from './round';
export {
  COUNT_CHOICES,
  SECONDS_CHOICES,
  defaultPreferences,
  passes,
  prioritiesOf,
  priorityOf,
  regionOf,
  restorePreferences,
  sourceOf,
} from './stations';
export type {
  CaPreferences,
  Correction,
  Filterable,
  GymkanaPlaces,
  RegionDef,
  SourceDef,
  StationFilter,
} from './stations';
