import assert from 'node:assert/strict';
import test from 'node:test';
import { episodeEditorErrorMessage, episodeFormToUpdatePayload, episodeToFormState, normalizeDateForInput, normalizeEpisodePublished, resolveEpisodeVideoState, serializeDateFromInput, validateEpisodeBasicInfo, withEpisodeFormField, withEpisodePublished } from './episode-editor';
import { applyHlsProcessingJob, applyRemuxProcessingJob } from './episode-media-runtime';
import type { SelectableEpisodeMedia } from './EpisodeMediaSelector';

const completeEpisode = () => ({
  id: 'episode-1', seriesId: 'series-1', seasonId: 'season-1', number: 3, position: 2, title: 'Episodio', description: 'Descripcion',
  videoUrl: 'https://media.example/episode.mp4', videoSource: 'URL' as const, videoType: 'MP4' as const,
  thumbnailUrl: 'https://media.example/poster.jpg', durationSec: 120, published: true, publishedAt: '2026-08-04T12:30:00.000Z',
});

const selectableMedia = (): SelectableEpisodeMedia => ({
  id: 'media-1', originalName: 'episode.mkv', sizeBytes: '1024', durationSec: 120, width: 1920, height: 1080,
  videoCodec: 'h264', audioCodec: 'aac', mimeType: 'video/x-matroska', extension: '.mkv', status: 'PROCESSING',
  progress: 20, processingJobId: 'hls-1', processingError: null, originalUrl: '/original.mkv', hlsUrl: null,
  remuxUrl: null, remuxJobId: 'remux-1', remuxStatus: 'PROCESSING', remuxProgress: 30, remuxError: null,
  playbackUrl: null, directPlaybackCompatible: false, compatibilityMessage: 'Requiere conversion.', fastStart: null,
  thumbnailUrl: null, createdAt: '2026-08-16T00:00:00.000Z',
});

const processingJob = (overrides: Record<string, unknown> = {}) => ({
  id: 'hls-1', status: 'PROCESSING' as const, progress: 20, stage: 'encoding', originalName: 'episode.mkv',
  createdAt: '2026-08-16T00:00:00.000Z', ...overrides,
});

test('el polling HLS es idempotente y solo actualiza el estado tecnico del medio', () => {
  const media = selectableMedia();
  assert.equal(applyHlsProcessingJob(media, processingJob()), media);
  const completed = applyHlsProcessingJob(media, processingJob({ status: 'COMPLETED', progress: 100, masterUrl: '/hls/master.m3u8', thumbnailUrl: '/poster.jpg' }) as never);
  assert.notEqual(completed, media);
  assert.equal(completed.status, 'READY');
  assert.equal(completed.hlsUrl, '/hls/master.m3u8');
  assert.equal(completed.thumbnailUrl, '/poster.jpg');
  assert.equal(completed.originalUrl, media.originalUrl);
  assert.equal(completed.originalName, media.originalName);
});

test('el polling REMUX es idempotente y CANCELLED se presenta como fallo', () => {
  const media = selectableMedia();
  const unchanged = applyRemuxProcessingJob(media, processingJob({ id: 'remux-1', progress: 30 }));
  assert.equal(unchanged, media);
  const cancelled = applyRemuxProcessingJob(media, processingJob({ id: 'remux-1', status: 'CANCELLED', progress: 30, errorMessage: 'Cancelado' }) as never);
  assert.equal(cancelled.remuxStatus, 'FAILED');
  assert.equal(cancelled.remuxError, 'Cancelado');
  assert.equal(cancelled.hlsUrl, media.hlsUrl);
});

test('normaliza un episodio completo para editar', () => {
  const form = episodeToFormState(completeEpisode());
  assert.equal(form.seriesId, 'series-1');
  assert.equal(form.seasonId, 'season-1');
  assert.equal(form.publishedAt, '2026-08-04');
  assert.equal(form.videoMode, 'URL');
  assert.equal(form.playbackMode, 'ORIGINAL');
});

