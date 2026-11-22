// The strings location rule: strings/<Name>.strings.ts next to <Name>.ts(x), or in a shared strings/ folder.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, it } from 'vitest';
import { stringsLocation } from '../stringsLocation.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({ languageOptions: { parser: tseslint.parser } });

const root = mkdtempSync(join(tmpdir(), 'strings-location-'));
mkdirSync(join(root, 'components', 'strings'), { recursive: true });
mkdirSync(join(root, 'shared', 'strings'), { recursive: true });
writeFileSync(join(root, 'components', 'Panel.tsx'), '');
writeFileSync(join(root, 'components', 'useThing.ts'), '');
const options = [{ shared: ['shared'] }];
const code = 'export const a = {};';

tester.run('qv/strings-location', stringsLocation, {
  valid: [
    { filename: join(root, 'components', 'strings', 'Panel.strings.ts'), code, options },
    { filename: join(root, 'components', 'strings', 'useThing.strings.ts'), code, options },
    { filename: join(root, 'shared', 'strings', 'common.strings.ts'), code, options },
    { filename: join(root, 'components', 'Panel.tsx'), code, options },
    // Without a list of shared folders, or with an empty one, only the folder above counts.
    { filename: join(root, 'components', 'strings', 'Panel.strings.ts'), code },
    { filename: join(root, 'components', 'strings', 'Panel.strings.ts'), code, options: [{}] },
  ],
  invalid: [
    // A strings folder in a folder that cannot be read has no code above it.
    {
      filename: join(root, 'nowhere', 'strings', 'Panel.strings.ts'),
      code,
      options,
      errors: [{ messageId: 'orphan' }],
    },
    {
      filename: join(root, 'components', 'strings', 'common.strings.ts'),
      code,
      errors: [{ messageId: 'orphan' }],
    },
    {
      filename: join(root, 'components', 'strings.ts'),
      code,
      options,
      errors: [{ messageId: 'loose' }],
    },
    {
      filename: join(root, 'components', 'Panel.strings.ts'),
      code,
      options,
      errors: [{ messageId: 'loose' }],
    },
    {
      filename: join(root, 'components', 'strings', 'Other.strings.ts'),
      code,
      options,
      errors: [{ messageId: 'orphan' }],
    },
    {
      filename: join(root, 'components', 'strings', 'panel.strings.ts'),
      code,
      options,
      errors: [{ messageId: 'orphan' }],
    },
    {
      filename: join(root, 'components', 'strings', 'Panel.ts'),
      code,
      options,
      errors: [{ messageId: 'misplaced' }],
    },
  ],
});
