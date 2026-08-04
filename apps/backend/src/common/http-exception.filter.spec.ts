import { describe, expect, it } from 'vitest';
import { uploadLimitMessage } from './http-exception.filter';

describe('upload limit errors', () => {
  it('translates resumable Multer limits without exposing File too large', () => {
    const message = uploadLimitMessage('/api/admin/uploads/resumable/upload1/parts');
    expect(message).toContain('fragmento supera el limite permitido');
    expect(message).not.toContain('File too large');
  });

  it('uses a generic message for non-resumable uploads', () => {
    expect(uploadLimitMessage('/api/admin/uploads/video')).toContain('archivo supera el limite');
  });
});
