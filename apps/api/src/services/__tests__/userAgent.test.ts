// Tests for the system and the browser read from a User-Agent: two short labels with the major version, never more.
import { describe, expect, it } from 'vitest';
import { browserLabels } from '../userAgent';

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  samsung:
    'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.70',
  opera:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0',
  firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
  chromebook:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  instagramIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.40.92 (iPhone14,5; iOS 17_5; es_CL; es; scale=3.00; 1170x2532; 604857574)',
  instagramAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.39 Mobile Safari/537.36 Instagram 330.0.0.40.92 Android',
  facebookIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.40.98;FBBV/619873291;FBSN/iOS;FBSV/17.5]',
  androidWebView:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.39 Mobile Safari/537.36',
  iosWebView:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
};

describe('browserLabels', () => {
  it.each([
    ['iphone', 'iOS 18', 'Safari 18', true],
    ['iphoneChrome', 'iOS 17', 'Chrome 131', true],
    ['ipad', 'iOS 17', 'Safari 17', false],
    ['android', 'Android 14', 'Chrome 131', true],
    ['samsung', 'Android 13', 'Samsung Internet 26', true],
    ['mac', 'macOS', 'Safari 18', false],
    ['edge', 'Windows', 'Edge 131', false],
    ['opera', 'Windows', 'Opera 115', false],
    ['firefox', 'Linux', 'Firefox 133', false],
    ['chromebook', 'ChromeOS', 'Chrome 131', false],
    ['instagramIos', 'iOS 17', 'Instagram 330', true],
    ['instagramAndroid', 'Android 14', 'Instagram 330', true],
    ['facebookIos', 'iOS 17', 'Facebook 470', true],
    ['androidWebView', 'Android 14', 'WebView de Android 131', true],
    ['iosWebView', 'iOS 18', 'WebView de iOS', true],
  ] as const)('%s: %s · %s', (name, os, browser, phone) => {
    expect(browserLabels(UA[name])).toEqual({ os, browser, phone });
  });

  it('without a User-Agent, or one it does not know, the labels are empty', () => {
    expect(browserLabels(undefined)).toEqual({ os: '', browser: '', phone: null });
    expect(browserLabels('curl/8.7.1')).toEqual({ os: '', browser: '', phone: false });
  });
});
