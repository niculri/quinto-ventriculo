// dependency-cruiser for `npm run deps` (packages/ops/src/cyclesCli.ts): the import graph and its cycles between files.
// The cycles between folders of the web are computed on that graph, and both are compared with .import-cycles.json.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'An import cycle ties modules together: one cannot be moved, tested or loaded without the others.',
      from: { path: '^(apps/[^/]+/src|packages/[^/]+/src)/' },
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // Tests are leaves (nothing imports them): leaving them out keeps their imports from joining folders in cycles.
    exclude: {
      path: ['(^|/)(node_modules|dist|\\.output|\\.wrangler|coverage)/', '\\.test\\.tsx?$'],
    },
    // Type-only imports count: a cycle through types still ties the modules together.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.json'],
      mainFields: ['module', 'main', 'types'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