test('reproduce y evita el crash de publishedAt nulo en un episodio legacy', () => {
  const legacy = { ...completeEpisode(), description: null, thumbnailUrl: null, videoUrl: null, publishedAt: null };
  assert.throws(() => Function('item', 'return item.publishedAt.slice(0, 10)')(legacy), TypeError);
  const form = episodeToFormState(legacy);
  assert.equal(form.publishedAt, '');
  assert.equal(form.description, '');
  assert.equal(form.thumbnailUrl, '');
  assert.equal(form.videoMode, 'NONE');
});

test('normaliza published heredado sin convertir la cadena false en true', () => {
  const cases: Array<[unknown, boolean]> = [
    [true, true], [false, false], [1, true], [0, false], ['true', true], ['false', false], ['1', true], ['0', false], [null, false], [undefined, false], ['', false], ['invalid', false],
  ];
  for (const [value, expected] of cases) assert.equal(normalizeEpisodePublished(value), expected);
  assert.equal(episodeToFormState({ ...completeEpisode(), published: 'false' }).published, false);
});

test('activar y desactivar published conserva los demas campos', () => {
  const original = episodeToFormState(completeEpisode());
  const disabled = withEpisodePublished(original, false);
  const enabled = withEpisodePublished(disabled, true);
  assert.equal(disabled.published, false);
  assert.equal(enabled.published, true);
  assert.equal(enabled.title, original.title);
  assert.equal(enabled.videoUrl, original.videoUrl);
  assert.equal(enabled.seasonId, original.seasonId);
  assert.equal(original.published, true);
});

test('la secuencia critica de numero, published y titulo conserva cada cambio', async () => {
  let form = episodeToFormState({ ...completeEpisode(), number: 2, published: false, title: 'Original' });

  form = withEpisodeFormField(form, 'number', '3');
  await Promise.resolve();
  assert.equal(form.number, '3');

  form = withEpisodePublished(form, true);
  assert.equal(form.published, true);

  form = withEpisodeFormField(form, 'title', 'Nuevo titulo');
  assert.equal(form.title, 'Nuevo titulo');
  assert.equal(form.number, '3');

  form = withEpisodePublished(form, false);
  assert.equal(form.published, false);
  assert.equal(form.title, 'Nuevo titulo');
  assert.equal(form.number, '3');
});

test('cada campo basico admite estados intermedios sin restaurar valores anteriores', () => {
  let form = episodeToFormState(completeEpisode());
  form = withEpisodeFormField(form, 'number', '');
  assert.equal(form.number, '');
  form = withEpisodeFormField(form, 'number', '4');
  form = withEpisodeFormField(form, 'position', '7');
  form = withEpisodeFormField(form, 'title', 'Nuevo titulo');
  form = withEpisodeFormField(form, 'durationSec', '1800');
  form = withEpisodeFormField(form, 'publishedAt', '2026-08-08');
  form = withEpisodeFormField(form, 'description', 'Primera linea\nSegunda linea');
  form = withEpisodePublished(withEpisodePublished(form, true), false);

  assert.deepEqual(
    { number: form.number, position: form.position, title: form.title, durationSec: form.durationSec, publishedAt: form.publishedAt, description: form.description, published: form.published },
    { number: '4', position: '7', title: 'Nuevo titulo', durationSec: '1800', publishedAt: '2026-08-08', description: 'Primera linea\nSegunda linea', published: false },
  );
  assert.equal(form.videoUrl, completeEpisode().videoUrl);
});

test('una actualizacion posterior no repone el titulo original despues de un ciclo asincrono', async () => {
  let form = episodeToFormState(completeEpisode());
  const updates = [
    (current: typeof form) => withEpisodeFormField(current, 'title', 'Nuevo'),
    (current: typeof form) => withEpisodeFormField(current, 'description', 'Descripcion nueva'),
    (current: typeof form) => withEpisodeFormField(current, 'durationSec', '360'),
  ];
  for (const update of updates) form = update(form);
  await Promise.resolve();
  assert.equal(form.title, 'Nuevo');
  assert.equal(form.description, 'Descripcion nueva');
  assert.equal(form.durationSec, '360');
});

