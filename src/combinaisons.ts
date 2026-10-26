/**
 * Cas de charge, combinaisons et enveloppes (EN 1990:2002, §6.4.3.2 et §6.5.3,
 * annexe A1 ; EN 1992-1-1:2004, §5.1.3 et §5.5).
 *
 * Le calcul est lineaire : on calcule une fois chaque cas elementaire, puis on
 * superpose.
 * - G : toutes les charges permanentes, avec le meme coefficient partout
 *   (une seule source, tableau A1.2(B) note 3) ;
 * - Q_j : les charges variables limitees a la zone j (travee ou console),
 *   une charge Q qui couvre plusieurs zones etant coupee aux appuis ;
 * - T : les tassements d'appui, pris ou non (le pire des deux).
 *
 * ENVELOPPE EXACTE. En un point x et pour une variante de coefficients,
 *   E_max(x) = g G(x) + t T(x) + somme_j max(0, q Q_j(x))
 * est la pire des 2^n dispositions de Q, sans les enumerer : chaque zone est
 * chargee la ou elle aggrave l'effet. Cela couvre les deux dispositions
 * simplifiees du §5.1.3 (travees alternees, deux travees adjacentes) et les
 * depasse. On garde, pour chaque extremum, la variante et les zones chargees
 * qui le produisent.
 */

import {
  assemblerResultat,
  abscissesDesNoeuds,
  calculerPoutre,
  decouperEnTravees,
  deplacement,
  effortTranchant,
  momentFlechissant,
  type ResultatPoutre,
  type Troncon,
} from './calcul';
import { MM_PAR_M, TOLERANCE_X, type Appui, type Charge, type Poutre } from './modele';
import { verifierProfil, type ProfilPoutre } from './norms/profil';
import { nombreAffiche } from './nombres';

export type Formule = '6.10' | '6.10ab';

export interface DonneesCombinaisons {
  /** ELU fondamental : expression (6.10), ou la plus defavorable de (6.10a) et (6.10b). */
  formule: Formule;
  /** Coefficients psi de l'action variable (tableau A1.1, selon la categorie d'usage). */
  psi0: number;
  psi1: number;
  psi2: number;
  /**
   * Coefficient applique aux effets des tassements a l'ELU. SAISI : sa
   * valeur depend du mode d'analyse (EN 1990 A1.2, EN 1992-1-1 §2.3.1.3).
   */
  gamma_T: number;
  /** Coefficient de redistribution delta par appui (ordre des appuis), 1 = aucune ; ELU seulement. */
  redistribution: number[];
}

/** Coefficients d'une variante : G et T fixes, Q applique a chaque zone chargee. */
export interface Variante {
  nom: string;
  G: number;
  T: number;
  Q: number;
}

export interface Combinaison {
  nom: string;
  etat: 'ELU' | 'ELS';
  variantes: Variante[];
}

/** Zone de chargement de Q : travee ou console. */
export interface Zone {
  nom: string;
  x0: number;
  x1: number;
}

export interface CasCalcules {
  poutre: Poutre;
  zones: Zone[];
  G: ResultatPoutre;
  /** Tassements seuls ; null sans tassement. */
  T: ResultatPoutre | null;
  /** Q limite a chaque zone, dans l'ordre des zones ; null si la zone ne porte aucune charge Q. */
  Q: (ResultatPoutre | null)[];
}

/** Valeur d'enveloppe et ce qui la produit. */
export interface Determinant {
  x: number;
  valeur: number;
  /** Indice de la variante dans la combinaison. */
  variante: number;
  /** Zones chargees par Q (indices). */
  zones: number[];
}

export interface PointEnveloppe {
  x: number;
  M: [number, number];
  V: [number, number];
  w: [number, number];
}

export interface TraveeEnveloppe {
  nom: string;
  x0: number;
  x1: number;
  M_max: Determinant;
  M_min: Determinant;
  V_max: Determinant;
  V_min: Determinant;
  /** Fleche de plus grande valeur absolue (mm). */
  w_max: Determinant;
}

