/**
 * Calcul elastique lineaire d'une poutre droite continue ou hyperstatique.
 *
 * Methode des deplacements : la poutre est decoupee en troncons aux appuis,
 * rotules, points d'application et bornes des charges ; chaque troncon est un
 * element de poutre d'Euler-Bernoulli a deux noeuds (deplacement vertical et
 * rotation), charge par des forces nodales equivalentes coherentes. Le
 * resultat est EXACT pour cette theorie : entre deux noeuds, la charge est au
 * plus lineaire, et les efforts et la deformee s'obtiennent par integration
 * analytique de l'equilibre local a partir des efforts d'extremite. Aucune
 * discretisation n'entre dans les valeurs rendues.
 *
 * Hypotheses : petits deplacements, materiau elastique lineaire, rigidite EI
 * constante, deformation d'effort tranchant negligee (Bernoulli), pas d'effort
 * normal. Unites et signes : voir `modele.ts`.
 *
 * Signes des resultats :
 * - moment flechissant M positif quand la fibre inferieure est tendue ;
 * - effort tranchant V = dM/dx (positif a gauche d'une travee simplement
 *   appuyee chargee vers le bas) ;
 * - fleche w positive vers le bas (mm) ; rotation positive trigonometrique ;
 * - reaction verticale R positive vers le haut ; moment de reaction positif
 *   dans le sens trigonometrique.
 */

import { MatriceSinguliere, resoudre } from './algebre';
import {
  MM_PAR_M,
  TOLERANCE_X,
  degreHyperstatique,
  verifierDonnees,
  type Appui,
  type Poutre,
} from './modele';

/** Troncon entre deux noeuds consecutifs, avec ses efforts d'extremite gauche. */
export interface Troncon {
  x0: number;
  x1: number;
  EI: number;
  /** Force verticale exercee par le noeud gauche sur le troncon (kN, vers le haut). */
  f0: number;
  /** Couple exerce par le noeud gauche sur le troncon (kN.m, trigonometrique). */
  f1: number;
  /** Charge repartie q(s) = c0 + c1 s, s abscisse locale (kN/m, vers le bas). */
  c0: number;
  c1: number;
  /** Deplacement (m, vers le haut) et rotation (rad) a l'extremite gauche. */
  v0: number;
  t0: number;
}

/** Valeurs en un point de la poutre. */
export interface Point {
  x: number;
  /** Effort tranchant (kN). */
  V: number;
  /** Moment flechissant (kN.m), positif fibre inferieure tendue. */
  M: number;
  /** Fleche (mm), positive vers le bas. */
  w: number;
}

export interface Extremum {
  x: number;
  valeur: number;
}

export interface Reaction {
  appui: Appui;
  /** Reaction verticale (kN), positive vers le haut ; 0 si l'appui ne la retient pas. */
  R: number;
  /** Moment de reaction (kN.m), trigonometrique ; 0 si l'appui ne retient pas la rotation. */
  M_reaction: number;
  /** Moment flechissant juste a gauche et juste a droite de l'appui (kN.m) ; null en extremite. */
  M_gauche: number | null;
  M_droite: number | null;
  /** Effort tranchant juste a gauche et juste a droite de l'appui (kN) ; null en extremite. */
  V_gauche: number | null;
  V_droite: number | null;
  /** Deplacement vertical de l'appui (mm, vers le bas) : tassement impose ou enfoncement du ressort. */
  w: number;
  /** Rotation de la poutre sur l'appui (mrad, trigonometrique). */
  rotation: number;
}

export interface Travee {
  nom: string;
  x0: number;
  x1: number;
  M_max: Extremum;
  M_min: Extremum;
  /** Effort tranchant de plus grande valeur absolue (signe conserve). */
  V_max: Extremum;
  /** Fleche de plus grande valeur absolue (mm, signe conserve). */
  w_max: Extremum;
}

export interface ResultatPoutre {
  poutre: Poutre;
  degreHyperstatique: number;
  troncons: Troncon[];
  /** Points de trace, une liste par troncon, extremites et extremums compris. */
  courbes: Point[][];
  /** Reactions, dans l'ordre des appuis saisis. */
  reactions: Reaction[];
  travees: Travee[];
  extremes: { M_max: Extremum; M_min: Extremum; V_max: Extremum; w_max: Extremum };
  /** Controle d'equilibre vertical : somme des charges (vers le bas) et des reactions (vers le haut), kN. */
  equilibre: { charges: number; reactions: number };
}

