import { describe, expect, it } from 'vitest';
import { validatePlaybackMarkers } from './playback-markers';

describe('playback markers', () => {
  it('acepta intervalos completos dentro de la duracion', () => {
    expect(() => validatePlaybackMarkers({ introStartSec: 10, introEndSec: 80, recapStartSec: 80, recapEndSec: 130 }, 1800)).not.toThrow();
    expect(() => validatePlaybackMarkers({}, 1800)).not.toThrow();
  });

  it('rechaza pares incompletos, invertidos o fuera de duracion', () => {
    expect(() => validatePlaybackMarkers({ introStartSec: 10 })).toThrow('inicio y fin');
    expect(() => validatePlaybackMarkers({ introStartSec: 80, introEndSec: 20 })).toThrow('posterior');
    expect(() => validatePlaybackMarkers({ recapStartSec: 90, recapEndSec: 200 }, 120)).toThrow('supera');
  });

  it('rechaza un resumen que se superpone con la introduccion', () => {
    expect(() => validatePlaybackMarkers({ introStartSec: 0, introEndSec: 90, recapStartSec: 80, recapEndSec: 120 })).toThrow('resumen no puede comenzar');
  });
});