export interface AppuiEnveloppe {
  appui: Appui;
  R_max: Determinant;
  R_min: Determinant;
  /** Moment sur appui, maximum et minimum (kN.m). */
  M_max: Determinant;
  M_min: Determinant;
}

export interface Enveloppe {
  combinaison: Combinaison;
  /** Points de trace par troncon, extremums inclus : [min, max] de chaque grandeur. */
  courbes: PointEnveloppe[][];
  travees: TraveeEnveloppe[];
  appuis: AppuiEnveloppe[];
}

export interface ResultatCombinaisons {
  cas: CasCalcules;
  /** Cas utilises a l'ELU, apres redistribution eventuelle. */
  casELU: CasCalcules;
  elu: Enveloppe;
  caracteristique: Enveloppe;
  frequente: Enveloppe;
  quasiPermanente: Enveloppe;
  avertissements: string[];
}

// --- Cas elementaires ---------------------------------------------------------

function casDe(c: Charge): 'G' | 'Q' {
  return c.cas ?? 'G';
}

/** Morceau d'une charge dans [x0, x1], ou null si elle n'y agit pas. */
function morceau(c: Charge, z: Zone, derniere: boolean): Charge | null {
  if (c.type === 'ponctuelle' || c.type === 'moment') {
    // Une charge sur un appui va a la zone de droite, sauf en bout de poutre.
    const dedans = c.x >= z.x0 - TOLERANCE_X && (c.x < z.x1 - TOLERANCE_X || (derniere && c.x <= z.x1 + TOLERANCE_X));
    return dedans ? c : null;
  }
  const a = Math.max(c.a, z.x0);
  const b = Math.min(c.b, z.x1);
  if (b - a < TOLERANCE_X) return null;
  if (c.type === 'repartie') return { ...c, a, b };
  const q = (x: number): number => c.q_a + ((c.q_b - c.q_a) * (x - c.a)) / (c.b - c.a);
  return { ...c, a, b, q_a: q(a), q_b: q(b) };
}

function sansTassement(a: Appui): Appui {
  return 'tassement' in a ? { ...a, tassement: 0 } : a;
}

/** Zones de chargement : travees et consoles, comme `decouperEnTravees`. */
export function zonesDeChargement(p: Poutre): Zone[] {
  return decouperEnTravees(p).map(([nom, x0, x1]) => ({ nom, x0, x1 }));
}

/**
 * Calcule les cas elementaires sur un maillage commun : leurs troncons se
 * superposent indice par indice.
 */
export function calculerCas(poutre: Poutre): CasCalcules {
  const noeuds = abscissesDesNoeuds(poutre);
  const zones = zonesDeChargement(poutre);
  const appuisSansT = poutre.appuis.map(sansTassement);
  const G = calculerPoutre({ ...poutre, appuis: appuisSansT, charges: poutre.charges.filter((c) => casDe(c) === 'G') }, { noeuds });
  const aDesTassements = poutre.appuis.some((a) => 'tassement' in a && a.tassement !== 0);
  const T = aDesTassements ? calculerPoutre({ ...poutre, charges: [] }, { noeuds }) : null;
  const variables = poutre.charges.filter((c) => casDe(c) === 'Q');
  const Q = zones.map((z, j) => {
    const charges = variables.map((c) => morceau(c, z, j === zones.length - 1)).filter((c): c is Charge => c !== null);
    return charges.length === 0 ? null : calculerPoutre({ ...poutre, appuis: appuisSansT, charges }, { noeuds });
  });
  return { poutre, zones, G, T, Q };
}

// --- Combinaison lineaire de resultats -------------------------------------------