// --- Evaluation exacte sur un troncon ---------------------------------------

/** Effort tranchant a l'abscisse locale s (kN). */
export function effortTranchant(t: Troncon, s: number): number {
  return t.f0 - t.c0 * s - (t.c1 * s * s) / 2;
}

/** Moment flechissant a l'abscisse locale s (kN.m). */
export function momentFlechissant(t: Troncon, s: number): number {
  return -t.f1 + t.f0 * s - (t.c0 * s * s) / 2 - (t.c1 * s ** 3) / 6;
}

/** Rotation a l'abscisse locale s (rad) : EI v'' = M integre une fois. */
export function rotation(t: Troncon, s: number): number {
  return t.t0 + (-t.f1 * s + (t.f0 * s * s) / 2 - (t.c0 * s ** 3) / 6 - (t.c1 * s ** 4) / 24) / t.EI;
}

/** Deplacement vertical a l'abscisse locale s (m, vers le haut). */
export function deplacement(t: Troncon, s: number): number {
  return (
    t.v0 +
    t.t0 * s +
    ((-t.f1 * s * s) / 2 + (t.f0 * s ** 3) / 6 - (t.c0 * s ** 4) / 24 - (t.c1 * s ** 5) / 120) / t.EI
  );
}

function point(t: Troncon, s: number): Point {
  return {
    x: t.x0 + s,
    V: effortTranchant(t, s),
    M: momentFlechissant(t, s),
    w: -deplacement(t, s) * MM_PAR_M,
  };
}

// --- Maillage ------------------------------------------------------------------

/** Abscisses des noeuds : extremites, appuis, rotules, charges et bornes de charges. */
export function abscissesDesNoeuds(p: Poutre, supplementaires: number[] = []): number[] {
  const brutes = [0, p.longueur, ...p.appuis.map((a) => a.x), ...p.rotules, ...supplementaires];
  for (const c of p.charges) {
    if (c.type === 'ponctuelle' || c.type === 'moment') brutes.push(c.x);
    else brutes.push(c.a, c.b);
  }
  const triees = brutes.map((x) => Math.min(Math.max(x, 0), p.longueur)).sort((a, b) => a - b);
  const noeuds: number[] = [];
  for (const x of triees) {
    if (noeuds.length === 0 || x - noeuds[noeuds.length - 1] > TOLERANCE_X) noeuds.push(x);
  }
  return noeuds;
}

function indiceDuNoeud(noeuds: number[], x: number): number {
  let meilleur = 0;
  for (let i = 1; i < noeuds.length; i++) if (Math.abs(noeuds[i] - x) < Math.abs(noeuds[meilleur] - x)) meilleur = i;
  return meilleur;
}

/** Intensite (kN/m) en x d'une charge repartie, 0 hors de son etendue. */
function intensite(p: Poutre, x0: number, x1: number, x: number): number {
  let q = 0;
  for (const c of p.charges) {
    if (c.type !== 'repartie' && c.type !== 'lineaire') continue;
    // Le troncon est entierement dans la charge ou entierement dehors : ses bornes sont des noeuds.
    if (c.a > x0 + TOLERANCE_X || c.b < x1 - TOLERANCE_X) continue;
    q += c.type === 'repartie' ? c.q : c.q_a + ((c.q_b - c.q_a) * (x - c.a)) / (c.b - c.a);
  }
  return q;
}

/** Matrice de rigidite d'un element de poutre (v1, t1, v2, t2). */
function rigiditeElementaire(EI: number, L: number): number[][] {
  const k = EI / L ** 3;
  return [
    [12 * k, 6 * L * k, -12 * k, 6 * L * k],
    [6 * L * k, 4 * L * L * k, -6 * L * k, 2 * L * L * k],
    [-12 * k, -6 * L * k, 12 * k, -6 * L * k],
    [6 * L * k, 2 * L * L * k, -6 * L * k, 4 * L * L * k],
  ];
}

/**
 * Forces nodales equivalentes coherentes d'une charge lineaire q_a -> q_b
 * dirigee vers le bas (signes : v vers le haut, rotation trigonometrique).
 * Somme d'un triangle decroissant d'intensite q_a et d'un triangle croissant
 * d'intensite q_b ; pour q_a = q_b on retrouve -qL/2 et -/+ qL2/12.
 */
