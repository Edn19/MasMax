import { describe, expect, it } from 'vitest';
import { progressValues } from './history.service';

describe('progressValues', () => {
  it('completa al alcanzar el umbral configurable', () => {
    expect(progressValues(900, 1000, 90).completed).toBe(true);
    expect(progressValues(899, 1000, 90).completed).toBe(false);
  });

  it('conserva un contenido completado al volver a una posicion anterior', () => {
    const completedAt = new Date('2026-01-01T00:00:00Z');
    const result = progressValues(100, 1000, 90, completedAt);
    expect(result.completed).toBe(true);
    expect(result.completedAt).toBe(completedAt);
  });

  it('limita posiciones fuera de rango', () => {
    expect(progressValues(1200, 1000, 90).position).toBe(1000);
    expect(progressValues(-10, 1000, 90).position).toBe(0);
  });
});