function combinerTroncons(termes: [number, Troncon[]][]): Troncon[] {
  const ref = termes[0][1];
  return ref.map((t, e) => {
    const somme = { ...t, f0: 0, f1: 0, c0: 0, c1: 0, v0: 0, t0: 0 };
    for (const [k, tr] of termes) {
      somme.f0 += k * tr[e].f0;
      somme.f1 += k * tr[e].f1;
      somme.c0 += k * tr[e].c0;
      somme.c1 += k * tr[e].c1;
      somme.v0 += k * tr[e].v0;
      somme.t0 += k * tr[e].t0;
    }
    return somme;
  });
}

/** Somme ponderee de resultats calcules sur le meme maillage. */
export function combinerResultats(poutre: Poutre, termes: [number, ResultatPoutre][]): ResultatPoutre {
  const troncons = combinerTroncons(termes.map(([k, r]) => [k, r.troncons]));
  const brutes = poutre.appuis.map((_, i) => {
    const b = { R: 0, M_reaction: 0, w: 0, rotation: 0 };
    for (const [k, r] of termes) {
      b.R += k * r.reactions[i].R;
      b.M_reaction += k * r.reactions[i].M_reaction;
      b.w += k * r.reactions[i].w;
      b.rotation += k * r.reactions[i].rotation;
    }
    return b;
  });
  const charges = termes.reduce((s, [k, r]) => s + k * r.equilibre.charges, 0);
  return assemblerResultat(poutre, termes[0][1].degreHyperstatique, troncons, brutes, charges);
}

/** Resultat d'une disposition : une variante et les zones chargees par Q. */
export function resultatDeDisposition(cas: CasCalcules, v: Variante, zones: number[]): ResultatPoutre {
  const termes: [number, ResultatPoutre][] = [[v.G, cas.G]];
  if (cas.T !== null && v.T !== 0) termes.push([v.T, cas.T]);
  for (const j of zones) {
    const q = cas.Q[j];
    if (q !== null) termes.push([v.Q, q]);
  }
  return combinerResultats(cas.poutre, termes);
}

// --- Redistribution (EN 1992-1-1 §5.5) ---------------------------------------------

/**
 * Redistribution des moments sur appui, appliquee a CHAQUE cas elementaire.
 *
 * Le moment sur l'appui i est multiplie par delta_i ; la difference
 * (delta_i - 1) M_i est repartie lineairement sur les deux travees voisines
 * (nulle sur les appuis adjacents), ce qui retablit l'equilibre de chaque
 * travee, et les reactions s'en deduisent. L'operation est lineaire en
 * charges : l'appliquer cas par cas revient a l'appliquer a chaque
 * disposition, avant enveloppe — c'est la methode exacte, pas une
 * redistribution de l'enveloppe. La fleche n'est pas corrigee : elle ne
 * sert qu'a l'ELS, ou l'on ne redistribue pas.
 */
export function redistribuer(r: ResultatPoutre, deltas: number[], zones: Zone[]): ResultatPoutre {
  let troncons = r.troncons.map((t) => ({ ...t }));
  const brutes = r.reactions.map((re) => ({ R: re.R, M_reaction: re.M_reaction, w: re.w, rotation: re.rotation }));
  const xs = r.poutre.appuis.map((a) => a.x);
  deltas.forEach((delta, i) => {
    if (delta === 1) return;
    const x = xs[i];
    const gauche = zones.find((z) => Math.abs(z.x1 - x) < TOLERANCE_X);
    const droite = zones.find((z) => Math.abs(z.x0 - x) < TOLERANCE_X);
    if (gauche === undefined || droite === undefined) return;
    const re = r.reactions[i];
    const M = re.M_gauche ?? re.M_droite ?? 0;
    const dM = (delta - 1) * M;
    const lg = gauche.x1 - gauche.x0;
    const ld = droite.x1 - droite.x0;
    troncons = troncons.map((t) => {
      if (t.x0 >= gauche.x0 - TOLERANCE_X && t.x1 <= gauche.x1 + TOLERANCE_X) {
        const B = dM / lg;
        const A = (dM * (t.x0 - gauche.x0)) / lg;
        return { ...t, f1: t.f1 - A, f0: t.f0 + B };
      }
      if (t.x0 >= droite.x0 - TOLERANCE_X && t.x1 <= droite.x1 + TOLERANCE_X) {
        const B = -dM / ld;
        const A = (dM * (droite.x1 - t.x0)) / ld;
        return { ...t, f1: t.f1 - A, f0: t.f0 + B };
      }
      return t;
    });
    const k = (xa: number): number => xs.findIndex((y) => Math.abs(y - xa) < TOLERANCE_X);
    brutes[k(gauche.x0)].R += dM / lg;
    brutes[i].R += -dM / ld - dM / lg;
    brutes[k(droite.x1)].R += dM / ld;
  });
  return assemblerResultat(r.poutre, r.degreHyperstatique, troncons, brutes, r.equilibre.charges);
}

