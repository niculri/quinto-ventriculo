// The practice-test logic: rounds, their saved state and statement lists.
export {
  answerAt,
  answerChoice,
  canSkip,
  currentQuestionId,
  displayOrder,
  finish,
  isAnswered,
  isResumable,
  LETTERS,
  next,
  progress,
  repeatAll,
  repeatWrong,
  restart,
  resultTitle,
  resume,
  resumeLine,
  ROUND_ORIGINS,
  score,
  selfAssess,
  skip,
  startRound,
  toCover,
  wrongAnswers,
} from './round';
export type { QuestionInfo, Round, RoundOrigin } from './round';
export { restorePreferences, restoreRound, selectQuestions } from './state';
export type { Preferences } from './state';
export { splitStatements } from './statements';
