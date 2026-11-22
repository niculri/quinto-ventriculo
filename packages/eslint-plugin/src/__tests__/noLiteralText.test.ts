// The rule against literal interface text: JSX text, text props, text passed to what renders, and what is not text.
import tseslint from 'typescript-eslint';
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import { noLiteralText } from '../noLiteralText.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const jsx = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});
const OPTIONS = [
  {
    componentTextProps: ['help', 'text', 'unit'],
    listProps: ['columns', 'choices', 'items'],
    textKeys: ['label'],
    textFunctions: ['plural'],
    ignoreFunctions: ['keys', 'toLocaleString'],
  },
];
const ok = (code: string) => ({ code, options: OPTIONS });
const bad = (code: string, n = 1) => ({
  code,
  options: OPTIONS,
  errors: Array.from({ length: n }, () => ({ messageId: 'literal' })),
});

jsx.run('qv/no-literal-text', noLiteralText, {
  valid: [
    // Text from a list, numbers and symbols.
    ok('const a = <p>{s.title}</p>;'),
    ok('const a = <p> · {n} — 3%</p>;'),
    ok('const a = <p>{n === 1 ? s.one : s.many(n)}</p>;'),
    // Attributes that are not text: classes, ids, data-*, roles, routes, input names.
    ok('const a = <p className="text-sm font-medium" id="who" data-state="open" role="status" />;'),
    ok('const a = <Link to="/home" className={`${base} mt-3`} />;'),
    ok('const a = <input name="email" type="text" autoComplete="off" />;'),
    ok('const a = <Radio name={`${idPrefix}-state`} />;'),
    ok('const a = <Dialog.Close aria-label={s.close} />;'),
    // A component prop that is not text, and a text prop of a component on an HTML element.
    ok('const a = <Badge tone="warn" variant="landing" />;'),
    ok('const a = <div help="x" text="y" unit="min" />;'),
    // Arguments that do not read as text: keys, enum values, classes, queries, locales.
    ok("const a = <p>{meter('left')}{isOpen('notes')}{count(n, 'w-9')}</p>;"),
    ok("const a = <p>{row(s.new, n, 'text-state-new mt-2')}{item(s.today, 'rated:1 is:due')}</p>;"),
    ok("const a = <p>{n.toLocaleString('es-CL')}{keys('Ctrl+K')}</p>;"),
    ok("const a = <p>{fn('article')}</p>;"),
    // A list prop's items that do not read as text, and keys that are not text.
    ok("const a = <SelectRow choices={[['suspend', s.suspend]]} />;"),
    ok("const a = <Select options={[{ value: 'list:all', label: s.all }]} />;"),
    // Something with no letter is not text, wherever it is; neither is what a comparison or an empty comment renders.
    ok("const a = <p>{fn('123')}</p>;"),
    ok("const a = <p>{n === 'Hola mundo'}</p>;"),
    ok('const a = <p>{/* nothing */}</p>;'),
    // A namespaced attribute, an attribute that is no text prop and a list prop item that is no text.
    ok('const a = <p xlink:title="Hola" data-x="Hola mundo" />;'),
    ok('const a = <Select items="foo" />;'),
    ok('const a = <Select items={[, "foo-bar"]} />;'),
    // A spread in an object is not a text, and a key that is not a text key keeps its value free.
    ok("const a = <p>{row({ ...base, value: 'list:all' })}</p>;"),
    // The left of `&&` is a condition: it is not what renders.
    ok("const a = <p>{'Hola' && s.title}</p>;"),
    // A list prop of an HTML element is nothing: only a component takes its items as text.
    ok('const a = <div items="Texto largo de ejemplo" />;'),
    // A callback is not what renders.
    ok("const a = <p>{xs.map((x) => fmt(x, 'a'))}</p>;"),
    {
      code: '<Question q="¿Cuesta algo?">No. Es gratis.</Question>;',
      options: [{ ...OPTIONS[0], fixedText: ['Question'] }],
    },
  ],
  invalid: [
    // JSX text and literals as children.
    bad('const a = <p>Hola</p>;'),
    bad("const a = <p>{'Hola'}</p>;"),
    bad('const a = <p>{`Hola ${n}`}</p>;'),
    bad("const a = <p>{n === 1 ? 'nueva' : 'nuevas'}</p>;", 2),
    bad("const a = <p>{done && 'Listo'}</p>;"),
    bad("const a = <p>{n + ' tarjetas'}</p>;"),
    // HTML and ARIA text attributes.
    bad('const a = <button aria-label="Cerrar" />;'),
    bad('const a = <img alt="Foto" />;'),
    bad('const a = <input placeholder="Buscar…" title="Buscar" />;', 2),
    bad("const a = <p aria-label={busy ? 'Guardando' : s.save} />;"),
    // Text props of components, with any name in the list.
    bad('const a = <Switch label="Modo avanzado" />;'),
    bad('const a = <SwitchRow help="Agrega opciones." />;'),
    bad('const a = <Loading text="Cargando…" />;'),
    bad('const a = <NumberRow unit="min" />;'),
    bad("const a = <Loading text={ready ? s.done : 'Cargando…'} />;"),
    // Arguments of a text function, whatever they look like.
    bad("const a = <p>{plural(n, 'invitado', 'invitados')}</p>;", 2),
    bad("const a = <Emails why={s.why} title={plural(n, 'persona', 'personas')} />;", 2),
    // Arguments of another function that read as text.
    bad("const a = <p>{tab('article', 'Artículos')}</p>;"),
    bad("const a = <p>{tab('mis notas')}</p>;"),
    bad("const a = <p>{row('Nuevas', n, 'text-state-new')}</p>;"),
    bad("const a = <p>{failure(e, 'No se pudo publicar.')}</p>;"),
    bad("const a = <p>{option('todo lo visto', s.desc, pools.all)}</p>;"),
    bad("const a = <p>{`${n} ${plural(n, 'día', 'días')}`}</p>;", 2),
    // Items of a list prop that read as text, and the text keys of its objects.
    bad("const a = <Table columns={['Alumnos', 'Respuestas']} />;", 2),
    bad("const a = <SelectRow choices={[['suspend', 'Suspender tarjeta']]} />;"),
    bad("const a = <Breadcrumbs items={[{ label: 'inicio', to: paths.home }]} />;"),
    bad('<Question q="¿Cuesta algo?">No.</Question>;'),
    // The two sides of `||` and `??` render, and so do casts and non-null assertions.
    bad("const a = <p>{name || 'Sin nombre'}</p>;"),
    bad("const a = <p>{name ?? 'Sin nombre'}</p>;"),
    bad("const a = <p>{'Hola' as string}</p>;"),
    bad("const a = <p>{'Hola' satisfies string}</p>;"),
    bad("const a = <p>{'Hola'!}</p>;"),
    // A function with no name (the result of a call, a computed member) still has its arguments read.
    bad("const a = <p>{make()('Hola')}</p>;"),
    bad("const a = <p>{x['y']('Hola')}</p>;"),
    // A text key may be a string literal, and a spread beside it is skipped.
    bad("const a = <p>{row({ ...base, 'label': 'Todo' })}</p>;"),
    // An element with a namespace is not a component: it takes the HTML text props.
    bad('const a = <svg:rect title="Hola" />;'),
    bad('const a = <Dialog.Title text="Hola" />;'),
    // A list prop given as a plain string reads as text only if it does.
    bad('const a = <Select items="Elegir una opción" />;'),
  ],
});

const withoutOptions = new RuleTester({
  languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
});
const literal = [{ messageId: 'literal' }];

// With no options, or with an empty object, nothing is a component text prop, a list or a text function.
withoutOptions.run('qv/no-literal-text without options', noLiteralText, {
  valid: [
    { code: 'const a = <Badge help="x" />;' },
    { code: "const a = <Table columns={['Alumnos']} />;", options: [{}] },
    { code: "const a = <p>{plural(n, 'dia', 'dias')}</p>;", options: [{}] },
    { code: "const a = <p>{row({ label: 'todo' })}</p>;" },
  ],
  invalid: [
    { code: 'const a = <p>Hola</p>;', errors: literal },
    { code: 'const a = <p title="Hola" />;', options: [{}], errors: literal },
    { code: "const a = <p>{tab('Artículos')}</p>;", errors: literal },
  ],
});
