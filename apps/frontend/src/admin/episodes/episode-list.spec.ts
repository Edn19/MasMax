import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEpisodeListQuery, episodeDeleteLabel, episodePageCount, episodeProcessingLabel } from './episode-list';

test('construye busqueda y filtros sin parametros vacios', () => {
  const query = buildEpisodeListQuery({ seriesId: 'series-1', seasonId: 'season-1', search: '  final  ', published: 'DRAFT', video: 'MISSING', page: 2, limit: 20 });
  const params = new URLSearchParams(query);
  assert.equal(params.get('search'), 'final');
  assert.equal(params.get('published'), 'false');
  assert.equal(params.get('videoState'), 'MISSING');
  assert.equal(params.get('page'), '2');
});

test('calcula paginas y describe estado de procesamiento', () => {
  assert.equal(episodePageCount(41, 20), 3);
  assert.equal(episodeProcessingLabel({ videoUrl: undefined, processingJob: null }), 'Sin video');
  assert.equal(episodeProcessingLabel({ videoUrl: undefined, mediaFileId: 'media-1', processingJob: null }), 'Sin proceso activo');
  assert.equal(episodeProcessingLabel({ videoUrl: undefined, processingJob: { kind: 'HLS', status: 'PROCESSING', progress: 37 } as never }), 'HLS: procesando 37%');
  assert.equal(episodeProcessingLabel({ videoUrl: '/uploads/video.mp4', processingJob: { kind: 'REMUX', status: 'COMPLETED', progress: 100 } as never }), 'Sin proceso activo');
});

test('incluye contexto completo en la confirmacion de borrado', () => {
  assert.equal(episodeDeleteLabel({ number: 7, title: 'El regreso', series: { title: 'Horizonte' } as never, season: { number: 2 } as never }), 'Horizonte · Temporada 2 · E7. El regreso');
});
