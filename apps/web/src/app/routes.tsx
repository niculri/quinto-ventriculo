import { Navigate, Outlet, ScrollRestoration } from 'react-router';
import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import { LandingPage } from '../features/landing/LandingPage';
import { AuthCallbackPage } from '../features/session/AuthCallbackPage';
import { ProtectedRoute } from '../features/session/ProtectedRoute';
import { RouteError } from '../ui/RouteError';
import { paths } from './paths';
import { SETTINGS_GROUPS } from '../features/settings/sections';
import { ADMIN_SECTIONS } from '../features/admin/sections';
import { NotFoundPage } from '../ui/NotFoundPage';
import {
  LegacyCourseRedirect,
  LegacyDeckRedirect,
  LegacyNoteRedirect,
  SemesterAnkiRedirect,
} from '../features/catalog/Redirects';

function Root() {
  return (
    <>
      {/* Default keys: back/forward restores the position; a new visit (e.g., Options again) starts at the top. */}
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

/** Each inner page is downloaded only when visited: the landing page loads light. */
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({
  Component: (await load()).default,
});

/**
 * Site map. Only the landing page, the Google callback, the privacy policy and terms of use (step 2.3: they are read
 * before entering, and show nothing of the material), the licenses (step 2.4) and /about (step 2.7) are public; everything else goes
 * through ProtectedRoute.
 */
export const routes: RouteObject[] = [
  {
    Component: Root,
    ErrorBoundary: RouteError,
    children: [
      { index: true, Component: LandingPage },
      { path: 'auth/callback', Component: AuthCallbackPage },
      { path: 'privacy', lazy: page(() => import('./pages/privacy')) },
      { path: 'terms', lazy: page(() => import('./pages/terms')) },
      { path: 'licenses', lazy: page(() => import('./pages/licenses')) },
      { path: 'about', lazy: page(() => import('./pages/about')) },
      {
        Component: ProtectedRoute,
        children: [
          { path: 'home', lazy: page(() => import('./pages/home')) },
          { path: 'courses', lazy: page(() => import('./pages/courses')) },
          // The URLs follow the hierarchy (app/paths.ts builds them all).
          { path: 'semesters/:number', lazy: page(() => import('./pages/semester')) },
          {
            path: 'semesters/:number/courses/:courseId',
            lazy: page(() => import('./pages/course')),
          },
          // A course's sections: what its page's cards open.
          {
            path: 'semesters/:number/courses/:courseId/assessments/:assessment/notes',
            lazy: page(() => import('./pages/assessment-notes')),
          },
          {
            path: 'semesters/:number/courses/:courseId/assessments/:assessment/tests',
            lazy: page(() => import('./pages/assessment-tests')),
          },
          {
            path: 'semesters/:number/courses/:courseId/notes/:noteSlug',
            lazy: page(() => import('./pages/note')),
          },
          // A practice test, with its tab (section) when it has several.
          {
            path: 'semesters/:number/courses/:courseId/tests/:assessment/:quizSlug/:sectionId?',
            lazy: page(() => import('./pages/quiz')),
          },
          // Anki, course by course: each deck where it is (…/study studies it) and the browser.
          {
            path: 'semesters/:number/courses/:courseId/anki/*',
            lazy: page(() => import('./pages/anki')),
          },
          { path: 'anki/browse', lazy: page(() => import('./pages/browse')) },
          // «Opciones»: its sections (features/settings/sections.ts); /settings opens the first one.
          {
            path: 'settings',
            element: <Navigate to={SETTINGS_GROUPS[0].sections[0].to} replace />,
          },
          { path: 'settings/account', lazy: page(() => import('./pages/account-settings')) },
          { path: 'settings/reports', lazy: page(() => import('./pages/my-reports')) },
          { path: 'settings/anki', lazy: page(() => import('./pages/settings')) },
          { path: 'settings/deck-options', lazy: page(() => import('./pages/deck-options')) },
          // «Administración» (step 2.10): its own page, by sections, only for administrators. The layout stays
          // mounted while the sections change; /admin opens the first one (features/admin/sections.ts).
          {
            path: 'admin',
            lazy: page(() => import('./pages/admin')),
            children: [
              { index: true, element: <Navigate to={ADMIN_SECTIONS[0].to} replace /> },
              { path: 'releases', lazy: page(() => import('./pages/releases')) },
              { path: 'reports', lazy: page(() => import('./pages/admin-reports')) },
              { path: 'usage', lazy: page(() => import('./pages/admin-usage')) },
              { path: 'access', lazy: page(() => import('./pages/admin-access')) },
              { path: 'site', lazy: page(() => import('./pages/admin-site')) },
              { path: 'unpublished', lazy: page(() => import('./pages/admin-unpublished')) },
            ],
          },
          // Until step 2.10 the panel was inside «Opciones».
          { path: 'settings/admin', element: <Navigate to={paths.adminReports} replace /> },
          {
            path: 'settings/admin/releases',
            element: <Navigate to={paths.adminReleases} replace />,
          },
          // Old forms (saved links and progress, ?next=): to the canonical URL, with ?query and #anchor.
          { path: 'courses/:courseId', Component: LegacyCourseRedirect },
          { path: 'notes/:slug', Component: LegacyNoteRedirect },
          { path: 'decks/:deckId', Component: LegacyDeckRedirect },
          // v1.3 had pages with the decks of several courses: Anki goes course by course now.
          { path: 'anki', element: <Navigate to={paths.home} replace /> },
          { path: 'anki/study', element: <Navigate to={paths.home} replace /> },
          { path: 'semesters/:number/anki/*', Component: SemesterAnkiRedirect },
          { path: 'search', lazy: page(() => import('./pages/search')) },
          { path: 'help', lazy: page(() => import('./pages/help')) },
          // Development only: never in the build.
          ...(import.meta.env.DEV
            ? [{ path: 'dev/reading', lazy: page(() => import('./pages/dev-reading')) }]
            : []),
          { path: '*', Component: NotFoundPage },
        ],
      },
    ],
  },
];
