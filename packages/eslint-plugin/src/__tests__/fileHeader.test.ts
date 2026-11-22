// The header rule on TypeScript, CSS, YAML, shell scripts and JSON with comments.
import { fileHeader } from '../fileHeader.js';
import { code, otherFiles } from './ruleTester';

// Written in pieces so that this file has no directive of its own.
const DISABLE = 'eslint-' + 'disable';
const missing = [{ messageId: 'missing' }];
const long = [{ messageId: 'long' }];
const empty = [{ messageId: 'empty' }];

code.run('qv/file-header', fileHeader, {
  valid: [
    '// Parses the search box.\nexport const a = 1;',
    '// Parses the search box,\n// and lists its errors.\nimport { b } from "b";\nexport const a = b;',
    '/** Parses the search box. */\nexport const a = 1;',
    '/**\n * Parses the search box,\n * and lists its errors.\n */\nexport const a = 1;',
    '#!/usr/bin/env node\n// Runs the importer.\nconsole.log(1);',
    '// @vitest-environment jsdom\n// The study page.\nexport {};',
    '/// <reference types="vite/client" />\n// Vite types.\n',
    [
      '// SPDX-License-Identifier: AGPL-3.0-or-later',
      '// Portions derived from Anki, © Ankitects Pty Ltd and contributors, AGPL-3.0-or-later.',
      '',
      '// The cloze parser.',
      'export const a = 1;',
    ].join('\n'),
    '// SPDX-License-Identifier: AGPL-3.0-or-later\n// Portions derived from Anki.\n/** The cloze parser. */\nexport const a = 1;',
    { code: '// One.\n// Two.\n// Three.\nexport const a = 1;', options: [{ maxLines: 3 }] },
  ],
  invalid: [
    { code: 'export const a = 1;', errors: missing },
    { code: 'export const a = 1; // trailing', errors: missing },
    { code: '#!/usr/bin/env node\nconsole.log(1);', errors: missing },
    { code: `// ${DISABLE}-next-line no-console\nconsole.log(1);`, errors: missing },
    { code: '/// <reference types="vite/client" />\n', errors: missing },
    {
      code: '// SPDX-License-Identifier: AGPL-3.0-or-later\n// Portions derived from Anki.\nexport const a = 1;',
      errors: missing,
    },
    { code: '//\nexport const a = 1;', errors: empty },
    { code: '/** */\nexport const a = 1;', errors: empty },
    { code: '// TODO\nexport const a = 1;', errors: empty },
    { code: '// TODO: x\nexport const a = 1;', errors: empty },
    { code: '// ----------\nexport const a = 1;', errors: empty },
    { code: '/* ** -- ## */\nexport const a = 1;', errors: empty },
    { code: '// One.\n// Two.\n// Three.\nexport const a = 1;', errors: long },
    { code: '/**\n * One.\n * Two.\n * Three.\n */\nexport const a = 1;', errors: long },
  ],
});

otherFiles.run('qv/file-header (other files)', fileHeader, {
  valid: [
    { filename: 'a.css', code: '/* The site tokens. */\n@import "tailwindcss";' },
    { filename: 'a.css', code: '/*\n * The site tokens,\n * in both themes.\n */\n:root {}' },
    { filename: 'ci.yml', code: '# The CI.\nname: CI\n' },
    { filename: '.githooks/pre-push', code: '#!/bin/sh\n# Checks before a push.\nexit 0\n' },
    { filename: 'install.sh', code: '#!/bin/sh\n# Turns the hooks on.\n' },
    { filename: 'wrangler.jsonc', code: '// The Worker.\n{ "name": "a" }' },
    { filename: 'knip.jsonc', code: '/* Unused code. */\n{}' },
  ],
  invalid: [
    { filename: 'a.css', code: '@import "tailwindcss";\n/* Tokens. */', errors: missing },
    { filename: 'a.css', code: '/* */\n:root {}', errors: empty },
    { filename: 'ci.yml', code: '# ----\nname: CI\n', errors: empty },
    { filename: 'a.css', code: '/* One.\n Two.\n Three. */\n:root {}', errors: long },
    { filename: 'ci.yml', code: 'name: CI\n# The CI.\n', errors: missing },
    { filename: 'ci.yml', code: "name: Build the web's files # not a header\n", errors: missing },
    { filename: '.githooks/pre-push', code: '#!/bin/sh\nexit 0\n', errors: missing },
    { filename: 'a.sh', code: '# One.\n# Two.\n# Three.\necho a\n', errors: long },
    {
      filename: 'wrangler.jsonc',
      code: '{ "url": "https://a.cl/#x" } // The Worker.',
      errors: missing,
    },
  ],
});
