// `npm run smoke [-- url]`: see smoke.ts. Only reads; exits with 1 if something failed, 2 if it could not start.
import { DEFAULT_SITE, formatSmoke, runSmoke } from './smoke';

const USAGE = `Uso: npm run smoke [-- url]

Prueba de humo del sitio publicado, sin sesión y solo con GET (por defecto ${DEFAULT_SITE}).`;

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('-'));
const urls = args.filter((a) => !a.startsWith('-'));
if (flags.includes('--help') || flags.includes('-h')) {
  console.log(USAGE);
} else if (flags.length || urls.length > 1) {
  // An option it does not know (say, --url=…) must not quietly test the default site instead.
  console.error(`No entiendo «${[...flags, ...urls.slice(1)].join(' ')}».\n\n${USAGE}`);
  process.exitCode = 2;
} else {
  const url = urls[0] ?? DEFAULT_SITE;
  try {
    const result = await runSmoke(url);
    formatSmoke(url, result).forEach((l) => console.log(l));
    process.exitCode = result.ok ? 0 : 1;
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 2;
  }
}
