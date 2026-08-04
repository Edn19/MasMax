import { describe, expect, it } from 'vitest';
import { findMissingEpisodeNumbers } from './episodes.service';

describe('findMissingEpisodeNumbers', () => {
  it('detecta huecos sin repetir numeros', () => {
    expect(findMissingEpisodeNumbers([1, 2, 4, 4, 7])).toEqual({ max: 7, missing: [3, 5, 6] });
  });

  it('ignora numeros invalidos y admite temporadas vacias', () => {
    expect(findMissingEpisodeNumbers([0, -1, 1.5])).toEqual({ max: 0, missing: [] });
    expect(findMissingEpisodeNumbers([])).toEqual({ max: 0, missing: [] });
  });
});