function forcesEquivalentes(qa: number, qb: number, L: number): number[] {
  return [
    -qa * ((7 * L) / 20) - qb * ((3 * L) / 20),
    -qa * ((L * L) / 20) - qb * ((L * L) / 30),
    -qa * ((3 * L) / 20) - qb * ((7 * L) / 20),
    qa * ((L * L) / 30) + qb * ((L * L) / 20),
  ];
}

// --- Calcul -----------------------------------------------------------------------

/**
 * Reactions, efforts et deformee d'une poutre. Leve une Error pour une
 * donnee incoherente ou une poutre hypostatique (mecanisme).
 */
export function calculerPoutre(poutre: Poutre, options: { noeuds?: number[] } = {}): ResultatPoutre {
  verifierDonnees(poutre);
  const degre = degreHyperstatique(poutre);
  if (degre < 0) {
    throw new Error(
      `Poutre hypostatique (degré ${degre}) : elle forme un mécanisme. Ajouter un appui ou une liaison, ou retirer une rotule.`
    );
  }

  // Noeuds imposes : des cas de charge calcules separement partagent ainsi
  // le meme decoupage, et leurs troncons se superposent indice par indice.
  const noeuds = abscissesDesNoeuds(poutre, options.noeuds);
  const n = noeuds.length;
  const estRotule = noeuds.map((x) => poutre.rotules.some((r) => Math.abs(r - x) < TOLERANCE_X));

  // Numerotation : un deplacement par noeud, une rotation par cote de rotule.
  const ddlV: number[] = [];
  const ddlTGauche: number[] = [];
  const ddlTDroite: number[] = [];
  let nb = 0;
  for (let i = 0; i < n; i++) {
    ddlV.push(nb++);
    ddlTGauche.push(nb++);
    ddlTDroite.push(estRotule[i] ? nb++ : ddlTGauche[i]);
  }

  const K: number[][] = Array.from({ length: nb }, () => new Array<number>(nb).fill(0));
  const F = new Array<number>(nb).fill(0);

  const elements = [];
  for (let e = 0; e < n - 1; e++) {
    const x0 = noeuds[e];
    const x1 = noeuds[e + 1];
    const L = x1 - x0;
    const qa = intensite(poutre, x0, x1, x0);
    const qb = intensite(poutre, x0, x1, x1);
    const ddl = [ddlV[e], ddlTDroite[e], ddlV[e + 1], ddlTGauche[e + 1]];
    const k = rigiditeElementaire(poutre.EI, L);
    const feq = forcesEquivalentes(qa, qb, L);
    for (let i = 0; i < 4; i++) {
      F[ddl[i]] += feq[i];
      for (let j = 0; j < 4; j++) K[ddl[i]][ddl[j]] += k[i][j];
    }
    elements.push({ x0, x1, L, qa, qb, ddl, k, feq });
  }

  for (const c of poutre.charges) {
    if (c.type === 'ponctuelle') F[ddlV[indiceDuNoeud(noeuds, c.x)]] -= c.P;
    if (c.type === 'moment') F[ddlTGauche[indiceDuNoeud(noeuds, c.x)]] += c.M;
  }

  // Liaisons : valeurs imposees (m, rad) et ressorts.
  const imposes = new Map<number, number>();
  const ressorts = new Map<number, number>();
  for (const a of poutre.appuis) {
    const i = indiceDuNoeud(noeuds, a.x);
    const v = ddlV[i];
    const t = ddlTGauche[i];
    switch (a.type) {
      case 'appui-simple':
        imposes.set(v, -a.tassement / MM_PAR_M);
        break;
      case 'encastrement':
        imposes.set(v, -a.tassement / MM_PAR_M);
        imposes.set(t, 0);
        break;
      case 'glissiere':
        imposes.set(t, 0);
        break;
      case 'encastrement-elastique':
        imposes.set(v, -a.tassement / MM_PAR_M);
        ressorts.set(t, a.k_rotation);
        break;
      case 'ressort':
        if (a.k_vertical > 0) ressorts.set(v, a.k_vertical);
        if (a.k_rotation > 0) ressorts.set(t, a.k_rotation);
        break;
    }
  }
  for (const [d, k] of ressorts) K[d][d] += k;

  const libres: number[] = [];
  for (let d = 0; d < nb; d++) if (!imposes.has(d)) libres.push(d);
  const u = new Array<number>(nb).fill(0);
  for (const [d, valeur] of imposes) u[d] = valeur;
  const Kff = libres.map((i) => libres.map((j) => K[i][j]));
  const Ff = libres.map((i) => {
    let s = F[i];
    for (const [d, valeur] of imposes) s -= K[i][d] * valeur;
    return s;
  });
  let uf: number[];
  try {
    uf = resoudre(Kff, Ff);
  } catch (e) {
    if (e instanceof MatriceSinguliere) {
      throw new Error(
        'Poutre instable : la position des appuis et des rotules forme un mécanisme (par exemple deux rotules dans une même travée, ou une console terminée par une rotule). Ajouter un appui ou retirer une rotule.'
      );
    }
    throw e;
  }
  libres.forEach((d, i) => (u[d] = uf[i]));

  // Efforts d'extremite et troncons.
  const troncons: Troncon[] = elements.map((el) => {
    const ue = el.ddl.map((d) => u[d]);
    const f = el.k.map((ligne, i) => ligne.reduce((s, kij, j) => s + kij * ue[j], 0) - el.feq[i]);
    return {
      x0: el.x0,
      x1: el.x1,
      EI: poutre.EI,
      f0: f[0],
      f1: f[1],
      c0: el.qa,
      c1: (el.qb - el.qa) / el.L,
      v0: ue[0],
      t0: ue[1],
    };
  });

  // Reactions : K u - F aux ddl imposes, -k u aux ressorts.
  const residu = (d: number): number => K[d].reduce((s, kij, j) => s + kij * u[j], 0) - F[d];
  const brutes: ReactionBrute[] = poutre.appuis.map((a) => {
    const i = indiceDuNoeud(noeuds, a.x);
    const v = ddlV[i];
    const t = ddlTGauche[i];
    const valeur = (d: number): number => (imposes.has(d) ? residu(d) : ressorts.has(d) ? -(ressorts.get(d) as number) * u[d] : 0);
    return { R: valeur(v), M_reaction: valeur(t), w: -u[v] * MM_PAR_M, rotation: u[t] * MM_PAR_M };
  });

  return assemblerResultat(poutre, degre, troncons, brutes, sommeDesCharges(poutre));
}

