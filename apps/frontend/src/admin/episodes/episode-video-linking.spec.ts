import assert from 'node:assert/strict';
import test from 'node:test';
import { EpisodeProcessingJob } from '../../types/models';
import { episodeVideoError, episodeVideoIsReady, persistentVideoReference } from './episode-video-linking';

const processingJob = (status: EpisodeProcessingJob['status']): EpisodeProcessingJob => ({ id: 'job-1', status, progress: 17, stage: status, originalName: 'episodio.mkv', createdAt: '2026-08-04T00:00:00.000Z' });

test('acepta un job activo como referencia persistente sin exigir videoUrl', () => {
  assert.equal(episodeVideoError('AVAILABLE', '', 'job-1'), undefined);
  assert.deepEqual(persistentVideoReference('AVAILABLE', 'job-1', ''), { processingJobId: 'job-1' });
  assert.equal(episodeVideoIsReady('', processingJob('PROCESSING')), false);
});

test('recupera jobs completados como video listo', () => {
  assert.equal(episodeVideoIsReady('', processingJob('COMPLETED')), true);
});

test('distingue una carga persistente de un archivo o URL ausente', () => {
  assert.equal(episodeVideoError('AVAILABLE', '', ''), 'Selecciona un archivo cargado.');
  assert.equal(episodeVideoError('URL', '', ''), 'Agrega una URL de video.');
  assert.deepEqual(persistentVideoReference('NONE', '', ''), {});
});
