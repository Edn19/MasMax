import assert from 'node:assert/strict';
import test from 'node:test';
import { findProcessingJobForTarget, isActiveProcessingJob, mergeProcessingJobs, processingStageLabel, shouldPromptForResumableFile, ProcessingJobRow } from './video-processing-state';

const job = (update: Partial<ProcessingJobRow> = {}): ProcessingJobRow => ({ id: 'job-1', status: 'PROCESSING', progress: 17, stage: 'GENERATING_HLS_360P', profiles: [360], generatedQualities: [], attempts: 1, retainOriginal: true, sourceAudioCodecs: [], audioTracks: [], subtitleTracks: [], input: { originalName: 'episode.mkv' }, createdAt: '2026-08-04T10:00:00.000Z', ...update });
const upload = { id: 'upload-1', originalName: 'episode.mkv', mimeType: 'video/matroska', size: 100, lastModified: 1, chunkSize: 50, totalChunks: 2, uploadedParts: [0], uploadedBytes: 50, maxRetryAttempts: 5, status: 'UPLOADING' as const, expiresAt: '2026-08-05T10:00:00.000Z' };

test('reconoce jobs que requieren polling', () => {
  assert.equal(isActiveProcessingJob(job()), true);
  assert.equal(isActiveProcessingJob(job({ status: 'COMPLETED' })), false);
});

test('mezcla actualizaciones persistentes sin duplicar jobs', () => {
  const merged = mergeProcessingJobs([job()], [job({ progress: 42 })]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].progress, 42);
});

test('recupera el trabajo mas reciente asociado a un target', () => {
  const targetJob = job({ targetType: 'EPISODE', targetId: 'episode-1' });
  assert.equal(findProcessingJobForTarget([targetJob], 'EPISODE', 'episode-1')?.id, targetJob.id);
  assert.equal(findProcessingJobForTarget([targetJob], 'MOVIE', 'movie-1'), undefined);
});

test('solo pide el archivo local para uploads incompletos sin job del servidor', () => {
  assert.equal(shouldPromptForResumableFile([upload]), true);
  assert.equal(shouldPromptForResumableFile([upload], job()), false);
  assert.equal(shouldPromptForResumableFile([upload], job({ status: 'QUEUED' })), false);
  assert.equal(shouldPromptForResumableFile([{ ...upload, status: 'COMPLETED' }]), false);
});

test('presenta la etapa FFmpeg recuperada', () => {
  assert.equal(processingStageLabel('GENERATING_HLS_360P', 'PROCESSING'), 'Generando 360p');
});
