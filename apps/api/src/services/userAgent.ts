// The system and the browser of a User-Agent, as two short labels with their major version («iOS 18», «Safari 18»):
// only these are kept, never the User-Agent.
const SYSTEMS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/(?:iPhone|iPad|iPod).*? OS (\d+)/, (m) => `iOS ${m[1]!}`],
  [/Android (\d+)/, (m) => `Android ${m[1]!}`],
  [/CrOS/, () => 'ChromeOS'],
  [/Windows NT/, () => 'Windows'],
  [/Mac OS X/, () => 'macOS'],
  [/Linux/, () => 'Linux'],
];

/** In order: Edge, Opera and Samsung say «Chrome» too, and every browser on iOS says «Safari». */
const BROWSERS: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\/(\d+)/, 'Edge'],
  [/(?:OPR|OPT)\/(\d+)/, 'Opera'],
  [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
  [/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'],
  [/(?:CriOS|Chrome)\/(\d+)/, 'Chrome'],
  [/Version\/(\d+).*Safari\//, 'Safari'],
];

export function browserLabels(ua: string | undefined): {
  os: string;
  browser: string;
  phone: boolean | null;
} {
  if (!ua) return { os: '', browser: '', phone: null };
  const system = SYSTEMS.map(([re, label]) => {
    const m = re.exec(ua);
    return m ? label(m) : null;
  }).find((l) => l !== null);
  const browser = BROWSERS.map(([re, name]) => {
    const m = re.exec(ua);
    return m ? `${name} ${m[1]!}` : null;
  }).find((l) => l !== null);
  return {
    os: system ?? '',
    browser: browser ?? '',
    phone: /iPhone|iPod|Mobile|Mobi/.test(ua) && !ua.includes('iPad'),
  };
}
