import { api, ApiError, deleteJson, getToken, postJson } from './api';
import { isRetryableUploadError, matchesResumableFile, resumableChunkMimeType, retryDelayMs } from './resumable-upload-policy';

export { matchesResumableFile } from './resumable-upload-policy';

const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export type ResumableUploadSession = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  lastModified: number | null;
  chunkSize: number;
  totalChunks: number;
  uploadedParts: number[];
  uploadedBytes: number;
  maxRetryAttempts: number;
  status: 'INITIATED' | 'UPLOADING' | 'ASSEMBLING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED' | 'FAILED';
  expiresAt: string;
  errorMessage?: string;
};

export type VideoProcessingJob = {
  id: string;
  kind?: 'HLS' | 'REMUX';
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress: number;
  stage: string;
  profiles: number[];
  generatedQualities: number[];
  attempts: number;
  errorMessage?: string | null;
  masterUrl?: string | null;
  outputUrl?: string | null;
  thumbnailUrl?: string | null;
  retainOriginal: boolean;
  sourceFormat?: string | null;
  sourceVideoCodec?: string | null;
  sourceAudioCodecs?: unknown;
  audioTracks?: unknown;
  subtitleTracks?: unknown;
  targetType?: 'MOVIE' | 'EPISODE' | null;
  targetId?: string | null;
  associatedAt?: string | null;
};
export type VideoProcessingMode = 'ORIGINAL' | 'REMUX' | 'HLS' | 'TRANSCODE';
export type ResumableUploadResult = { url: string; mimeType: string; mediaId: string; processingMode: VideoProcessingMode; metadata?: { videoCodec?: string; audioTracks?: Array<{ codec?: string }>; width?: number; height?: number; durationSec?: number; fastStart?: boolean | null }; processingJob?: VideoProcessingJob | null };
export type UploadControl = { paused: boolean; cancelled: boolean; request?: XMLHttpRequest; abortController?: AbortController };
export type UploadRetryState = { part: number; totalParts: number; attempt: number; maxAttempts: number };
export type UploadMetrics = { progress: number; speedBytesPerSecond: number; etaSeconds: number | null; retry?: UploadRetryState };

export const listResumableUploads = () => api<ResumableUploadSession[]>('/admin/uploads/resumable');
export const getResumableUpload = (id: string) => api<ResumableUploadSession>(`/admin/uploads/resumable/${id}`);
export const initiateResumableUpload = (file: File) => postJson<ResumableUploadSession>('/admin/uploads/resumable', { originalName: file.name, mimeType: file.type, size: file.size, lastModified: file.lastModified });
export const cancelResumableUpload = (id: string) => deleteJson<{ cancelled: boolean }>(`/admin/uploads/resumable/${id}`);

export async function uploadResumableVideo(file: File, initial: ResumableUploadSession, control: UploadControl, onMetrics: (metrics: UploadMetrics) => void, processingMode: VideoProcessingMode = 'HLS') {
  let session = initial;
  if (!matchesResumableFile(session, file)) throw new ApiError('El archivo seleccionado no coincide con la sesion pendiente.', 409, 'UPLOAD_IDENTITY_MISMATCH');
  let confirmedBytes = session.uploadedBytes;
  const startedAt = performance.now();
  const initialBytes = confirmedBytes;
  for (let index = 0; index < session.totalChunks; index += 1) {
    if (control.paused || control.cancelled) return { session };
    if (session.uploadedParts.includes(index)) continue;
    const start = index * session.chunkSize;
    const chunk = file.slice(start, Math.min(file.size, start + session.chunkSize), resumableChunkMimeType(file.type));
    const checksum = await sha256(chunk);
    session = await uploadPartWithRetry(session.id, index, session.totalChunks, chunk, checksum, session.maxRetryAttempts, control, (loaded) => {
      const elapsedSeconds = Math.max(0.001, (performance.now() - startedAt) / 1000);
      const transferred = confirmedBytes - initialBytes + loaded;
      const speed = transferred / elapsedSeconds;
      const completed = confirmedBytes + loaded;
      onMetrics({ progress: Math.min(99.9, completed / file.size * 100), speedBytesPerSecond: speed, etaSeconds: speed > 0 ? Math.max(0, (file.size - completed) / speed) : null });
    }, (retry) => onMetrics({ progress: Math.min(99.9, confirmedBytes / file.size * 100), speedBytesPerSecond: 0, etaSeconds: null, retry }));
    confirmedBytes = session.uploadedBytes;
    if (control.paused || control.cancelled) return { session };
  }
  if (control.paused || control.cancelled) return { session };
  onMetrics({ progress: 99.9, speedBytesPerSecond: 0, etaSeconds: null });
  const result = await postJson<ResumableUploadResult>(`/admin/uploads/resumable/${session.id}/complete`, { processingMode });
  onMetrics({ progress: 100, speedBytesPerSecond: 0, etaSeconds: 0 });
  return { session, result };
}

