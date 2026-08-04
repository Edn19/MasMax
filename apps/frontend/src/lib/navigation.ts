import { User } from '../types/models';
import { hasAdminRole } from './auth-storage';

export type NavigationItem = { to: string; label: string };

export const mainNavigationItems: NavigationItem[] = [
  { to: '/home', label: 'Inicio' },
  { to: '/series', label: 'Series' },
  { to: '/movies', label: 'Peliculas' },
  { to: '/favorites', label: 'Favoritos' },
];

export function accountNavigationItems(user: Pick<User, 'role'>): NavigationItem[] {
  return [
    { to: '/profile', label: 'Mi perfil' },
    { to: '/profile/security', label: 'Seguridad y dispositivos' },
    ...(hasAdminRole(user) ? [{ to: '/admin', label: 'Panel administrativo' }] : []),
  ];
}

export function mobileNavigationItems(user: Pick<User, 'role'> | null): NavigationItem[] {
  return [
    ...mainNavigationItems,
    { to: '/profile', label: 'Perfil' },
    ...(hasAdminRole(user) ? [{ to: '/admin', label: 'Panel administrativo' }] : []),
  ];
}
