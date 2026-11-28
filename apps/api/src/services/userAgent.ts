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

/**
 * In order: an app's own browser first (Android's says «Chrome», iOS's says nothing), then Edge, Opera and Samsung,
 * which say «Chrome» too; every browser on iOS says «Safari».
 */
const BROWSERS: [RegExp, string][] = [
  [/\bInstagram (\d+)/, 'Instagram'],
  [/\bFBAV\/(\d+)/, 'Facebook'],
  [/Edg(?:e|A|iOS)?\/(\d+)/, 'Edge'],
  [/(?:OPR|OPT)\/(\d+)/, 'Opera'],
  [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
  [/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'],
  [/; wv\).*?Chrome\/(\d+)/, 'WebView de Android'],
  [/(?:CriOS|Chrome)\/(\d+)/, 'Chrome'],
  [/Version\/(\d+).*Safari\//, 'Safari'],
];

/** An iPhone or iPad page without a browser's name is an app's WebView (WhatsApp, Gmail…). */
const IOS_WEBVIEW = /(?:iPhone|iPad|iPod).*AppleWebKit\//;

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
    browser: browser ?? (IOS_WEBVIEW.test(ua) ? 'WebView de iOS' : ''),
    phone: /iPhone|iPod|Mobile|Mobi/.test(ua) && !ua.includes('iPad'),
  };
}
