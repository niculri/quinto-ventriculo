// Vite plugin that preloads Inter's text face from index.html, so that it downloads with the page and not after the CSS.
import type { Plugin } from 'vite';

const FILE = 'inter-roman.woff2';

/** In the build the font's URL is the hashed asset's; in development, the file's own (what the CSS asks for too). */
export function preloadFont(): Plugin {
  return {
    name: 'qv-preload-font',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const asset = ctx.bundle
          ? Object.values(ctx.bundle).find(
              (a) => a.type === 'asset' && a.names.some((n) => n.endsWith(FILE)),
            )
          : null;
        if (ctx.bundle && !asset) throw new Error(`La letra ${FILE} no está en el build.`);
        const href = asset ? `/${asset.fileName}` : `/src/fonts/${FILE}`;
        return [
          {
            tag: 'link',
            attrs: { rel: 'preload', href, as: 'font', type: 'font/woff2', crossorigin: '' },
            injectTo: 'head',
          },
        ];
      },
    },
  };
}
