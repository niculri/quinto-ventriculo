// The rule against literal interface text: JSX text and text props, what a branch may render, and what is not text.
import tseslint from 'typescript-eslint';
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import { noLiteralText } from '../no-literal-text.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const jsx = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});
const literal = [{ messageId: 'literal' }];

jsx.run('qv/no-literal-text', noLiteralText, {
  valid: [
    'const a = <p>{s.title}</p>;',
    'const a = <p> · {n} — 3%</p>;',
    'const a = <p className="text-sm font-medium">{s.title}</p>;',
    'const a = <Dialog.Close aria-label={s.close} />;',
    'const a = <div id="x" data-state="open" role="status" />;',
    'const a = <p>{n === 1 ? s.one : s.many(n)}</p>;',
    "const a = <p>{t('Hola')}</p>;",
    "const a = <input type={'text'} />;",
    {
      code: '<Question q="¿Cuesta algo?">No. Es gratis.</Question>;',
      options: [{ fixedText: ['Question'] }],
    },
  ],
  invalid: [
    { code: 'const a = <p>Hola</p>;', errors: literal },
    { code: 'const a = <button aria-label="Cerrar" />;', errors: literal },
    { code: 'const a = <img alt="Foto" />;', errors: literal },
    {
      code: 'const a = <input placeholder="Buscar…" title="Buscar" />;',
      errors: [...literal, ...literal],
    },
    { code: 'const a = <Switch label="Modo avanzado" />;', errors: literal },
    { code: "const a = <p>{'Hola'}</p>;", errors: literal },
    { code: 'const a = <p>{`Hola ${n}`}</p>;', errors: literal },
    { code: "const a = <p>{n === 1 ? 'nueva' : 'nuevas'}</p>;", errors: [...literal, ...literal] },
    { code: "const a = <p>{done && 'Listo'}</p>;", errors: literal },
    { code: "const a = <p aria-label={busy ? 'Guardando' : s.save} />;", errors: literal },
    { code: '<Question q="¿Cuesta algo?">No.</Question>;', errors: literal },
  ],
});