/** Somme des charges verticales d'une poutre (kN, vers le bas). */
export function sommeDesCharges(poutre: Poutre): number {
  let charges = 0;
  for (const c of poutre.charges) {
    if (c.type === 'ponctuelle') charges += c.P;
    if (c.type === 'repartie') charges += c.q * (c.b - c.a);
    if (c.type === 'lineaire') charges += ((c.q_a + c.q_b) / 2) * (c.b - c.a);
  }
  return charges;
}

/** Reaction d'appui avant mise en forme : ce qui se superpose lineairement. */
export interface ReactionBrute {
  R: number;
  M_reaction: number;
  w: number;
  rotation: number;
}

/**
 * Resultat complet depuis les troncons et les reactions : efforts de part et
 * d'autre des appuis, courbes, travees, extremums. Sert au calcul direct et
 * a toute combinaison lineaire de cas de charge (memes troncons).
 */
export function assemblerResultat(
  poutre: Poutre,
  degre: number,
  troncons: Troncon[],
  brutes: ReactionBrute[],
  charges: number
): ResultatPoutre {
  const reactions: Reaction[] = poutre.appuis.map((a, k) => {
    const gauche = troncons.find((t) => Math.abs(t.x1 - a.x) < TOLERANCE_X) ?? null;
    const droite = troncons.find((t) => Math.abs(t.x0 - a.x) < TOLERANCE_X) ?? null;
    const Lg = gauche === null ? 0 : gauche.x1 - gauche.x0;
    return {
      appui: a,
      ...brutes[k],
      M_gauche: gauche === null ? null : momentFlechissant(gauche, Lg),
      M_droite: droite === null ? null : momentFlechissant(droite, 0),
      V_gauche: gauche === null ? null : effortTranchant(gauche, Lg),
      V_droite: droite === null ? null : effortTranchant(droite, 0),
    };
  });

  const courbes = troncons.map(pointsDuTroncon);
  const travees = decouperEnTravees(poutre).map(([nom, x0, x1]) => ({
    nom,
    x0,
    x1,
    // Points des seuls troncons de la travee : l'effort tranchant de l'autre
    // cote d'un appui appartient a la travee voisine.
    ...extremesDe(courbes.filter((_, e) => troncons[e].x0 >= x0 - TOLERANCE_X && troncons[e].x1 <= x1 + TOLERANCE_X).flat()),
  }));

  return {
    poutre,
    degreHyperstatique: degre,
    troncons,
    courbes,
    reactions,
    travees,
    extremes: extremesDe(courbes.flat()),
    equilibre: { charges, reactions: reactions.reduce((s, r) => s + r.R, 0) },
  };
}

