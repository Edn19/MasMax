export function expectedPartSize(sizeBytes: number, chunkSize: number, totalChunks: number, index: number) {
  return index === totalChunks - 1 ? sizeBytes - chunkSize * (totalChunks - 1) : chunkSize;
}

export function mergeUploadedPart(uploadedParts: number[], index: number) {
  return [...new Set([...uploadedParts, index])].sort((left, right) => left - right);
}
