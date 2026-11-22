// The comments language: where each comment is, and that strings and code are not comments.
import { describe, expect, it } from 'vitest';
import { commentsLanguage, scanComments, syntaxOf } from '../commentsLanguage.js';

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

  it('a quote that opens a YAML file starts a string, so a `#` inside it is not a comment', () => {
    expect(scan('a.yml', '"a # b" # c').comments.map((c) => c.value)).toEqual([' c']);
  });

  it('a block comment that is never closed runs to the end of the file', () => {
    const { comments, codeStart } = scan('a.css', 'a {}\n/* never closed\nsecond line');
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({ type: 'Block', value: ' never closed\nsecond line' });
    expect(comments[0]!.range).toEqual([5, 'a {}\n/* never closed\nsecond line'.length]);
    expect(comments[0]!.loc.end).toEqual({ line: 3, column: 11 });
    expect(codeStart).toBe(0);
  });

  it('a `#` right after the start of the file is a comment, and a quote opening a YAML word is a string', () => {
    expect(scan('a.yml', '#first\nk: "a # b" # c').comments.map((c) => c.value)).toEqual([
      'first',
      ' c',
    ]);
  });

  it('reads a file given as bytes the same as one given as text', () => {
    const body = '/* one */\nexport {};';
    const parsed = commentsLanguage.parse({ body: new TextEncoder().encode(body), path: 'a.css' });
    expect(parsed.ast.comments.map((c) => c.value)).toEqual([' one ']);
    const source = commentsLanguage.createSourceCode(
      { body: new TextEncoder().encode(body) },
      parsed,
    );
    expect(source.text).toBe(body);
    expect(commentsLanguage.createSourceCode({ body }, parsed).text).toBe(body);
  });

  it('a file of only comments has its code at the end', () => {
    expect(scan('a.yml', '# a\n# b\n').codeStart).toBe(8);
  });
});