test('normaliza y serializa fechas para input sin aceptar fechas imposibles', () => {
  assert.equal(normalizeDateForInput('2026-08-08T14:30:00.000Z'), '2026-08-08');
  assert.equal(normalizeDateForInput(null), '');
  assert.equal(serializeDateFromInput('2026-08-08'), '2026-08-08T00:00:00.000Z');
  assert.equal(serializeDateFromInput('2026-02-30'), undefined);
  assert.equal(serializeDateFromInput('08/08/2026'), undefined);
});

test('conserva una fecha nueva recibida por el control antes de serializar', () => {
  const form = withEpisodeFormField(episodeToFormState(completeEpisode()), 'publishedAt', '2026-08-06');
  assert.equal(form.publishedAt, '2026-08-06');
  assert.equal(episodeFormToUpdatePayload(form, true).publishedAt, '2026-08-06T00:00:00.000Z');
});

test('valida numero, posicion, titulo, duracion y fecha antes de guardar', () => {
  const form = episodeToFormState(completeEpisode());
  assert.deepEqual(validateEpisodeBasicInfo(form), {});
  assert.deepEqual(validateEpisodeBasicInfo({ ...form, number: '', position: '-1', title: ' ', durationSec: '1.5', publishedAt: '2026-02-30' }), {
    number: 'El numero debe ser un entero mayor o igual a 1.',
    position: 'La posicion debe ser un entero mayor o igual a 0.',
    title: 'El titulo debe tener al menos 2 caracteres.',
    durationSec: 'La duracion debe ser un entero mayor o igual a 0.',
    publishedAt: 'La fecha de publicacion no es valida.',
  });
});

test('el payload envia booleanos y publicar sin video listo queda como borrador', () => {
  const form = episodeToFormState(completeEpisode());
  assert.equal(episodeFormToUpdatePayload(withEpisodePublished(form, true), true).published, true);
  assert.equal(episodeFormToUpdatePayload(withEpisodePublished(form, false), true).published, false);
  assert.equal(episodeFormToUpdatePayload(withEpisodePublished(form, true), false).published, false);
});

test('deriva serie y temporada desde la relacion sin inventar identificadores', () => {
  const form = episodeToFormState({ id: 'legacy', title: 'Legacy', season: { id: 'season-2', seriesId: 'series-2' }, subtitles: null });
  assert.equal(form.seriesId, 'series-2');
  assert.equal(form.seasonId, 'season-2');
  assert.equal(form.number, '');
});

test('recupera videos HLS y trabajos activos, completados o inexistentes', () => {
  assert.equal(resolveEpisodeVideoState({ id: 'hls', videoUrl: 'https://media.example/master.m3u8' }).videoType, 'HLS');
  assert.equal(resolveEpisodeVideoState({ id: 'active', processingJob: { id: 'job-1', status: 'PROCESSING', progress: 30, stage: 'TRANSCODING', originalName: 'video.mkv', createdAt: '2026-08-04' } }).status, 'PROCESSING');
  assert.equal(resolveEpisodeVideoState({ id: 'done', processingJob: { id: 'job-2', status: 'COMPLETED', progress: 100, stage: 'COMPLETED', originalName: 'video.mkv', masterUrl: '/uploads/hls/job-2/master.m3u8', createdAt: '2026-08-04' } }).videoUrl, '/uploads/hls/job-2/master.m3u8');
  assert.equal(resolveEpisodeVideoState({ id: 'done', mediaFileId: 'media-1', processingJob: { id: 'job-2', status: 'COMPLETED', progress: 100, stage: 'COMPLETED', originalName: 'video.mkv', masterUrl: '/uploads/hls/job-2/master.m3u8', createdAt: '2026-08-04' } }).processingJobId, '');
  assert.equal(resolveEpisodeVideoState({ id: 'active-source', mediaFileId: 'media-1', playbackMode: 'REMUX', remuxedVideoUrl: '/uploads/video.mp4', processingJob: { id: 'job-hls', kind: 'HLS', status: 'PROCESSING', progress: 30, stage: 'GENERATING_HLS_360P', originalName: 'video.mkv', createdAt: '2026-08-04' } }).processingJobId, 'job-hls');
  assert.equal(episodeToFormState({ id: 'active-source', mediaFileId: 'media-1', playbackMode: 'REMUX', remuxedVideoUrl: '/uploads/video.mp4', processingJob: { id: 'job-hls', kind: 'HLS', status: 'PROCESSING', progress: 30, stage: 'GENERATING_HLS_360P', originalName: 'video.mkv', createdAt: '2026-08-04' } }).playbackMode, 'REMUX');
  assert.equal(resolveEpisodeVideoState({ id: 'missing', processingJobId: 'job-missing' }).status, 'MISSING');
  const originalWithHls = resolveEpisodeVideoState({ id: 'dual', playbackMode: 'ORIGINAL', mediaFileId: 'media-1', videoUrl: '/uploads/videos/video.mp4', originalVideoUrl: '/uploads/videos/video.mp4', processedVideoUrl: '/uploads/hls/job/master.m3u8', videoSource: 'LOCAL', videoType: 'MP4', processingJob: { id: 'job-3', status: 'COMPLETED', progress: 100, stage: 'COMPLETED', originalName: 'video.mp4', masterUrl: '/uploads/hls/job/master.m3u8', createdAt: '2026-08-04' } });
  assert.equal(originalWithHls.videoType, 'MP4');
  assert.equal(originalWithHls.videoUrl, '/uploads/videos/video.mp4');
});

