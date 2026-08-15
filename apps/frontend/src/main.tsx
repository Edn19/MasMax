import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import './index.css';
import { AppErrorBoundary, AppFrame, BackendGate, NotFoundPage, RouteErrorPage } from './components/AppExperience';
import { LoadingBlock, PublicLayout } from './components/Layout';
import { AdminRoute, ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './lib/auth';
import { registerServiceWorker } from './lib/pwa';
import { SiteSettingsProvider } from './lib/site-settings';
import { VideoProcessingJobsProvider } from './lib/video-processing-jobs';

const AdminLogin = lazyNamed(() => import('./admin/AdminLogin'), 'AdminLogin');
const AdminShell = lazyNamed(() => import('./admin/AdminShell'), 'AdminShell');
const DashboardPage = lazyNamed(() => import('./admin/dashboard/DashboardPage'), 'DashboardPage');
const SeriesAdminPage = lazyNamed(() => import('./admin/series/SeriesAdminPage'), 'SeriesAdminPage');
const SeasonsAdminPage = lazyNamed(() => import('./admin/seasons/SeasonsAdminPage'), 'SeasonsAdminPage');
const EpisodesAdminPage = lazyNamed(() => import('./admin/episodes/EpisodesAdminPage'), 'EpisodesAdminPage');
const SubtitlesAdminPage = lazyNamed(() => import('./admin/subtitles/SubtitlesAdminPage'), 'SubtitlesAdminPage');
const VideoProcessingAdminPage = lazyNamed(() => import('./admin/processing/VideoProcessingAdminPage'), 'VideoProcessingAdminPage');
const MediaLibraryAdminPage = lazyNamed(() => import('./admin/media/MediaLibraryAdminPage'), 'MediaLibraryAdminPage');
const MoviesAdminPage = lazyNamed(() => import('./admin/movies/MoviesAdminPage'), 'MoviesAdminPage');
const GenresAdminPage = lazyNamed(() => import('./admin/genres/GenresAdminPage'), 'GenresAdminPage');
const UsersAdminPage = lazyNamed(() => import('./admin/users/UsersAdminPage'), 'UsersAdminPage');
const CommentsAdminPage = lazyNamed(() => import('./admin/comments/CommentsAdminPage'), 'CommentsAdminPage');
const StorageAdminPage = lazyNamed(() => import('./admin/storage/StorageAdminPage'), 'StorageAdminPage');
const AuditAdminPage = lazyNamed(() => import('./admin/audit/AuditAdminPage'), 'AuditAdminPage');
const SettingsAdminPage = lazyNamed(() => import('./admin/settings/SettingsAdminPage'), 'SettingsAdminPage');
const DesignAdminPage = lazyNamed(() => import('./admin/settings/SettingsAdminPage'), 'DesignAdminPage');
const HomePage = lazyNamed(() => import('./pages/HomePage'), 'HomePage');
const SeriesCatalogPage = lazyNamed(() => import('./pages/AccountPages'), 'SeriesCatalogPage');
const MoviesPage = lazyNamed(() => import('./pages/AccountPages'), 'MoviesPage');
const FavoritesPage = lazyNamed(() => import('./pages/AccountPages'), 'FavoritesPage');
const ProfilePage = lazyNamed(() => import('./pages/AccountPages'), 'ProfilePage');
const SecurityPage = lazyNamed(() => import('./pages/AccountPages'), 'SecurityPage');
const SeriesDetailPage = lazyNamed(() => import('./pages/SeriesDetailPage'), 'SeriesDetailPage');
const MovieWatchPage = lazyNamed(() => import('./pages/MovieWatchPage'), 'MovieWatchPage');
const WatchPage = lazyNamed(() => import('./pages/WatchPage'), 'WatchPage');

const router = createBrowserRouter([{
  element: <AppFrame />,
  errorElement: <RouteErrorPage />,
  children: [
    { path: '/', element: <Navigate to="/login" replace /> },
    { path: '/login', element: <AdminLogin /> },
    { path: '/admin/login', element: <Navigate to="/login" replace /> },
    {
      element: <ProtectedRoute />,
      children: [{
        element: <PublicLayout />,
        children: [
          { path: '/home', element: <HomePage /> },
          { path: '/series', element: <SeriesCatalogPage /> },
          { path: '/series/:slug', element: <SeriesDetailPage /> },
          { path: '/movies', element: <MoviesPage /> },
          { path: '/favorites', element: <FavoritesPage /> },
          { path: '/profile', element: <ProfilePage /> },
          { path: '/profile/security', element: <SecurityPage /> },
          { path: '/watch/movie/:slug', element: <MovieWatchPage /> },
          { path: '/watch/:episodeId', element: <WatchPage /> },
        ],
      }],
    },
    {
      element: <AdminRoute />,
      children: [{
        path: '/admin',
        element: <AdminShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'series', element: <SeriesAdminPage /> },
          { path: 'seasons', element: <SeasonsAdminPage /> },
          { path: 'episodes', element: <EpisodesAdminPage /> },
          { path: 'subtitles', element: <SubtitlesAdminPage /> },
          { path: 'processing', element: <VideoProcessingAdminPage /> },
          { path: 'media', element: <MediaLibraryAdminPage /> },
          { path: 'movies', element: <MoviesAdminPage /> },
          { path: 'genres', element: <GenresAdminPage /> },
          { path: 'users', element: <UsersAdminPage /> },
          { path: 'comments', element: <CommentsAdminPage /> },
          { path: 'storage', element: <StorageAdminPage /> },
          { path: 'audit', element: <AuditAdminPage /> },
          { path: 'settings', element: <SettingsAdminPage /> },
          { path: 'settings/design', element: <DesignAdminPage /> },
        ],
      }],
    },
    { path: '*', element: <NotFoundPage /> },
  ],
}]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BackendGate>
        <AuthProvider>
          <VideoProcessingJobsProvider>
            <SiteSettingsProvider>
              <Suspense fallback={<main className="mx-auto min-h-screen max-w-7xl px-4 py-24"><LoadingBlock label="Cargando pagina" /></main>}>
                <RouterProvider router={router} />
              </Suspense>
            </SiteSettingsProvider>
          </VideoProcessingJobsProvider>
        </AuthProvider>
      </BackendGate>
    </AppErrorBoundary>
  </React.StrictMode>,
);

registerServiceWorker();

function lazyNamed<TModule, TKey extends keyof TModule>(loader: () => Promise<TModule>, key: TKey) {
  return lazy(async () => ({ default: (await loader())[key] as React.ComponentType }));
}
