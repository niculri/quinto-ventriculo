// Tests the demo's stand-in for Google's button: it can be made to fail, draws a button per style and hands back a
// test ID token that carries the hashed nonce it was armed with.
import { afterEach, describe, expect, it } from 'vitest';
import { DEMO_EMAIL } from '../demo';
import { demoGoogleIdentity, demoIdToken } from '../demoGoogle';

afterEach(() => window.localStorage.clear());

const claims = (token: string) =>
  JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as unknown;

describe('demoIdToken', () => {
  it('is an unsigned JWT with the account and the nonce', () => {
    const token = demoIdToken('hash+/', 'otra@ug.uchile.cl');
    expect(token.split('.')).toHaveLength(3);
    expect(token).not.toMatch(/[+/=]/);
    expect(claims(token)).toEqual({
      iss: 'https://accounts.google.com',
      email: 'otra@ug.uchile.cl',
      nonce: 'hash+/',
    });
    expect(claims(demoIdToken('h'))).toMatchObject({ email: DEMO_EMAIL });
  });
});

describe('demoGoogleIdentity', () => {
  it('fails to load when the demo blocks it, like a blocked script', async () => {
    window.localStorage.setItem('qv-demo-google', 'blocked');
    await expect(demoGoogleIdentity(window.localStorage)()).rejects.toThrow('blocked');
  });

  it('draws one button per style, in place of what was there, and its click gives the token', async () => {
    const google = await demoGoogleIdentity(window.localStorage)();
    const parent = document.createElement('div');
    parent.append(document.createElement('span'));
    google.renderButton(parent, { size: 'medium', text: 'signin', width: 104 }, false);
    expect(parent.children).toHaveLength(1);
    expect(parent.textContent).toBe('Entrar');
    const tokens: string[] = [];
    parent.querySelector('button')!.click();
    expect(tokens).toEqual([]);
    google.start('hashed', (t) => tokens.push(t));
    google.renderButton(parent, { size: 'large', text: 'signin_with', width: 260 }, true);
    expect(parent.textContent).toBe('Entrar con Google');
    parent.querySelector('button')!.click();
    expect(tokens).toHaveLength(1);
    expect(claims(tokens[0]!)).toMatchObject({ nonce: 'hashed' });
  });
});