/**
 * Controle des coefficients de redistribution independant de la section :
 * delta <= 1, delta >= k5 (aciers B ou C) ou k6 (aciers A), appui
 * intermediaire entre deux travees, rapport des portees voisines entre 0,5
 * et 2 (§5.5(4)). La condition sur x_u/d se controle avec la section.
 */
export function verifierRedistribution(p: Poutre, deltas: number[], profil: ProfilPoutre, classeAcier: 'A' | 'B' | 'C'): void {
  const zones = zonesDeChargement(p);
  const minimum = classeAcier === 'A' ? profil.k6.valeur : profil.k5.valeur;
  if (deltas.length !== p.appuis.length) throw new Error('Un coefficient de redistribution par appui est attendu.');
  deltas.forEach((delta, i) => {
    if (delta === 1) return;
    const n = i + 1;
    if (!Number.isFinite(delta) || delta > 1) throw new Error(`Appui ${n} : le coefficient de redistribution delta doit être au plus 1.`);
    if (delta < minimum) {
      throw new Error(`Appui ${n} : delta = ${nombreAffiche(delta)} est inférieur au minimum ${nombreAffiche(minimum)} des aciers de classe ${classeAcier} (§5.5(4)).`);
    }
    const x = p.appuis[i].x;
    const g = zones.find((z) => Math.abs(z.x1 - x) < TOLERANCE_X && z.nom.startsWith('travée'));
    const d = zones.find((z) => Math.abs(z.x0 - x) < TOLERANCE_X && z.nom.startsWith('travée'));
    if (g === undefined || d === undefined) {
      throw new Error(`Appui ${n} : la redistribution est réservée aux appuis intermédiaires entre deux travées.`);
    }
    const rapport = (g.x1 - g.x0) / (d.x1 - d.x0);
    if (rapport < 0.5 || rapport > 2) {
      throw new Error(
        `Appui ${n} : rapport des portées voisines ${nombreAffiche(rapport, 2)} hors de [0,5 ; 2] ; le §5.5(4) n'autorise pas la redistribution sans vérification de la capacité de rotation.`
      );
    }
  });
}

// --- Combinaisons --------------------------------------------------------------------

function variantesAvecT(base: Omit<Variante, 'T'>[], gammaT: number, avecT: boolean): Variante[] {
  const ts = avecT ? [0, gammaT] : [0];
  return base.flatMap((v) => ts.map((t) => ({ ...v, nom: avecT ? `${v.nom}${t === 0 ? ', sans tassement' : ', avec tassement'}` : v.nom, T: t })));
}

