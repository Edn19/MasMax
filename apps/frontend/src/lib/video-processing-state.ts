import { ResumableUploadSession, VideoProcessingJob } from './resumable-upload';

export type ProcessingJobRow = VideoProcessingJob & {
  requestedById?: string;
  originalName?: string;
  input: { id?: string; originalName: string };
  createdAt: string;
  updatedAt?: string;
};

export function isActiveProcessingJob(job: VideoProcessingJob) {
  return job.status === 'QUEUED' || job.status === 'PROCESSING';
}

export function mergeProcessingJobs(current: ProcessingJobRow[], incoming: ProcessingJobRow[]) {
  const jobs = new Map(current.map((job) => [job.id, job]));
  for (const job of incoming) jobs.set(job.id, job);
  return [...jobs.values()].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export function findProcessingJobForTarget(jobs: ProcessingJobRow[], targetType?: 'EPISODE' | 'MOVIE', targetId?: string) {
  if (!targetType || !targetId) return undefined;
  return jobs.find((job) => job.targetType === targetType && job.targetId === targetId);
}

export function shouldPromptForResumableFile(sessions: ResumableUploadSession[], processingJob?: VideoProcessingJob | null) {
  if (processingJob && ['QUEUED', 'PROCESSING', 'COMPLETED'].includes(processingJob.status)) return false;
  return sessions.some((session) => session.status === 'INITIATED' || session.status === 'UPLOADING');
}

export function processingStageLabel(stage: string | undefined, status: VideoProcessingJob['status']) {
  if (!stage) return ({ QUEUED: 'En cola', PROCESSING: 'Procesando', COMPLETED: 'Listo', FAILED: 'Error', CANCELLED: 'Cancelado' })[status];
  if (stage.startsWith('GENERATING_HLS_')) return `Generando ${stage.replace('GENERATING_HLS_', '').replace('P', 'p')}`;
  return ({ QUEUED: 'Archivo subido - en cola', PROBING: 'Analizando video', PREPARING: 'Preparando conversion', EXTRACTING_SUBTITLES: 'Extrayendo subtitulos', GENERATING_THUMBNAIL: 'Generando miniatura', VALIDATING: 'Validando salida', UPLOADING_OUTPUT: 'Guardando salida HLS', AWAITING_ASSOCIATION: 'Procesado - pendiente de asociar', ASSOCIATING: 'Asociando al contenido', COMPLETED: 'Procesamiento completado', FAILED: 'Procesamiento fallido', CANCELLED: 'Procesamiento cancelado' } as Record<string, string>)[stage] ?? stage;
}
