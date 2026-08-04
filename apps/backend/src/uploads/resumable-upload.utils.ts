export function totalPartsFor(sizeBytes: number, chunkSize: number) {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || !Number.isSafeInteger(chunkSize) || chunkSize < 1) throw new RangeError('Tamano de carga o chunk no valido');
  return Math.ceil(sizeBytes / chunkSize);
}

export function expectedPartSize(sizeBytes: number, chunkSize: number, totalChunks: number, index: number) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= totalChunks) throw new RangeError('Indice de parte fuera de rango');
  return index === totalChunks - 1 ? sizeBytes - chunkSize * (totalChunks - 1) : chunkSize;
}

export function mergeUploadedPart(uploadedParts: number[], index: number) {
  return [...new Set([...uploadedParts, index])].sort((left, right) => left - right);
}
