// The one function of Babel that the compiler's ratchet calls: @babel/core ships without types.
declare module '@babel/core' {
  export function transformSync(
    code: string,
    options: {
      filename: string;
      babelrc: false;
      configFile: false;
      parserOpts: { plugins: string[] };
      plugins: unknown[];
    },
  ): unknown;
}
