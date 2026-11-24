// Vite plugin that preloads the text faces (Inter's, and QV Sans for the articles) from index.html, so that they
// download with the page and not after the CSS.
import type { Plugin } from 'vite';

const FILES = ['inter-roman.woff2', 'qv-sans-roman.woff2'];

/** In the build each font's URL is the hashed asset's; in development, the file's own (what the CSS asks for too). */
export function preloadFont(): Plugin {
  return {
    name: 'qv-preload-font',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        return FILES.map((file) => {
          const asset = ctx.bundle
            ? Object.values(ctx.bundle).find(
                (a) => a.type === 'asset' && a.names.some((n) => n.endsWith(file)),
              )
            : null;
          if (ctx.bundle && !asset) throw new Error(`La letra ${file} no está en el build.`);
          const href = asset ? `/${asset.fileName}` : `/src/fonts/${file}`;
          return {
            tag: 'link',
            attrs: { rel: 'preload', href, as: 'font', type: 'font/woff2', crossorigin: '' },
            injectTo: 'head' as const,
          };
        });
      },
    },
  };
}