/** Combinaisons ELU fondamentale et ELS caracteristique, frequente, quasi permanente. */
export function combinaisons(profil: ProfilPoutre, d: DonneesCombinaisons, avecT: boolean): {
  elu: Combinaison;
  caracteristique: Combinaison;
  frequente: Combinaison;
  quasiPermanente: Combinaison;
} {
  const gs = profil.gamma_G_sup.valeur;
  const gi = profil.gamma_G_inf.valeur;
  const gq = profil.gamma_Q.valeur;
  const xi = profil.xi.valeur;
  const eluBase =
    d.formule === '6.10'
      ? [
          { nom: `(6.10) ${gs} G + ${gq} Q`, G: gs, Q: gq },
          { nom: `(6.10) ${gi} G + ${gq} Q`, G: gi, Q: gq },
        ]
      : [
          { nom: `(6.10a) ${gs} G + ${gq}x${d.psi0} Q`, G: gs, Q: gq * d.psi0 },
          { nom: `(6.10a) ${gi} G + ${gq}x${d.psi0} Q`, G: gi, Q: gq * d.psi0 },
          { nom: `(6.10b) ${xi}x${gs} G + ${gq} Q`, G: xi * gs, Q: gq },
          { nom: `(6.10b) ${gi} G + ${gq} Q`, G: gi, Q: gq },
        ];
  const els = (nom: string, psi: number): Combinaison => ({
    nom,
    etat: 'ELS',
    variantes: variantesAvecT([{ nom: `G + ${psi === 1 ? '' : `${psi} `}Q`, G: 1, Q: psi }], 1, avecT),
  });
  return {
    elu: { nom: `ELU fondamental ${d.formule === '6.10' ? '(6.10)' : '(6.10a) et (6.10b)'}`, etat: 'ELU', variantes: variantesAvecT(eluBase, d.gamma_T, avecT) },
    caracteristique: els('ELS caractéristique', 1),
    frequente: els('ELS fréquent', d.psi1),
    quasiPermanente: els('ELS quasi permanent', d.psi2),
  };
}

// --- Enveloppes ------------------------------------------------------------------------

type Grandeur = 'M' | 'V' | 'w';

function valeurCas(t: Troncon, s: number, g: Grandeur): number {
  if (g === 'M') return momentFlechissant(t, s);
  if (g === 'V') return effortTranchant(t, s);
  return -deplacement(t, s) * MM_PAR_M;
}

/** Extremum en un point : sens +1 pour le maximum, -1 pour le minimum. */
function extremumEn(cas: CasCalcules, comb: Combinaison, e: number, s: number, g: Grandeur, sens: 1 | -1): Determinant {
  const vg = valeurCas(cas.G.troncons[e], s, g);
  const vt = cas.T === null ? 0 : valeurCas(cas.T.troncons[e], s, g);
  const vq = cas.Q.map((r) => (r === null ? 0 : valeurCas(r.troncons[e], s, g)));
  let meilleur: Determinant | null = null;
  comb.variantes.forEach((v, k) => {
    let valeur = v.G * vg + v.T * vt;
    const zones: number[] = [];
    vq.forEach((q, j) => {
      if (sens * v.Q * q > 0) {
        valeur += v.Q * q;
        zones.push(j);
      }
    });
    if (meilleur === null || sens * valeur > sens * meilleur.valeur) meilleur = { x: cas.G.troncons[e].x0 + s, valeur, variante: k, zones };
  });
  return meilleur as unknown as Determinant;
}

const POINTS_ENVELOPPE = 32;

function pointEn(cas: CasCalcules, comb: Combinaison, e: number, s: number): PointEnveloppe {
  const x = cas.G.troncons[e].x0 + s;
  const paire = (g: Grandeur): [number, number] => [extremumEn(cas, comb, e, s, g, -1).valeur, extremumEn(cas, comb, e, s, g, 1).valeur];
  return { x, M: paire('M'), V: paire('V'), w: paire('w') };
}

/** Recherche ternaire d'un extremum local de l'enveloppe dans [a, b]. */
function affiner(f: (s: number) => number, a: number, b: number): number {
  let g = a;
  let d = b;
  for (let i = 0; i < 60; i++) {
    const m1 = g + (d - g) / 3;
    const m2 = d - (d - g) / 3;
    if (f(m1) < f(m2)) g = m1;
    else d = m2;
  }
  return (g + d) / 2;
}

