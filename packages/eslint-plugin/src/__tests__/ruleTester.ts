// RuleTester wired to Vitest, with the TypeScript parser for code and the plugin's language for the other files.
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, it } from 'vitest';
import plugin from '../index.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

export const code = new RuleTester({ languageOptions: { parser: tseslint.parser } });

export const otherFiles = new RuleTester({
  plugins: { qv: plugin },
  language: 'qv/comments',
});
