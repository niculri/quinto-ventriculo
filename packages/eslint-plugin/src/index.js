// This repository's ESLint plugin «qv»: the rules for comments and a language that reads the comments of other files.
import { commentsLanguage } from './comments-language.js';
import { fileHeader } from './file-header.js';
import { noHistoryComments } from './no-history-comments.js';

export default {
  meta: { name: '@qv/eslint-plugin', version: '0.0.0' },
  rules: { 'file-header': fileHeader, 'no-history-comments': noHistoryComments },
  languages: { comments: commentsLanguage },
};
