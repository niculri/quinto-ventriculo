// The history rule: what it flags in comments, and the dates, codes and words that are data.
import { noHistoryComments } from '../src/no-history-comments.js';
import { code, otherFiles } from './rule-tester';

const history = (found: string) => [
  { messageId: 'history', data: { found } } as { messageId: string; data: Record<string, string> },
];

code.run('qv/no-history-comments', noHistoryComments, {
  valid: [
    '// The step of a learning card: its position in the learning steps.\nconst a = 1;',
    '// 2026-11-08 07:18 is 28.7 hours before NOW.\nconst a = 1;',
    '// Its study day is 10-11-2026.\nconst a = 1;',
    '// The cards T-A1-S3-02-047.1 and AP-BC-C2-08; the images in R2.\nconst a = 1;',
    "// Anki's «Las tarjetas nuevas ignoran el límite de revisión».\nconst a = 1;",
    '// What a revision changed in the question is not shown.\nconst a = 1;',
    '// The material is not asked for by these routes.\nconst a = 1;',
    '// The site owner names administrators.\nconst a = 1;',
    '// The note, version 2 (v2 → v3 since the report).\nconst a = 1;',
    "const text = 'step 3.3, Revisión de cero, the owner (2026-11-01)';",
  ],
  invalid: [
    { code: '// Step 3.3: the card browser.\nconst a = 1;', errors: history('step') },
    { code: '/** The index (plan step 2.10 b). */\nconst a = 1;', errors: history('step') },
    { code: '// Revisión de cero (1.8): one observer.\nconst a = 1;', errors: history('revisión') },
    {
      code: '// then the cards (Revisión de\n// cero, 3.4).\nconst a = 1;',
      errors: history('revisión'),
    },
    { code: '// Releases (part 3).\nconst a = 1;', errors: history('part') },
    {
      code: '// As the owner asked (2026-11-01).\nconst a = 1;',
      errors: history('the owner, asked for, date'),
    },
    { code: '// Requested by the author.\nconst a = 1;', errors: history('asked for') },
    { code: '// The summary (ANK-15).\nconst a = 1;', errors: history('plan code') },
    { code: '// B6: 25,000 notes.\nconst a = 1;', errors: history('review code') },
    { code: '// The preview (B3 and B4).\nconst a = 1;', errors: history('review code') },
    { code: '// Optional before v1.4.\nconst a = 1;', errors: history('version') },
    { code: '// See docs/plan/roadmap.md.\nconst a = 1;', errors: history('plan') },
    { code: '// Lo pidió el dueño.\nconst a = 1;', errors: history('the owner') },
    { code: '// Review of 3.2: nothing moves.\nconst a = 1;', errors: history('review of a step') },
    { code: '// Paso 2.9 del plan.\nconst a = 1;', errors: history('paso') },
    { code: '// Phase 1: comments.\nconst a = 1;', errors: history('phase') },
  ],
});

otherFiles.run('qv/no-history-comments (other files)', noHistoryComments, {
  valid: [
    { filename: 'ci.yml', code: '# The CI.\nname: CI\nrun: echo "#1 step 3.3"\n' },
    { filename: 'a.css', code: '/* Tokens. */\na::after { content: "/* step 3.3 */"; }' },
  ],
  invalid: [
    { filename: 'ci.yml', code: '# Every night (step 1.9).\nname: CI\n', errors: history('step') },
    {
      filename: 'ci.yml',
      code: '# The CI.\njobs:\n  a:\n    run: |\n      # for the owner\n      npm test\n',
      errors: history('the owner'),
    },
    { filename: 'a.css', code: '/* Tokens (step 3.8). */\n:root {}', errors: history('step') },
    {
      filename: 'a.jsonc',
      code: '// Unused code.\n{ "a": 1 } // step 2.4\n',
      errors: history('step'),
    },
  ],
});
