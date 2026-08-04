import { api, ApiError, deleteJson, getToken, postJson, restoreSession } from './api';

const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export type ResumableUploadSession = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  chunkSize: number;
  totalChunks: number;
  uploadedParts: number[];
  uploadedBytes: number;
  status: 'INITIATED' | 'UPLOADING' | 'ASSEMBLING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED' | 'FAILED';
  expiresAt: string;
  errorMessage?: string;
};

export type VideoProcessingJob = {
  id: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress: number;
  profiles: number[];
  attempts: number;
  errorMessage?: string | null;
  masterUrl?: string | null;
  thumbnailUrl?: string | null;
};
export type ResumableUploadResult = { url: string; mimeType: string; mediaId: string; processingJob?: VideoProcessingJob | null };
export type UploadControl = { paused: boolean; cancelled: boolean; request?: XMLHttpRequest };
export type UploadMetrics = { progress: number; speedBytesPerSecond: number; etaSeconds: number | null };

export const listResumableUploads = () => api<ResumableUploadSession[]>('/admin/uploads/resumable');
export const getResumableUpload = (id: string) => api<ResumableUploadSession>(`/admin/uploads/resumable/${id}`);
export const initiateResumableUpload = (file: File) => postJson<ResumableUploadSession>('/admin/uploads/resumable', { originalName: file.name, mimeType: file.type, size: file.size });
export const cancelResumableUpload = (id: string) => deleteJson<{ cancelled: boolean }>(`/admin/uploads/resumable/${id}`);

export async function uploadResumableVideo(file: File, initial: ResumableUploadSession, control: UploadControl, onMetrics: (metrics: UploadMetrics) => void) {
  let session = initial;
  let confirmedBytes = session.uploadedBytes;
  const startedAt = performance.now();
  const initialBytes = confirmedBytes;
  for (let index = 0; index < session.totalChunks; index += 1) {
    if (control.paused || control.cancelled) return { session };
    if (session.uploadedParts.includes(index)) continue;
    const start = index * session.chunkSize;
    const chunk = file.slice(start, Math.min(file.size, start + session.chunkSize), 'video/mp4');
    const checksum = await sha256(chunk);
    session = await uploadPartWithRetry(session.id, index, chunk, checksum, control, (loaded) => {
      const elapsedSeconds = Math.max(0.001, (performance.now() - startedAt) / 1000);
      const transferred = confirmedBytes - initialBytes + loaded;
      const speed = transferred / elapsedSeconds;
      const completed = confirmedBytes + loaded;
      onMetrics({ progress: Math.min(100, completed / file.size * 100), speedBytesPerSecond: speed, etaSeconds: speed > 0 ? Math.max(0, (file.size - completed) / speed) : null });
    });
    confirmedBytes = session.uploadedBytes;
    if (control.paused || control.cancelled) return { session };
  }
  if (control.paused || control.cancelled) return { session };
  onMetrics({ progress: 100, speedBytesPerSecond: 0, etaSeconds: 0 });
  return { session, result: await postJson<ResumableUploadResult>(`/admin/uploads/resumable/${session.id}/complete`, {}) };
}

async function uploadPartWithRetry(id: string, index: number, chunk: Blob, checksum: string, control: UploadControl, onProgress: (loaded: number) => void) {
  let lastError: Error = new Error('No se pudo subir la parte');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (control.paused || control.cancelled) throw new ApiError('Carga pausada', 0, 'UPLOAD_PAUSED');
    try { return await uploadPart(id, index, chunk, checksum, control, onProgress); }
    catch (error) {
      lastError = error as Error;
      if (control.paused || control.cancelled || (error instanceof ApiError && error.code === 'UPLOAD_PAUSED')) throw error;
      if (error instanceof ApiError && error.status === 401) await restoreSession();
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw lastError;
}

function uploadPart(id: string, index: number, chunk: Blob, checksum: string, control: UploadControl, onProgress: (loaded: number) => void): Promise<ResumableUploadSession> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    control.request = request;
    const data = new FormData();
    data.append('file', chunk, `part-${index}.mp4`);
    data.append('index', String(index));
    data.append('checksum', checksum);
    request.open('POST', `${API_URL}/admin/uploads/resumable/${encodeURIComponent(id)}/parts`);
    request.withCredentials = true;
    const token = getToken();
    if (token) request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.upload.onprogress = (event) => onProgress(event.loaded);
    request.onabort = () => reject(new ApiError('Carga pausada', 0, 'UPLOAD_PAUSED'));
    request.onerror = () => reject(new ApiError('No se pudo conectar durante la subida de la parte.', 0));
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

async function sha256(content: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await content.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
