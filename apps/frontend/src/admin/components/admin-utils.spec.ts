import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fieldLabel, formatBytes, statusLabel, validatePlaybackMarkers, videoTypeForSource } from './admin-utils';

describe('utilidades administrativas', () => {
  it('presenta tamanos de almacenamiento de forma legible', () => {
    assert.equal(formatBytes('0'), '0 B');
    assert.equal(formatBytes('1536'), '1.5 KB');
    assert.equal(formatBytes('valor-desconocido'), 'valor-desconocido');
  });

  it('deriva el tipo de video a partir de su fuente', () => {
    assert.equal(videoTypeForSource('LOCAL'), 'MP4');
    assert.equal(videoTypeForSource('URL'), 'MP4');
    assert.equal(videoTypeForSource('HLS'), 'HLS');
    assert.equal(videoTypeForSource('DRIVE'), 'DRIVE');
    assert.equal(videoTypeForSource('EMBED'), 'EMBED');
  });

  it('traduce estados y encabezados sin modificar valores internos', () => {
    assert.equal(statusLabel('AIRING'), 'En emision');
    assert.equal(statusLabel('PUBLISHED'), 'Publicada');
    assert.equal(statusLabel('ADMIN'), 'Administrador');
    assert.equal(fieldLabel('releaseYear'), 'Ano');
  });

  it('valida pares y limites de marcadores de reproduccion', () => {
    assert.deepEqual(validatePlaybackMarkers({ durationSec: '100', introStartSec: '20', introEndSec: '10', recapStartSec: '', recapEndSec: '' }), { introEndSec: 'El fin de introduccion debe ser mayor que el inicio.' });
    assert.deepEqual(validatePlaybackMarkers({ durationSec: '100', introStartSec: '10', introEndSec: '120', recapStartSec: '80', recapEndSec: '' }), { introEndSec: 'El fin de introduccion no puede superar la duracion.', recapEndSec: 'Completa el inicio y el fin de resumen.' });
    assert.deepEqual(validatePlaybackMarkers({ durationSec: '100', introStartSec: '10', introEndSec: '20', recapStartSec: '80', recapEndSec: '90' }), {});
  });
});