async function uploadPartWithRetry(id: string, index: number, totalParts: number, chunk: Blob, checksum: string, maxAttempts: number, control: UploadControl, onProgress: (loaded: number) => void, onRetry: (state: UploadRetryState) => void) {
  let lastError: Error = new Error('No se pudo subir la parte');
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (control.paused || control.cancelled) throw new ApiError('Carga pausada', 0, 'UPLOAD_PAUSED');
    try { return await uploadPart(id, index, chunk, checksum, attempt, control, onProgress); }
    catch (error) {
      lastError = error as Error;
      if (control.paused || control.cancelled || (error instanceof ApiError && error.code === 'UPLOAD_PAUSED')) throw error;
      if (!isRetryableUploadError(error) || attempt >= maxAttempts) break;
      onRetry({ part: index + 1, totalParts, attempt: attempt + 1, maxAttempts });
      await cancellableDelay(retryDelayMs(attempt), control);
    }
  }
  const status = lastError instanceof ApiError ? lastError.status : 0;
  const code = lastError instanceof ApiError ? lastError.code : undefined;
  throw new ApiError(`No se pudo enviar una parte del video. La carga puede reanudarse. ${lastError.message}`, status, code);
}

function uploadPart(id: string, index: number, chunk: Blob, checksum: string, attempt: number, control: UploadControl, onProgress: (loaded: number) => void): Promise<ResumableUploadSession> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    control.request = request;
    const data = new FormData();
    data.append('file', chunk, `part-${index}.chunk`);
    data.append('index', String(index));
    data.append('checksum', checksum);
    data.append('attempt', String(attempt));
    request.open('POST', `${API_URL}/admin/uploads/resumable/${encodeURIComponent(id)}/parts`);
    request.withCredentials = true;
    request.timeout = 120_000;
    const token = getToken();
    if (token) request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.upload.onprogress = (event) => onProgress(event.loaded);
    request.onabort = () => reject(new ApiError('Carga pausada', 0, 'UPLOAD_PAUSED'));
    request.onerror = () => reject(new ApiError('No se pudo conectar durante la subida de la parte.', 0));
    request.ontimeout = () => reject(new ApiError('La subida de la parte excedio el tiempo de espera.', 408));
    request.onload = () => {
      control.request = undefined;
      let body: ResumableUploadSession & { message?: string | string[]; code?: string };
      try { body = JSON.parse(request.responseText || '{}') as typeof body; }
      catch { reject(new ApiError('El servidor devolvio una respuesta invalida.', request.status)); return; }
      if (request.status >= 200 && request.status < 300) resolve(body);
      else reject(new ApiError(Array.isArray(body.message) ? body.message.join(', ') : body.message || 'No se pudo subir la parte.', request.status, body.code));
    };
    request.send(data);
  });
}

function cancellableDelay(milliseconds: number, control: UploadControl) {
  control.abortController ??= new AbortController();
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    control.abortController?.signal.addEventListener('abort', () => { window.clearTimeout(timer); reject(new ApiError('Carga pausada', 0, 'UPLOAD_PAUSED')); }, { once: true });
  });
}

async function sha256(content: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await content.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