function courbesDeLEnveloppe(cas: CasCalcules, comb: Combinaison): PointEnveloppe[][] {
  return cas.G.troncons.map((t, e) => {
    const L = t.x1 - t.x0;
    const ss = Array.from({ length: POINTS_ENVELOPPE + 1 }, (_, i) => (L * i) / POINTS_ENVELOPPE);
    const ajouts = new Set<number>();
    for (const g of ['M', 'w'] as Grandeur[]) {
      for (const sens of [1, -1] as const) {
        const f = (s: number): number => sens * extremumEn(cas, comb, e, s, g, sens).valeur;
        const vals = ss.map(f);
        for (let i = 1; i < ss.length - 1; i++) {
          if (vals[i] >= vals[i - 1] && vals[i] >= vals[i + 1] && (vals[i] > vals[i - 1] || vals[i] > vals[i + 1])) {
            ajouts.add(affiner(f, ss[i - 1], ss[i + 1]));
          }
        }
      }
    }
    return [...ss, ...ajouts].sort((a, b) => a - b).map((s) => pointEn(cas, comb, e, s));
  });
}

function meilleurSur(
  cas: CasCalcules,
  comb: Combinaison,
  courbes: PointEnveloppe[][],
  indices: number[],
  g: Grandeur,
  sens: 1 | -1 | 0
): Determinant {
  let meilleur: Determinant | null = null;
  for (const e of indices) {
    const t = cas.G.troncons[e];
    for (const p of courbes[e]) {
      const s = p.x - t.x0;
      const candidats =
        sens === 0
          ? [extremumEn(cas, comb, e, s, g, 1), extremumEn(cas, comb, e, s, g, -1)]
          : [extremumEn(cas, comb, e, s, g, sens)];
      for (const c of candidats) {
        const cle = sens === 0 ? Math.abs(c.valeur) : sens * c.valeur;
        const ref = meilleur === null ? -Infinity : sens === 0 ? Math.abs(meilleur.valeur) : sens * meilleur.valeur;
        if (cle > ref) meilleur = c;
      }
    }
  }
  return meilleur as unknown as Determinant;
}

/** Reaction ou moment sur appui extremal sur toutes les variantes et dispositions. */
function extremumAppui(cas: CasCalcules, comb: Combinaison, i: number, lire: (r: ResultatPoutre) => number, sens: 1 | -1): Determinant {
  const vg = lire(cas.G);
  const vt = cas.T === null ? 0 : lire(cas.T);
  const vq = cas.Q.map((r) => (r === null ? 0 : lire(r)));
  let meilleur: Determinant | null = null;
  comb.variantes.forEach((v, k) => {
    let valeur = v.G * vg + v.T * vt;
    const zones: number[] = [];
    vq.forEach((q, j) => {
      if (sens * v.Q * q > 0) {
        valeur += v.Q * q;
        zones.push(j);
      }
    });
    if (meilleur === null || sens * valeur > sens * meilleur.valeur) meilleur = { x: cas.poutre.appuis[i].x, valeur, variante: k, zones };
  });
  return meilleur as unknown as Determinant;
}

export function enveloppe(cas: CasCalcules, comb: Combinaison): Enveloppe {
  const courbes = courbesDeLEnveloppe(cas, comb);
  const troncons = cas.G.troncons;
  const travees = cas.zones.map((z) => {
    const indices = troncons.map((_, e) => e).filter((e) => troncons[e].x0 >= z.x0 - TOLERANCE_X && troncons[e].x1 <= z.x1 + TOLERANCE_X);
    return {
      nom: z.nom,
      x0: z.x0,
      x1: z.x1,
      M_max: meilleurSur(cas, comb, courbes, indices, 'M', 1),
      M_min: meilleurSur(cas, comb, courbes, indices, 'M', -1),
      V_max: meilleurSur(cas, comb, courbes, indices, 'V', 1),
      V_min: meilleurSur(cas, comb, courbes, indices, 'V', -1),
      w_max: meilleurSur(cas, comb, courbes, indices, 'w', 0),
    };
  });
  const momentSurAppui = (i: number) => (r: ResultatPoutre): number => r.reactions[i].M_gauche ?? r.reactions[i].M_droite ?? 0;
  const appuis = cas.poutre.appuis.map((appui, i) => ({
    appui,
    R_max: extremumAppui(cas, comb, i, (r) => r.reactions[i].R, 1),
    R_min: extremumAppui(cas, comb, i, (r) => r.reactions[i].R, -1),
    M_max: extremumAppui(cas, comb, i, momentSurAppui(i), 1),
    M_min: extremumAppui(cas, comb, i, momentSurAppui(i), -1),
  }));
  return { combinaison: comb, courbes, travees, appuis };
}

