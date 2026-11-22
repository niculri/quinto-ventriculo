// Tests the entry point: it mounts the whole site in #root, at the browser's address, with the services of the build.
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  window.localStorage.clear();
});

describe('main', () => {
  it('a demo build mounts the landing page in #root, signed out', async () => {
    vi.stubEnv('VITE_DEMO', '1');
    const root = document.createElement('div');
    root.id = 'root';
    document.body.append(root);
    await import('../main');
    const sign = await screen.findAllByRole('button', { name: /Entrar con Google/ });
    expect(sign.length).toBeGreaterThan(0);
    expect(root.contains(sign[0]!)).toBe(true);
  });
});
