// Tests the loader of Google's script: it adds it once, gives Google's button the client, the hashed nonce and the
// domain, and fails (so the page falls back to the redirect) when blocked, slow, incomplete or on a home-screen app.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GIS_SCRIPT, gisLoader } from '../googleIdentity';

const scripts = () => [...document.head.querySelectorAll('script')];

function fakeGsi() {
  const initialize = vi.fn();
  const renderButton = vi.fn();
  window.google = { accounts: { id: { initialize, renderButton } } };
  return { initialize, renderButton };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete window.google;
  for (const s of scripts()) s.remove();
});

describe('gisLoader', () => {
  it('adds Google script once, in Spanish, and arms the button with the client, the nonce and the domain', async () => {
    const load = gisLoader('client-1.apps.googleusercontent.com');
    const first = load();
    expect(load()).toBe(first);
    expect(scripts()).toHaveLength(1);
    const script = scripts()[0]!;
    expect(script.src).toBe(`${GIS_SCRIPT}?hl=es-419`);
    expect(script.async).toBe(true);
    const gsi = fakeGsi();
    script.dispatchEvent(new Event('load'));
    const google = await first;

    const tokens: string[] = [];
    google.start('hashed-nonce', (t) => tokens.push(t));
    expect(gsi.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'client-1.apps.googleusercontent.com',
        nonce: 'hashed-nonce',
        hd: 'ug.uchile.cl',
        ux_mode: 'popup',
        auto_select: false,
      }),
    );
    const { callback } = gsi.initialize.mock.calls[0]![0] as {
      callback: (r: { credential?: unknown }) => void;
    };
    callback({ credential: 'id-token' });
    callback({});
    expect(tokens).toEqual(['id-token']);

    const parent = document.createElement('div');
    parent.append(document.createElement('span'));
    google.renderButton(parent, { size: 'large', text: 'signin_with', width: 260 });
    expect(parent.children).toHaveLength(0);
    expect(gsi.renderButton).toHaveBeenCalledWith(parent, {
      type: 'standard',
      theme: 'outline',
      shape: 'rectangular',
      logo_alignment: 'left',
      locale: 'es-419',
      size: 'large',
      text: 'signin_with',
      width: 260,
    });
  });

  it('fails when the script is blocked', async () => {
    const loading = gisLoader('c')();
    scripts()[0]!.dispatchEvent(new Event('error'));
    await expect(loading).rejects.toThrow('blocked');
  });

  it('fails when the script loads without google.accounts.id', async () => {
    const loading = gisLoader('c')();
    scripts()[0]!.dispatchEvent(new Event('load'));
    await expect(loading).rejects.toThrow('no google.accounts.id');
  });

  it('fails when it takes too long', async () => {
    vi.useFakeTimers();
    const loading = gisLoader('c', 50)();
    vi.advanceTimersByTime(50);
    await expect(loading).rejects.toThrow('timeout');
  });

  it('does not even try in a web app on the iPhone home screen', async () => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    await expect(gisLoader('c')()).rejects.toThrow('standalone');
    expect(scripts()).toHaveLength(0);
    Reflect.deleteProperty(navigator, 'standalone');
  });
});
