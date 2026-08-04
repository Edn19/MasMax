import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { boundedPercent, isNavigationPathActive, siteDisplayName } from './ui';

describe('estado visual de navegacion', () => {
  it('distingue rutas exactas y descendientes', () => {
    assert.equal(isNavigationPathActive('/admin', '/admin', true), true);
    assert.equal(isNavigationPathActive('/admin/users', '/admin', true), false);
    assert.equal(isNavigationPathActive('/admin/settings/design', '/admin/settings'), true);
    assert.equal(isNavigationPathActive('/admin/users', '/admin/movies'), false);
  });

  it('limita porcentajes para barras de progreso accesibles', () => {
    assert.equal(boundedPercent(-12), 0);
    assert.equal(boundedPercent(48.5), 48.5);
    assert.equal(boundedPercent(140), 100);
    assert.equal(boundedPercent(Number.NaN), 0);
  });

  it('separa la version del nombre visual sin alterar otros nombres', () => {
    assert.equal(siteDisplayName('NovaStream version 2'), 'NovaStream');
    assert.equal(siteDisplayName('MasMax'), 'MasMax');
    assert.equal(siteDisplayName('  Cine Local  '), 'Cine Local');
  });
});
