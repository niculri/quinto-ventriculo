// Playwright configuration: the end-to-end tests in demo mode, with the test content of e2e/content.
import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { ADMIN_MODE_PORT, OWN_SERVER_PORT, PORT, demoState } from './e2e/accepted';

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
  'reading.spec.ts',
  'screenReader.spec.ts',
  'study.spec.ts',
  'viewer.spec.ts',
];

/** Specs that change the server's settings: they run in `desktop` only, each on a server of its own, so no other spec sees it. */
const OWN_SERVER = ['hiddenCourses.spec.ts', 'adminMode.spec.ts'];

const CONTENT = resolve(import.meta.dirname, 'e2e/content');
/** The admin mode's server has a note more in its draft: `e2e/adminModeContent.ts` makes it a copy of the content. */
const ADMIN_MODE_CONTENT = resolve(import.meta.dirname, 'node_modules/.cache/admin-mode-content');

const demoServer = (port: number, content = CONTENT) => {
  const prepare =
    content === CONTENT ? '' : `npx tsx e2e/adminModeContent.ts "${CONTENT}" "${content}" && `;
  return {
    command: `${prepare}npx vite --mode demo --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    env: { QV_OUTPUT: content },
  };
};

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
    // in force are already accepted; the popup is e2e/account.spec.ts.
    storageState: demoState(PORT),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testIgnore: OWN_SERVER },
    { name: 'iphone', use: { ...devices['iPhone 15'] }, testMatch: IPHONE_SPECS },
  ],
  webServer: [
    demoServer(PORT),
    demoServer(OWN_SERVER_PORT),
    demoServer(ADMIN_MODE_PORT, ADMIN_MODE_CONTENT),
  ],
});
