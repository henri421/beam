/**
 * Resolution d'un systeme lineaire dense K u = F.
 *
 * Elimination de Gauss avec pivot partiel : les systemes d'une poutre
 * continue comptent quelques dizaines d'inconnues, une methode directe sans
 * stockage creux suffit. Un pivot negligeable devant le plus grand
 * coefficient signale une matrice singuliere, c'est-a-dire un mecanisme.
 */

/** Seuil relatif de pivot sous lequel la matrice est declaree singuliere. */
export const SEUIL_PIVOT = 1e-10;

export class MatriceSinguliere extends Error {
  constructor() {
    super('matrice de rigidite singuliere');
    this.name = 'MatriceSinguliere';
  }
}

/** Resout K u = F ; K et F ne sont pas modifies. */
export function resoudre(K: number[][], F: number[]): number[] {
  const n = F.length;
  const A = K.map((ligne) => ligne.slice());
  const b = F.slice();
  let echelle = 0;
  for (const ligne of A) for (const a of ligne) echelle = Math.max(echelle, Math.abs(a));
  if (n > 0 && echelle === 0) throw new MatriceSinguliere();

  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > Math.abs(A[p][k])) p = i;
    if (Math.abs(A[p][k]) <= SEUIL_PIVOT * echelle) throw new MatriceSinguliere();
    if (p !== k) {
      [A[p], A[k]] = [A[k], A[p]];
      [b[p], b[k]] = [b[k], b[p]];
    }
    for (let i = k + 1; i < n; i++) {
      const f = A[i][k] / A[k][k];
      if (f === 0) continue;
      for (let j = k; j < n; j++) A[i][j] -= f * A[k][j];
      b[i] -= f * b[k];
    }
  }
  const u = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * u[j];
    u[i] = s / A[i][i];
  }
  return u;
}