/**
 * Tous les cas, combinaisons et enveloppes d'une poutre. La redistribution
 * ne touche que l'ELU.
 */
export function calculerCombinaisons(
  poutre: Poutre,
  d: DonneesCombinaisons,
  profil: ProfilPoutre,
  classeAcier: 'A' | 'B' | 'C' = 'B'
): ResultatCombinaisons {
  verifierProfil(profil);
  for (const [nom, v] of [['psi0', d.psi0], ['psi1', d.psi1], ['psi2', d.psi2]] as const) {
    if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error(`Le coefficient ${nom} doit être compris entre 0 et 1.`);
  }
  if (!Number.isFinite(d.gamma_T) || d.gamma_T < 0) throw new Error('Le coefficient des tassements gamma_T doit être un nombre positif ou nul.');
  const cas = calculerCas(poutre);
  verifierRedistribution(poutre, d.redistribution, profil, classeAcier);
  const avecRedistribution = d.redistribution.some((delta) => delta !== 1);
  const red = (r: ResultatPoutre | null): ResultatPoutre | null => (r === null ? null : redistribuer(r, d.redistribution, cas.zones));
  const casELU: CasCalcules = avecRedistribution
    ? { ...cas, G: red(cas.G) as ResultatPoutre, T: red(cas.T), Q: cas.Q.map(red) }
    : cas;
  const combs = combinaisons(profil, d, cas.T !== null);
  const avertissements: string[] = [];
  if (cas.Q.every((q) => q === null)) avertissements.push('Aucune charge variable Q : les enveloppes se reduisent aux charges permanentes.');
  if (avecRedistribution) avertissements.push("Moments redistribués à l'ELU (§5.5) : la condition sur x_u/d se vérifie avec la section.");
  return {
    cas,
    casELU,
    elu: enveloppe(casELU, combs.elu),
    caracteristique: enveloppe(cas, combs.caracteristique),
    frequente: enveloppe(cas, combs.frequente),
    quasiPermanente: enveloppe(cas, combs.quasiPermanente),
    avertissements,
  };
}

/** Libelle d'une disposition : variante et zones chargees. */
export function libelleDisposition(env: Enveloppe, zones: Zone[], d: Determinant): string {
  const v = env.combinaison.variantes[d.variante];
  const q = d.zones.length === 0 ? 'sans Q' : `Q sur ${d.zones.map((j) => zones[j].nom).join(', ')}`;
  return `${v.nom} ; ${q}`;
}

/**
 * Valeur d'enveloppe en une abscisse quelconque. `cote` choisit le troncon
 * de part et d'autre d'un noeud (effort tranchant discontinu sur un appui).
 */
export function enveloppeEn(
  cas: CasCalcules,
  comb: Combinaison,
  x: number,
  g: 'M' | 'V' | 'w',
  sens: 1 | -1,
  cote: 'gauche' | 'droite' = 'droite'
): Determinant {
  const tr = cas.G.troncons;
  let e = tr.findIndex((t) => (cote === 'droite' ? x >= t.x0 - TOLERANCE_X && x < t.x1 - TOLERANCE_X : x > t.x0 + TOLERANCE_X && x <= t.x1 + TOLERANCE_X));
  if (e === -1) e = cote === 'droite' ? tr.length - 1 : 0;
  const s = Math.min(Math.max(x - tr[e].x0, 0), tr[e].x1 - tr[e].x0);
  return extremumEn(cas, comb, e, s, g, sens);
}
