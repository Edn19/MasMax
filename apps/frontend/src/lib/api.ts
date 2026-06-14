import { getAccessToken } from './auth-storage';

const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function getToken() {
  return getAccessToken();
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError('No se pudo conectar con la API. Verifica que el backend este disponible.', 0);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: 'Error inesperado' }));
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    throw new ApiError(message || `La API respondio con estado ${response.status}`, response.status);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const postJson = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const patchJson = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteJson = <T>(path: string) => api<T>(path, { method: 'DELETE' });

export function uploadFile<T>(path: string, file: File, onProgress: (progress: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const data = new FormData();
    data.append('file', file);
    request.open('POST', `${API_URL}${path}`);
    const token = getToken();
    if (token) request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new ApiError('No se pudo conectar con la API durante la subida.', 0));
    request.onload = () => {
      const body = JSON.parse(request.responseText || '{}') as T & { message?: string | string[] };
      if (request.status >= 200 && request.status < 300) resolve(body);
      else {
        const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
        reject(new ApiError(message || 'No se pudo subir el archivo.', request.status));
      }
    };
    request.send(data);
  });
}
