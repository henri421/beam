import { describe, expect, it } from 'vitest';
import { MatriceSinguliere, resoudre } from '../src/index';

describe('resolution lineaire', () => {
  it('systeme 3 x 3 resolu a la main : x = (1, 2, 3)', () => {
    // 2x + y = 4 ; x + 3y + z = 10 ; y + 4z = 14
    const u = resoudre([[2, 1, 0], [1, 3, 1], [0, 1, 4]], [4, 10, 14]);
    [1, 2, 3].forEach((v, i) => expect(u[i]).toBeCloseTo(v, 12));
  });

  it('pivot partiel : un zero en tete de diagonale ne bloque pas', () => {
    const u = resoudre([[0, 1], [1, 0]], [5, 7]);
    expect(u[0]).toBeCloseTo(7, 12);
    expect(u[1]).toBeCloseTo(5, 12);
  });

  it('matrice singuliere : levee typee', () => {
    expect(() => resoudre([[1, 1], [1, 1]], [1, 2])).toThrow(MatriceSinguliere);
  });
});