// --- Echantillonnage et extremums ------------------------------------------------

/** Nombre de points de trace par troncon, hors extremums ajoutes. */
const POINTS_PAR_TRONCON = 24;

/** Racines de V(s) = f0 - c0 s - c1 s2/2 dans ]0, L[ : extremums du moment. */
function zerosDeLEffortTranchant(t: Troncon, L: number): number[] {
  const a = -t.c1 / 2;
  const b = -t.c0;
  const c = t.f0;
  const racines: number[] = [];
  if (Math.abs(a) < 1e-14) {
    if (Math.abs(b) > 1e-14) racines.push(-c / b);
  } else {
    const delta = b * b - 4 * a * c;
    if (delta >= 0) {
      const r = Math.sqrt(delta);
      racines.push((-b - r) / (2 * a), (-b + r) / (2 * a));
    }
  }
  return racines.filter((s) => s > 0 && s < L);
}

/** Zeros de la rotation dans ]0, L[ par dichotomie : extremums de la fleche. */
function zerosDeLaRotation(t: Troncon, L: number): number[] {
  const N = 64;
  const zeros: number[] = [];
  let sa = 0;
  let ra = rotation(t, 0);
  for (let i = 1; i <= N; i++) {
    const sb = (L * i) / N;
    const rb = rotation(t, sb);
    if (ra * rb < 0) {
      let g = sa;
      let d = sb;
      let rg = ra;
      for (let k = 0; k < 60; k++) {
        const m = (g + d) / 2;
        const rm = rotation(t, m);
        if (rg * rm <= 0) d = m;
        else {
          g = m;
          rg = rm;
        }
      }
      zeros.push((g + d) / 2);
    }
    sa = sb;
    ra = rb;
  }
  return zeros;
}

function pointsDuTroncon(t: Troncon): Point[] {
  const L = t.x1 - t.x0;
  const abscisses = new Set<number>();
  for (let i = 0; i <= POINTS_PAR_TRONCON; i++) abscisses.add((L * i) / POINTS_PAR_TRONCON);
  for (const s of zerosDeLEffortTranchant(t, L)) abscisses.add(s);
  for (const s of zerosDeLaRotation(t, L)) abscisses.add(s);
  return [...abscisses].sort((a, b) => a - b).map((s) => point(t, s));
}

function extremesDe(points: Point[]): Omit<Travee, 'nom' | 'x0' | 'x1'> {
  let M_max: Extremum = { x: points[0].x, valeur: points[0].M };
  let M_min: Extremum = { ...M_max };
  let V_max: Extremum = { x: points[0].x, valeur: points[0].V };
  let w_max: Extremum = { x: points[0].x, valeur: points[0].w };
  for (const p of points) {
    if (p.M > M_max.valeur) M_max = { x: p.x, valeur: p.M };
    if (p.M < M_min.valeur) M_min = { x: p.x, valeur: p.M };
    if (Math.abs(p.V) > Math.abs(V_max.valeur)) V_max = { x: p.x, valeur: p.V };
    if (Math.abs(p.w) > Math.abs(w_max.valeur)) w_max = { x: p.x, valeur: p.w };
  }
  return { M_max, M_min, V_max, w_max };
}

/**
 * Travees : intervalles entre appuis consecutifs, et consoles au-dela des
 * appuis d'extremite. Un appui elastique delimite une travee comme un autre.
 */
export function decouperEnTravees(p: Poutre): [string, number, number][] {
  const xs = [...new Set(p.appuis.map((a) => a.x))].sort((a, b) => a - b);
  const zones: [string, number, number][] = [];
  if (xs[0] > TOLERANCE_X) zones.push(['console gauche', 0, xs[0]]);
  for (let i = 0; i < xs.length - 1; i++) zones.push([`travee ${i + 1}`, xs[i], xs[i + 1]]);
  if (xs[xs.length - 1] < p.longueur - TOLERANCE_X) zones.push(['console droite', xs[xs.length - 1], p.longueur]);
  return zones;
}
