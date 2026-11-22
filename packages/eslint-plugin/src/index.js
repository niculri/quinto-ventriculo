// This repository's ESLint plugin «qv»: the rules for comments, the one against casting database answers, the one
// against literal interface text, and a language that reads the comments of other files.
import { commentsLanguage } from './commentsLanguage.js';
import { fileHeader } from './fileHeader.js';
import { fileName } from './fileName.js';
import { noCastOnData } from './noCastOnData.js';
import { noHistoryComments } from './noHistoryComments.js';
import { noLiteralText } from './noLiteralText.js';
import { stringsLocation } from './stringsLocation.js';

export default {
  meta: { name: '@qv/eslint-plugin', version: '0.0.0' },
  rules: {
    'file-header': fileHeader,
    'file-name': fileName,
    'strings-location': stringsLocation,
    'no-history-comments': noHistoryComments,
    'no-cast-on-data': noCastOnData,
    'no-literal-text': noLiteralText,
  },
  languages: { comments: commentsLanguage },
};
