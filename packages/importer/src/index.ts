// Public API of @qv/importer.
export { buildBundle } from './bundle/build';
export { hash } from './bundle/hash';
export type { BuildOptions, BuildResult } from './bundle/types';
export { FolderTarget } from './targets/FolderTarget';
export { CloudTarget, batches } from './targets/cloud';
export { cardMoves } from './sync/plan';
export type { Report } from './sync/report';
export type { SaveScope } from './sync/scope';
export type { Target, ThumbMaker } from './targets/target';
export type { CloudOptions } from './targets/cloud';
export { cloudConfigFromEnv, draftReviewUrl } from './targets/cloudConfig';
export { contentDatabase } from './targets/contentDatabase';
export type { ContentDatabase, ContentSchema } from './targets/contentDatabase';
export { r2Media } from './targets/r2';
export type { MediaStore } from './targets/r2';
export { sameUnpublished, withoutUnpublished } from './bundle/unpublished';
export type { Skipped } from './bundle/unpublished';
export { assessmentFileName } from './taxonomy/files';
export { checkTaxonomies } from './taxonomy/check';
export { compareWithHistory, compareWithPrevious } from './taxonomy/historyRules';
export { gitHistory } from './taxonomy/gitHistory';
export { readTaxonomies } from './taxonomy/read';
export { taxonomyLines } from './taxonomy/report';
export type {
  AssessmentTaxonomy,
  TaxonomyHistory,
  TaxonomyReport,
} from './taxonomy/types';
export type { TaxonomyCheck } from './taxonomy/checks/context';
export { unpublish } from './unpublish/unpublish';
export { canonicalId } from './unpublish/ids';
export { restore } from './unpublish/list';
export { describe as describeUnpublish } from './unpublish/describe';
export type {
  MediaRemover,
  UnpublishOptions,
  UnpublishOutcome,
  UnpublishResult,
} from './unpublish/types';
export { withVersion } from './sync/versions';
export { buildDecks } from './decks/buildDecks';
export { packCardIndexes, inPool } from './targets/browseIndex';
export { buildCardIndexes } from './decks/cardIndex';
export type { PackedIndex } from './targets/browseIndex';
export type { DecksOptions, DecksResult } from './decks/types';
export {
  MAX_WIDTH,
  THUMB_WIDTH,
  makeThumbnail,
  processCardImage,
  processImage,
  processQuizImage,
} from './media/images';
export { ImageCache } from './media/ImageCache';
export type { ProcessedImage, ImageProcessor, ImageDataProcessor } from './media/images';
export { convertQuiz } from './quizzes/convert';
export { defaultQuizId, questionId, stableQuestionId } from './quizzes/ids';
export { inlineHtml } from './quizzes/inline';
export { QUIZ_THEMES } from './quizzes/themes';
export type { ConvertedQuiz, QuizEntry } from './quizzes/convert';
export { readManifest, readUnpublished } from './manifest/read';
export { validateReferences } from './manifest/references';
export { UnpublishedItem, UnpublishedList } from './manifest/schemas';
export type { Manifest, ReadManifestOptions, UnpublishedKind } from './manifest/schemas';
export { ImportError } from './ImportError';
export type { ImportErrorKind } from './ImportError';
export {
  PRIVATE_FOLDER_NAME,
  contentFolder,
  materialPath,
  privateFolder,
  privateMaterial,
  realMaterialHere,
  requireContentFolder,
} from './privateFolder';
export type { PrivateMaterial, RealMaterialConfig } from './privateFolder';
