import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import './index.css';
import { AdminLogin } from './admin/AdminLogin';
import { AdminShell } from './admin/AdminShell';
import {
  CommentsAdminPage,
  DashboardPage,
  DesignAdminPage,
  EpisodesAdminPage,
  GenresAdminPage,
  MoviesAdminPage,
  SeriesAdminPage,
  SettingsAdminPage,
  UsersAdminPage,
  StorageAdminPage,
  AuditAdminPage,
} from './admin/AdminPages';
import { AdminRoute, ProtectedRoute } from './components/ProtectedRoute';
import { PublicLayout } from './components/Layout';
import { AuthProvider } from './lib/auth';
import { SiteSettingsProvider } from './lib/site-settings';
import { FavoritesPage, MoviesPage, ProfilePage, SecurityPage, SeriesCatalogPage } from './pages/AccountPages';
import { HomePage } from './pages/HomePage';
import { MovieWatchPage } from './pages/MovieWatchPage';
import { SeriesDetailPage } from './pages/SeriesDetailPage';
import { WatchPage } from './pages/WatchPage';

const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <AdminLogin /> },
  { path: '/admin/login', element: <Navigate to="/login" replace /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
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
      },
    ],
  },
  {
    element: <AdminRoute />,
    children: [
      {
        path: '/admin',
        element: <AdminShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'series', element: <SeriesAdminPage /> },
          { path: 'episodes', element: <EpisodesAdminPage /> },
          { path: 'movies', element: <MoviesAdminPage /> },
          { path: 'genres', element: <GenresAdminPage /> },
          { path: 'users', element: <UsersAdminPage /> },
          { path: 'comments', element: <CommentsAdminPage /> },
          { path: 'storage', element: <StorageAdminPage /> },
          { path: 'audit', element: <AuditAdminPage /> },
          { path: 'settings', element: <SettingsAdminPage /> },
          { path: 'settings/design', element: <DesignAdminPage /> },
        ],
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <SiteSettingsProvider>
        <RouterProvider router={router} />
      </SiteSettingsProvider>
    </AuthProvider>
  </React.StrictMode>,
);
