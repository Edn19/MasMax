export const acceptedVideoExtensions = ['.mp4', '.mkv'] as const;
export const acceptedVideoMimeTypes = ['video/mp4', 'application/mp4', 'video/matroska', 'video/x-matroska', 'application/x-matroska', 'application/octet-stream', ''] as const;
export const acceptedVideoInput = '.mp4,.mkv,video/mp4,application/mp4,video/matroska,video/x-matroska,application/x-matroska';
const acceptedMimeTypeSet = new Set<string>(acceptedVideoMimeTypes);

export function validateVideoSelection(file: Pick<File, 'name' | 'type' | 'size'>, maxMegabytes: number) {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!acceptedVideoExtensions.some((allowed) => allowed === extension) || !acceptedMimeTypeSet.has(file.type.toLowerCase())) return 'El tipo de archivo no es compatible. Usa MP4 o MKV.';
  if (file.size <= 0) return 'El archivo de video esta vacio.';
  if (file.size > maxMegabytes * 1024 * 1024) return `El archivo supera el limite de ${maxMegabytes} MB.`;
  return null;
}
