import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { AdminErrorBoundary, AdminErrorFallback } from './AdminErrorBoundary';

test('convierte una excepcion de render en estado de error', () => {
  const error = new Error('render failed');
  assert.deepEqual(AdminErrorBoundary.getDerivedStateFromError(error), { error });
});

test('muestra un fallback que permite volver al listado', () => {
  const markup = renderToStaticMarkup(createElement(StaticRouter, { location: '/admin/episodes' }, createElement(AdminErrorFallback, { onRetry: () => undefined })));
  assert.match(markup, /No se pudo actualizar el estado de publicación del episodio/);
  assert.match(markup, /\/admin\/episodes/);
});
