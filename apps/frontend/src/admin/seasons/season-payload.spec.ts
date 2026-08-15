import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCreateSeasonPayload, buildUpdateSeasonPayload, createSeasonPath, seasonSaveErrorMessage, SeasonFormValues, updateSeasonPath } from './season-payload';

const form: SeasonFormValues = {
  number: '2',
  title: 'Horizonte',
  description: 'Descripcion actualizada',
  posterUrl: 'https://cdn.example.test/season-2.jpg',
  published: true,
};

test('el payload de creacion incluye la serie y todos los campos editables', () => {
  assert.deepEqual(buildCreateSeasonPayload('series-1', form), {
    seriesId: 'series-1',
    number: 2,
    title: 'Horizonte',
    description: 'Descripcion actualizada',
    posterUrl: 'https://cdn.example.test/season-2.jpg',
    published: true,
  });
  assert.equal(createSeasonPath, '/admin/seasons');
});

test('el payload de actualizacion nunca incluye seriesId', () => {
  const payload = buildUpdateSeasonPayload(form);
  assert.equal('seriesId' in payload, false);
  assert.deepEqual(payload, {
    number: 2,
    title: 'Horizonte',
    description: 'Descripcion actualizada',
    posterUrl: 'https://cdn.example.test/season-2.jpg',
    published: true,
  });
  assert.equal(updateSeasonPath('season-2'), '/admin/seasons/season-2');
});

test('poster subido, estado publicado y campos vacios conservan el contrato', () => {
  const payload = buildUpdateSeasonPayload({ ...form, number: '', title: '', posterUrl: '/uploads/images/poster.jpg' });
  assert.deepEqual(payload, {
    number: undefined,
    title: undefined,
    description: 'Descripcion actualizada',
    posterUrl: '/uploads/images/poster.jpg',
    published: true,
  });
});

test('dos series pueden crear su propia temporada 1', () => {
  const seasonOne = { ...form, number: '1' };
  assert.equal(buildCreateSeasonPayload('series-a', seasonOne).number, 1);
  assert.equal(buildCreateSeasonPayload('series-a', seasonOne).seriesId, 'series-a');
  assert.equal(buildCreateSeasonPayload('series-b', seasonOne).number, 1);
  assert.equal(buildCreateSeasonPayload('series-b', seasonOne).seriesId, 'series-b');
});

test('muestra el error claro de duplicado devuelto por la API', () => {
  assert.equal(
    seasonSaveErrorMessage(new Error('La serie ya tiene una temporada con ese numero.')),
    'La serie ya tiene una temporada con ese numero.',
  );
  assert.equal(seasonSaveErrorMessage(null), 'No se pudo guardar la temporada.');
});
