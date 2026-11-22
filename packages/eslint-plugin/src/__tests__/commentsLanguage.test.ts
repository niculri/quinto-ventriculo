// The comments language: where each comment is, and that strings and code are not comments.
import { describe, expect, it } from 'vitest';
import { scanComments, syntaxOf } from '../commentsLanguage.js';

const scan = (path: string, text: string) => scanComments(text, syntaxOf(path));

describe('the comments language', () => {
  it('finds `#` comments with their place, and the shebang apart', () => {
    const { comments, codeStart } = scan('pre-push', '#!/bin/sh\n# Checks.\nexit 0 # done\n');
    expect(comments.map((c) => [c.type, c.value, c.loc.start])).toEqual([
      ['Shebang', '!/bin/sh', { line: 1, column: 0 }],
      ['Line', ' Checks.', { line: 2, column: 0 }],
      ['Line', ' done', { line: 3, column: 7 }],
    ]);
    expect(codeStart).toBe('#!/bin/sh\n# Checks.\n'.length);
  });

  it('a `#` inside a word, a variable or quotes is not a comment, and an apostrophe opens no string', () => {
    const text = "a: x#y ${#v} $# \"#q\" '#s'\nb: it's # yes\n";
    expect(scan('a.yml', text).comments.map((c) => c.value)).toEqual([' yes']);
  });

  it('CSS has only block comments, outside strings', () => {
    const text = 'a { b: url(https://x/y); content: "/* no */"; } /* yes */';
    expect(scan('a.css', text).comments.map((c) => [c.type, c.value])).toEqual([
      ['Block', ' yes '],
    ]);
  });

  it('JSON with comments has both kinds, outside strings', () => {
    const text = '// one\n{ "u": "https://a.cl//b", /* two */ "x": "\\"//" }';
    expect(scan('a.jsonc', text).comments.map((c) => c.value)).toEqual([' one', ' two ']);
    expect(scan('a.jsonc', text).codeStart).toBe('// one\n'.length);
  });

  it('a file of only comments has its code at the end', () => {
    expect(scan('a.yml', '# a\n# b\n').codeStart).toBe(8);
  });
});
