import { describe, expect, it } from 'vitest';
import { seasonUpdateValidationMessage, uploadLimitMessage } from './http-exception.filter';

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

describe('season update validation errors', () => {
  it('traduce campos no permitidos sin relajar la validacion', () => {
    expect(seasonUpdateValidationMessage('/api/admin/seasons/season-1', ['property seriesId should not exist']))
      .toBe('No se pudo actualizar la temporada porque se enviaron datos no permitidos.');
  });

  it('conserva otros errores y otras rutas', () => {
    expect(seasonUpdateValidationMessage('/api/admin/seasons/season-1', ['title must be longer than or equal to 2 characters']))
      .toEqual(['title must be longer than or equal to 2 characters']);
    expect(seasonUpdateValidationMessage('/api/admin/episodes/episode-1', ['property seriesId should not exist']))
      .toEqual(['property seriesId should not exist']);
  });
});
