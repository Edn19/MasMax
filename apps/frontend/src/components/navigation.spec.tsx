import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasAdminRole } from '../lib/auth-storage';
import { accountNavigationItems, mainNavigationItems, mobileNavigationItems } from '../lib/navigation';
import { User } from '../types/models';

const admin: User = { id: 'admin', name: 'Administrador', email: 'admin@site.local', role: 'ADMIN' };
const regularUser: User = { id: 'user', name: 'Usuario', email: 'user@site.local', role: 'USER' };
describe('navegacion por rol', () => {
  it('no muestra acceso administrativo en la navegacion principal', () => {
    assert.deepEqual(mainNavigationItems.map((item) => item.label), ['Inicio', 'Series', 'Peliculas', 'Favoritos']);
  });

  it('muestra el panel solo dentro del menu del administrador', () => {
    assert.equal(accountNavigationItems(admin).some((item) => item.to === '/admin'), true);
    assert.equal(accountNavigationItems(regularUser).some((item) => item.to === '/admin'), false);
  });

  it('mantiene un unico acceso administrativo en el menu movil', () => {
    assert.equal(mobileNavigationItems(admin).filter((item) => item.to === '/admin').length, 1);
    assert.equal(mobileNavigationItems(regularUser).filter((item) => item.to === '/admin').length, 0);
    assert.equal(mobileNavigationItems(null).filter((item) => item.to === '/admin').length, 0);
  });

  it('rechaza roles normales o sesiones inexistentes para administracion', () => {
    assert.equal(hasAdminRole(admin), true);
    assert.equal(hasAdminRole(regularUser), false);
    assert.equal(hasAdminRole(null), false);
  });
});
