// The site map: a few public routes and everything else behind ProtectedRoute, each page loaded on its first visit.
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
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({
  Component: (await load()).default,
});

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
          { path: 'semesters/:number', lazy: page(() => import('./pages/semester')) },
          {
            path: 'semesters/:number/courses/:courseId',
            lazy: page(() => import('./pages/course')),
          },
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
          {
            path: 'semesters/:number/courses/:courseId/tests/:assessment/:quizSlug/:sectionId?',
            lazy: page(() => import('./pages/quiz')),
          },
          {
            path: 'semesters/:number/courses/:courseId/anki/*',
            lazy: page(() => import('./pages/anki')),
          },
          { path: 'anki/browse', lazy: page(() => import('./pages/browse')) },
          {
            path: 'settings',
            element: <Navigate to={SETTINGS_GROUPS[0].sections[0].to} replace />,
          },
          { path: 'settings/account', lazy: page(() => import('./pages/account-settings')) },
          { path: 'settings/reports', lazy: page(() => import('./pages/my-reports')) },
          { path: 'settings/anki', lazy: page(() => import('./pages/settings')) },
          { path: 'settings/deck-options', lazy: page(() => import('./pages/deck-options')) },
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
          { path: 'settings/admin', element: <Navigate to={paths.adminReports} replace /> },
          {
            path: 'settings/admin/releases',
            element: <Navigate to={paths.adminReleases} replace />,
          },
          // Old URLs (saved links and progress, ?next=): to the canonical one, keeping ?query and #anchor.
          { path: 'courses/:courseId', Component: LegacyCourseRedirect },
          { path: 'notes/:slug', Component: LegacyNoteRedirect },
          { path: 'decks/:deckId', Component: LegacyDeckRedirect },
          // Old pages with the decks of several courses: Anki goes course by course.
          { path: 'anki', element: <Navigate to={paths.home} replace /> },
          { path: 'anki/study', element: <Navigate to={paths.home} replace /> },
          { path: 'semesters/:number/anki/*', Component: SemesterAnkiRedirect },
          { path: 'search', lazy: page(() => import('./pages/search')) },
          { path: 'help', lazy: page(() => import('./pages/help')) },
          ...(import.meta.env.DEV
            ? [{ path: 'dev/reading', lazy: page(() => import('./pages/dev-reading')) }]
            : []),
          { path: '*', Component: NotFoundPage },
        ],
      },
    ],
  },
];