test('crea un payload de actualizacion sin campos de UI ni seriesId', () => {
  const payload = episodeFormToUpdatePayload(episodeToFormState(completeEpisode()), true);
  assert.equal(payload.seasonId, 'season-1');
  assert.equal(payload.episodeNumber, 3);
  assert.equal(payload.title, 'Episodio');
  assert.equal(payload.position, 2);
  assert.equal(payload.durationSec, 120);
  assert.equal(payload.publishedAt, '2026-08-04T00:00:00.000Z');
  assert.equal(payload.videoUrl, completeEpisode().videoUrl);
  assert.ok(!('seriesId' in payload));
  assert.ok(!('videoMode' in payload));
  assert.ok(!('processingJob' in payload));
});

test('vincula y desvincula MediaFile de forma explicita', () => {
  const linked = { ...episodeToFormState(completeEpisode()), videoMode: 'AVAILABLE' as const, mediaFileId: 'media-1', processingJobId: '', processingJobStatus: 'ORIGINAL' as const };
  assert.equal(episodeFormToUpdatePayload(linked, true).mediaFileId, 'media-1');
  assert.equal(episodeFormToUpdatePayload({ ...linked, playbackMode: 'HLS' }, true).playbackMode, 'HLS');
  const processingAnotherVersion = { ...linked, playbackMode: 'REMUX' as const, processingJobId: 'job-hls', processingJobStatus: 'PROCESSING' as const };
  assert.equal(episodeFormToUpdatePayload(processingAnotherVersion, true).mediaFileId, 'media-1');
  assert.equal(episodeFormToUpdatePayload(processingAnotherVersion, true).processingJobId, undefined);
  assert.equal(episodeFormToUpdatePayload(processingAnotherVersion, true).playbackMode, 'REMUX');
  const unlinked = { ...linked, videoMode: 'NONE' as const, mediaFileId: '', videoUrl: '' };
  assert.equal(episodeFormToUpdatePayload(unlinked, false).mediaFileId, null);
  assert.equal(episodeFormToUpdatePayload(unlinked, false).videoUrl, '');
});

test('presenta errores de carga segun el estado HTTP', () => {
  const apiFailure = (message: string, status: number) => Object.assign(new Error(message), { status });
  assert.equal(episodeEditorErrorMessage(apiFailure('missing', 404)), 'El episodio ya no existe.');
  assert.equal(episodeEditorErrorMessage(apiFailure('forbidden', 403)), 'No tienes permisos para editar este episodio.');
  assert.equal(episodeEditorErrorMessage(apiFailure('invalid', 400)), 'invalid');
  assert.equal(episodeEditorErrorMessage(apiFailure('failure', 500)), 'No se pudo cargar el episodio.');
});
