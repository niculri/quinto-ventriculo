// The site map: a few public routes and everything else behind ProtectedRoute, each page loaded on its first visit.
import { Navigate, Outlet, ScrollRestoration } from 'react-router';
import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import { LandingPage } from '../features/landing/pages/LandingPage';
import { AuthCallbackPage } from '../features/session/pages/AuthCallbackPage';
import { ProtectedRoute } from './ProtectedRoute';
import { RouteError } from '../shared/ui/RouteError';
import { paths } from '../shared/lib/paths';
import { SETTINGS_GROUPS } from '../features/settings/sections';
import { ADMIN_SECTIONS } from '../features/admin';
import { NotFoundPage } from '../shared/ui/NotFoundPage';
import {
  LegacyCourseRedirect,
  LegacyDeckRedirect,
  LegacyNoteRedirect,
  SemesterAnkiRedirect,
} from './Redirects';

function Root() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

/** A route's page, loaded on its first visit: the module and the page it exports. */
const page =
  <M,>(load: () => Promise<M>, pick: (module: M) => ComponentType) =>
  async () => ({ Component: pick(await load()) });

export const routes: RouteObject[] = [
  {
    Component: Root,
    ErrorBoundary: RouteError,
    children: [
      { index: true, Component: LandingPage },
      { path: 'auth/callback', Component: AuthCallbackPage },
      {
        path: 'privacy',
        lazy: page(
          () => import('../features/legal/pages/PrivacyPage'),
          (m) => m.PrivacyPage,
        ),
      },
      {
        path: 'terms',
        lazy: page(
          () => import('../features/legal/pages/TermsPage'),
          (m) => m.TermsPage,
        ),
      },
      {
        path: 'licenses',
        lazy: page(
          () => import('../features/legal/pages/LicensesPage'),
          (m) => m.LicensesPage,
        ),
      },
      {
        path: 'about',
        lazy: page(
          () => import('../features/legal/pages/AboutPage'),
          (m) => m.AboutPage,
        ),
      },
      {
        Component: ProtectedRoute,
        children: [
          {
            path: 'home',
            lazy: page(
              () => import('../features/home/pages/HomePage'),
              (m) => m.HomePage,
            ),
          },
          {
            path: 'courses',
            lazy: page(
              () => import('../features/courses/pages/CareerPage'),
              (m) => m.CareerPage,
            ),
          },
          {
            path: 'semesters/:number',
            lazy: page(
              () => import('../features/courses/pages/SemesterPage'),
              (m) => m.SemesterPage,
            ),
          },
          {
            path: 'semesters/:number/courses/:courseId',
            lazy: page(
              () => import('../features/courses/pages/CoursePage'),
              (m) => m.CoursePage,
            ),
          },
          {
            path: 'semesters/:number/courses/:courseId/assessments/:assessment/notes',
            lazy: page(
              () => import('../features/courses/pages/AssessmentNotesPage'),
              (m) => m.AssessmentNotesPage,
            ),
          },
          {
            path: 'semesters/:number/courses/:courseId/assessments/:assessment/tests',
            lazy: page(
              () => import('../features/courses/pages/AssessmentTestsPage'),
              (m) => m.AssessmentTestsPage,
            ),
          },
          {
            path: 'semesters/:number/courses/:courseId/assessments/:assessment/gymkana',
            lazy: page(
              () => import('../features/gymkana/pages/GymkanaPage'),
              (m) => m.GymkanaPage,
            ),
          },
          {
            path: 'semesters/:number/courses/:courseId/assessments/:assessment/gymkana/write',
            lazy: page(
              () => import('../features/gymkana/pages/GymkanaWritePage'),
              (m) => m.GymkanaWritePage,
            ),
          },
          {
            path: 'semesters/:number/courses/:courseId/notes/:noteSlug',
            lazy: page(
              () => import('../features/notes/pages/NotePage'),
              (m) => m.NotePage,
            ),
          },
          {
            path: 'semesters/:number/courses/:courseId/tests/:assessment/:quizSlug/:sectionId?',
            lazy: page(
              () => import('../features/quiz/pages/QuizPage'),
              (m) => m.QuizPage,
            ),
          },
          {
            path: 'semesters/:number/courses/:courseId/anki/*',
            lazy: page(
              () => import('./AnkiRoute'),
              (m) => m.AnkiRoute,
            ),
          },
          {
            path: 'anki/browse',
            lazy: page(
              () => import('../features/cards/pages/LegacyBrowse'),
              (m) => m.LegacyBrowse,
            ),
          },
          {
            path: 'settings',
            element: <Navigate to={SETTINGS_GROUPS[0].sections[0].to} replace />,
          },
          {
            path: 'settings/account',
            lazy: page(
              () => import('../features/account/pages/AccountSettingsPage'),
              (m) => m.AccountSettingsPage,
            ),
          },
          {
            path: 'settings/reports',
            lazy: page(
              () => import('../features/reports/pages/MyReportsPage'),
              (m) => m.MyReportsPage,
            ),
          },
          {
            path: 'settings/anki',
            lazy: page(
              () => import('../features/decks/pages/AnkiGeneralSettingsPage'),
              (m) => m.AnkiGeneralSettingsPage,
            ),
          },
          {
            path: 'settings/deck-options',
            lazy: page(
              () => import('../features/decks/pages/DeckOptionsSettingsPage'),
              (m) => m.DeckOptionsSettingsPage,
            ),
          },
          {
            path: 'admin',
            lazy: page(
              () => import('../features/admin/pages/AdminLayout'),
              (m) => m.AdminLayout,
            ),
            children: [
              { index: true, element: <Navigate to={ADMIN_SECTIONS[0].to} replace /> },
              {
                path: 'releases',
                lazy: page(
                  () => import('../features/admin/pages/ReleasesPage'),
                  (m) => m.ReleasesPage,
                ),
              },
              {
                path: 'reports',
                lazy: page(
                  () => import('../features/admin/pages/ReportsPage'),
                  (m) => m.ReportsPage,
                ),
              },
              {
                path: 'usage',
                lazy: page(
                  () => import('../features/admin/pages/UsagePage'),
                  (m) => m.UsagePage,
                ),
              },
              {
                path: 'cards',
                lazy: page(
                  () => import('../features/admin/pages/CardQualityPage'),
                  (m) => m.CardQualityPage,
                ),
              },
              {
                path: 'access',
                lazy: page(
                  () => import('../features/admin/pages/AccessPage'),
                  (m) => m.AccessPage,
                ),
              },
              {
                path: 'site',
                lazy: page(
                  () => import('../features/admin/pages/SitePage'),
                  (m) => m.SitePage,
                ),
              },
              {
                path: 'announcements',
                lazy: page(
                  () => import('../features/admin/pages/AnnouncementsPage'),
                  (m) => m.AnnouncementsPage,
                ),
              },
              {
                path: 'unpublished',
                lazy: page(
                  () => import('../features/admin/pages/UnpublishedPage'),
                  (m) => m.UnpublishedPage,
                ),
              },
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
          {
            path: 'search',
            lazy: page(
              () => import('../features/search/pages/SearchPage'),
              (m) => m.SearchPage,
            ),
          },
          {
            path: 'help',
            lazy: page(
              () => import('../features/help/pages/HelpPage'),
              (m) => m.HelpPage,
            ),
          },
          {
            path: 'news',
            lazy: page(
              () => import('../features/news/pages/NewsPage'),
              (m) => m.NewsPage,
            ),
          },
          ...(import.meta.env.DEV
            ? [
                {
                  path: 'dev/reading',
                  lazy: page(
                    () => import('../features/notes/pages/DevReadingPage'),
                    (m) => m.DevReadingPage,
                  ),
                },
              ]
            : []),
          { path: '*', Component: NotFoundPage },
        ],
      },
    ],
  },
];
