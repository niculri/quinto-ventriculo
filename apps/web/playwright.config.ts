import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { ACCEPTED_ACCOUNT, PORT } from './e2e/accepted';

/**
 * WebKit (Safari on the iPhone) runs only what a student does most on a phone, plus axe: running every spec a third time
 * would double the CI's time. The CI runs it in a job of its own, beside Chromium's.
 */
const IPHONE_SPECS = [
  'a11y.spec.ts',
  'article.spec.ts',
  'cards.spec.ts',
  'home.spec.ts',
  'phone.spec.ts',
  'quiz.spec.ts',
  'screen-reader.spec.ts',
  'study.spec.ts',
  'viewer.spec.ts',
];

/** End-to-end tests in demo mode, with the test content of e2e/content (not the real one). */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'es-CL',
    trace: 'retain-on-failure',
    // Most of the tests exercise the advanced mode (the four buttons, the limits and the presets), with the week of
    // the test content turned on; a student who just arrived is e2e/simple.spec.ts. The terms and the privacy policy
    // in force are already accepted (step 2.3); the popup is e2e/account.spec.ts.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: `http://localhost:${PORT}`,
          localStorage: [
            {
              name: 'qv-demo-study',
              value: JSON.stringify({
                preferences: { fullAnki: true, fourButtons: true, welcomeSeen: true },
                activations: [{ deckId: '1006809718735317183', active: true }],
              }),
            },
            ACCEPTED_ACCOUNT,
          ],
        },
      ],
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 15'] }, testMatch: IPHONE_SPECS },
  ],
  webServer: {
    command: `npx vite --mode demo --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: { QV_OUTPUT: resolve(import.meta.dirname, 'e2e/content') },
  },
});
