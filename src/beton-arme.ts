/**
 * Poutre continue en beton arme : aciers longitudinaux, effort tranchant,
 * epure d'arret des barres et ancrages aux appuis (EN 1992-1-1:2004).
 *
 * Les resistances de section viennent de `section-uls` (diagramme
 * parabole-rectangle, §3.1.7, flexion simple sous N = 0 ; effort tranchant
 * §6.2.2 et §6.2.3 ; minimums §9.2.1.1 et §9.2.2) ; les longueurs d'ancrage,
 * de `dispositions-constructives` (§8.4). Ce module les applique aux
 * enveloppes ELU de la poutre.
 *
 * L'outil CONSTATE : il rend les aciers necessaires, la resistance des
 * barres choisies par l'ingenieur, et les longueurs minimales des renforts
 * et chapeaux qui couvrent l'epure. Il ne dessine pas un ferraillage.
 *
 * Unites : mm pour les sections et les longueurs de barres, m pour les
 * abscisses le long de la poutre, kN, kN.m, MPa, mm2.
 */

import {
  createConcrete,
  createSteel,
  minimumLongitudinalArea,
  minimumWebRatio,
  polygonSection,
  rectangularSection,
  shearWithLinks,
  shearWithoutLinks,
  verifyUniaxial,
  type NormProfile,
  type Section,
} from 'section-uls';
import {
  aireBarre,
  conditionsAdherence,
  contrainteAdherence,
  ec2Recommande,
  eta1,
  eta2,
  longueurDeReference,
  longueurMinimale,
  tractionPourAdherence,
  type ProfilEc2,
} from 'dispositions-constructives';
import { enveloppeEn, type CasCalcules, type Enveloppe, type Zone } from './combinaisons';
import { MM_PAR_M, TOLERANCE_X } from './modele';
import { nombreAffiche } from './nombres';
import type { ProfilPoutre } from './norms/profil';

/** Module d'elasticite des aciers (MPa), §3.2.7(4). */
export const E_S = 200000;
/** Conversion kN -> N. */
const N_PAR_KN = 1000;

export interface SectionBA {
  forme: 'rectangle' | 'te';
  /** Largeur d'ame (mm). */
  b_w: number;
  /** Hauteur totale (mm). */
  h: number;
  /** Largeur participante de la table (mm), section en T. */
  b_eff: number;
  /** Epaisseur de la table (mm), section en T. */
  h_f: number;
}

/** Lit de barres : n barres de diametre phi (mm). */
export interface Lit {
  n: number;
  phi: number;
}

export interface AciersChoisis {
  /** Par zone (travee ou console) : aciers inferieurs filants et renforts. */
  zones: { filants: Lit | null; renforts: Lit | null }[];
  /** Par appui : chapeaux (aciers superieurs locaux). */
  appuis: { chapeaux: Lit | null }[];
  /** Aciers superieurs filants sur toute la poutre (montage). */
  montage: Lit | null;
}

export interface DonneesBA {
  section: SectionBA;
  /** Resistance caracteristique du beton (MPa). */
  fck: number;
  /** Limite elastique des aciers longitudinaux et des cadres (MPa). */
  fyk: number;
  classeAcier: 'A' | 'B' | 'C';
  /** Distance de la fibre inferieure a l'axe des aciers inferieurs (mm). */
  a_inf: number;
  /** Distance de la fibre superieure a l'axe des aciers superieurs (mm). */
  a_sup: number;
  /** cot theta des bielles, entre 1 et 2,5 (§6.2.3(2)). */
  cotTheta: number;
  /** Cadres droits : diametre (mm), nombre de brins, espacement (mm). */
  cadres: { phi: number; brins: number; s: number };
  /** Largeur des appuis (mm), pour reduire V_Ed a d du nu (§6.2.1(8)). */
  largeurAppui: number;
  /** Appuis d'extremite monolithiques avec leurs supports (§9.2.1.2(1)). */
  extremitesMonolithiques: boolean;
  aciers: AciersChoisis;
}

export interface Flexion {
  /** Moment de calcul, en valeur absolue (kN.m). */
  M_Ed: number;
  /** 1 : fibre inferieure tendue ; -1 : fibre superieure tendue. */
  sens: 1 | -1;
  d: number;
  /** Limite de x_u/d retenue. */
  xu_d_limite: number;
  /** Aciers tendus et comprimes necessaires (mm2). */
  As_req: number;
  As2_req: number;
  xu_d_req: number;
  As_min: number;
  As_max: number;
  /** Aciers tendus en place (mm2), moment resistant (kN.m), x_u/d ; null sans aciers choisis. */
  As_prov: number | null;
  M_Rd: number | null;
  xu_d_prov: number | null;
}

export interface Tranchant {
  /** Extremite de zone concernee. */
  x: number;
  /** V_Ed a l'axe de l'appui (kN, valeur absolue). */
  V_Ed: number;
  /** V_Ed a d du nu de l'appui (kN). */
  V_Ed_reduit: number;
  V_Rd_c: number;
  V_Rd_max: number;
  /** A_sw/s necessaire (mm2/mm), minimum compris. */
  Asw_s_req: number;
  Asw_s_min: number;
  /** Cadres choisis : A_sw/s (mm2/mm), V_Rd,s (kN). */
  Asw_s_prov: number;
  V_Rd_s: number;
  s_max: number;
}

export interface Arret {
  /** Abscisses (m) de debut et de fin des barres, longueur d'ancrage comprise. */
  de: number;
  a: number;
  /** Zone ou les barres sont necessaires, avant ancrage (m). */
  necessaire: [number, number];
}

export interface ZoneBA {
  zone: Zone;
  flexion: Flexion | null;
  /** M_Rd des seuls filants (kN.m). */
  M_Rd_filants: number;
  /** Renforts : null s'ils ne sont pas necessaires. */
  renforts: Arret | null;
  /** §9.2.1.4(1) et §9.2.1.5(1) : au moins 25 % des aciers de travee prolonges sur appui. */
  part_filants: number | null;
  tranchant: Tranchant[];
}

export interface AppuiBA {
  indice: number;
  x: number;
  delta: number;
  flexion: Flexion | null;
  /** Chapeaux : null s'ils ne sont pas necessaires. */
  chapeaux: Arret | null;
  /** Appui d'extremite : effort a ancrer (§9.2.1.4(2)) et longueur au-dela du nu. */
  ancrage: { F_E: number; As_req: number; As_prov: number; l_requise: number } | null;
  /** Appui d'extremite monolithique : aciers superieurs pour beta_1 M_travee (§9.2.1.2(1)). */
  monolithique: { M: number; As_req: number; As_prov: number } | null;
}

export interface PointEpure {
  x: number;
  M_max: number;
  M_min: number;
  /** Enveloppe decalee de a_l (§9.2.1.3(2)). */
  Mdec_max: number;
  Mdec_min: number;
  /** Moment resistant des aciers inferieurs (positif) et superieurs (negatif). */
  MRd_inf: number;
  MRd_sup: number;
}

export interface ResultatBA {
  d_inf: number;
  d_sup: number;
  /** Decalage de la courbe enveloppe (m). */
  a_l: number;
  /** Longueurs d'ancrage de calcul (mm) des renforts inferieurs et des chapeaux. */
  l_bd_inf: number;
  l_bd_sup: number;
  zones: ZoneBA[];
  appuis: AppuiBA[];
  epure: PointEpure[];
  avertissements: string[];
}

// --- Saisie --------------------------------------------------------------------

/** Lit depuis un texte « 3HA16 », « 3 HA 16 », « 3x16 », « 3T16 » ; null si vide. */
export function lireLit(texte: string): Lit | null {
  const t = texte.trim();
  if (t === '') return null;
  const m = /^(\d+)\s*(?:x|×|\*|ha|t|ø|φ|phi)?\s*(\d+(?:[.,]\d+)?)$/i.exec(t);
  if (m === null) throw new Error(`Lit de barres illisible : « ${t} » (écrire par exemple 3HA16).`);
  const n = Number(m[1]);
  const phi = Number(m[2].replace(',', '.'));
  if (n <= 0 || phi <= 0) throw new Error(`Lit de barres « ${t} » : nombre et diamètre strictement positifs.`);
  return { n, phi };
}

export function aireLit(l: Lit | null): number {
  return l === null ? 0 : l.n * aireBarre(l.phi);
}

export function libelleLit(l: Lit | null): string {
  return l === null ? '—' : `${l.n}HA${l.phi}`;
}

// --- Section --------------------------------------------------------------------

function normeSectionUls(p: ProfilPoutre): NormProfile {
  return { name: p.nom, gammaC: p.gamma_C.valeur, gammaS: p.gamma_S.valeur, alphaCc: p.alpha_cc.valeur, nBands: 200 };
}

function profilAncrage(p: ProfilPoutre): ProfilEc2 {
  return { ...ec2Recommande(), nom: p.nom, gamma_C: p.gamma_C, gamma_S: p.gamma_S, alpha_cc: p.alpha_cc, alpha_ct: p.alpha_ct };
}

interface Contexte {
  d: DonneesBA;
  profil: ProfilPoutre;
  norme: NormProfile;
  beton: ReturnType<typeof createConcrete>;
  acier: ReturnType<typeof createSteel>;
}

/**
 * Section de calcul pour un sens de flexion. En moment negatif la section
 * est retournee (miroir vertical) : section-uls place toujours la
 * compression en fibre superieure.
 */
function sectionPour(c: Contexte, sens: 1 | -1, As: number, As2: number): Section {
  const { b_w, h, b_eff, h_f, forme } = c.d.section;
  const aT = sens === 1 ? c.d.a_inf : c.d.a_sup;
  const aC = sens === 1 ? c.d.a_sup : c.d.a_inf;
  const barres = [
    { depth: h - aT, area: As },
    { depth: aC, area: As2 },
  ].filter((b) => b.area > 0);
  if (forme === 'rectangle') {
    return rectangularSection({
      width: b_w,
      height: h,
      concrete: c.beton,
      rebars: barres.map((b) => ({ depthFromTop: b.depth, area: b.area, steel: c.acier })),
    });
  }
  // Table en haut ; en moment negatif, le miroir la met en bas.
  const z = (v: number): number => (sens === 1 ? v : h - v);
  const contour = [
    [-b_eff / 2, 0],
    [b_eff / 2, 0],
    [b_eff / 2, h_f],
    [b_w / 2, h_f],
    [b_w / 2, h],
    [-b_w / 2, h],
    [-b_w / 2, h_f],
    [-b_eff / 2, h_f],
  ].map(([y, zz]) => ({ y, z: z(zz) }));
  const sommets = sens === 1 ? contour : contour.reverse();
  return polygonSection({
    vertices: sommets,
    concrete: c.beton,
    rebars: barres.map((b) => ({ y: 0, z: b.depth, area: b.area, steel: c.acier })),
  });
}

/** Moment resistant (kN.m, section-uls) et profondeur d'axe neutre (mm). */
function resistance(c: Contexte, sens: 1 | -1, As: number, As2 = 0): { M_Rd: number; xu: number } {
  const r = verifyUniaxial(sectionPour(c, sens, As, As2), { N: 0, M: 0 }, c.norme);
  if (!r.converged) throw new Error('Flexion : équilibre de la section introuvable (section-uls).');
  return { M_Rd: Math.abs(r.M_Rd), xu: r.neutralAxisDepth };
}

function bissection(f: (a: number) => number, lo: number, hi: number, n = 50): number {
  let a = lo;
  let b = hi;
  for (let i = 0; i < n; i++) {
    const m = (a + b) / 2;
    if (f(m) < 0) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

function aireBeton(s: SectionBA): number {
  return s.forme === 'rectangle' ? s.b_w * s.h : s.b_eff * s.h_f + s.b_w * (s.h - s.h_f);
}

/**
 * Limite de x_u/d. Section redistribuee : delta >= k1 + k2 x_u/d (§5.5(4)),
 * d'ou x_u/d <= (delta - k1) / k2. CHOIX DE MODELISATION : la meme borne
 * avec delta = 1 (0,448 pour f_ck <= 50 MPa) s'applique aux sections non
 * redistribuees, pour garder la ductilite qu'exige le calcul elastique
 * d'une poutre continue ; au-dela, l'outil ajoute des aciers comprimes.
 */
export function limiteXuD(profil: ProfilPoutre, fck: number, epsCu2: number, delta: number): number {
  const f = 0.6 + 0.0014 / epsCu2;
  return fck <= 50 ? (delta - profil.k1.valeur) / (profil.facteur_k2.valeur * f) : (delta - profil.k3.valeur) / (profil.facteur_k4.valeur * f);
}

/** Aciers necessaires et resistance des aciers choisis pour un moment donne. */
function flexion(c: Contexte, M_Ed: number, sens: 1 | -1, delta: number, As_prov: number | null): Flexion {
  const { h } = c.d.section;
  const d = h - (sens === 1 ? c.d.a_inf : c.d.a_sup);
  const xlim = limiteXuD(c.profil, c.d.fck, c.beton.epsCu2, delta);
  const Ac = aireBeton(c.d.section);
  const Amax = 0.04 * Ac;
  const tres = 1e-3;
  const xu = (A: number): number => resistance(c, sens, A).xu / d;
  // Aire tendue qui place l'axe neutre a la limite.
  const A_lim = xu(Amax * 5) <= xlim ? Amax * 5 : bissection((A) => xu(A) - xlim, tres, Amax * 5);
  const M_lim = resistance(c, sens, A_lim).M_Rd;
  let As_req: number;
  let As2_req = 0;
  if (M_Ed <= 0) As_req = 0;
  else if (M_Ed <= M_lim) {
    As_req = bissection((A) => resistance(c, sens, A).M_Rd - M_Ed, tres, A_lim);
  } else {
    // Aciers comprimes : pour chaque A2, l'aire tendue qui garde x_u = x_lim d.
    const tendu = (A2: number): number =>
      bissection((A) => resistance(c, sens, A, A2).xu / d - xlim, tres, Amax * 10, 40);
    As2_req = bissection((A2) => resistance(c, sens, tendu(A2), A2).M_Rd - M_Ed, 0, Amax * 5, 40);
    As_req = tendu(As2_req);
  }
  const xu_d_req = As_req > 0 ? resistance(c, sens, As_req, As2_req).xu / d : 0;
  const bt = sens === 1 || c.d.section.forme === 'rectangle' ? c.d.section.b_w : c.d.section.b_eff;
  const rect = rectangularSection({ width: bt, height: h, concrete: c.beton, rebars: [{ depthFromTop: d, area: 1, steel: c.acier }] });
  const As_min = minimumLongitudinalArea(rect, 'beam', { d, steel: c.acier });
  let M_Rd: number | null = null;
  let xu_d_prov: number | null = null;
  if (As_prov !== null && As_prov > 0) {
    const r = resistance(c, sens, As_prov);
    M_Rd = r.M_Rd;
    xu_d_prov = r.xu / d;
  }
  return { M_Ed, sens, d, xu_d_limite: xlim, As_req, As2_req, xu_d_req, As_min, As_max: Amax, As_prov, M_Rd, xu_d_prov };
}

/** M_Rd (kN.m) d'une aire tendue seule ; 0 sans acier. */
function mrd(c: Contexte, sens: 1 | -1, As: number): number {
  return As > 0 ? resistance(c, sens, As).M_Rd : 0;
}

// --- Ancrage --------------------------------------------------------------------

/** l_bd = max(l_b,rqd ; l_b,min) avec alpha_i = 1 et sigma_sd = f_yd, du cote de la securite (mm). */
function longueurAncrage(c: Contexte, phi: number, distanceAuFond: number, sigma?: number): number {
  const p = profilAncrage(c.profil);
  const adh = conditionsAdherence({ mode: 'geometrie', inclinaison: 0, hauteurElement: c.d.section.h, distanceAuFond });
  const f_bd = contrainteAdherence(eta1(adh.conditions), eta2(phi), tractionPourAdherence(c.d.fck, p).fctd);
  const fyd = c.d.fyk / c.profil.gamma_S.valeur;
  const l_b_rqd = longueurDeReference(phi, sigma ?? fyd, f_bd);
  return Math.max(l_b_rqd, longueurMinimale(longueurDeReference(phi, fyd, f_bd), phi, 'traction').valeur);
}

// --- Calcul --------------------------------------------------------------------

function verifierDonneesBA(d: DonneesBA, nbZones: number, nbAppuis: number): void {
  const pos = (v: number, nom: string, u: string): void => {
    if (!Number.isFinite(v) || v <= 0) throw new Error(`${nom} doit être un nombre strictement positif (${u}).`);
  };
  const s = d.section;
  pos(s.b_w, 'La largeur d ame b_w', 'mm');
  pos(s.h, 'La hauteur h', 'mm');
  if (s.forme === 'te') {
    pos(s.h_f, 'L epaisseur de table h_f', 'mm');
    if (s.b_eff < s.b_w) throw new Error('La largeur de table b_eff doit être au moins égale à b_w (mm).');
    if (s.h_f >= s.h) throw new Error("L'épaisseur de table h_f doit être inférieure à h (mm).");
  }
  pos(d.fck, 'La resistance du beton f_ck', 'MPa');
  pos(d.fyk, 'La limite elastique f_yk', 'MPa');
  pos(d.a_inf, 'La distance a_inf', 'mm');
  pos(d.a_sup, 'La distance a_sup', 'mm');
  if (d.a_inf + d.a_sup >= s.h) throw new Error('a_inf + a_sup doit rester inférieur à h (mm).');
  if (!(d.cotTheta >= 1 && d.cotTheta <= 2.5)) throw new Error('cot theta doit être compris entre 1 et 2,5 (§6.2.3(2)).');
  pos(d.cadres.phi, 'Le diametre des cadres', 'mm');
  pos(d.cadres.brins, 'Le nombre de brins', '-');
  pos(d.cadres.s, 'L espacement des cadres', 'mm');
  if (!Number.isFinite(d.largeurAppui) || d.largeurAppui < 0) throw new Error('La largeur des appuis doit être positive ou nulle (mm).');
  if (d.aciers.zones.length !== nbZones) throw new Error("Un choix d'aciers inférieurs par travée est attendu.");
  if (d.aciers.appuis.length !== nbAppuis) throw new Error('Un choix de chapeaux par appui est attendu.');
}

/** Zone contigue autour de x0 (ou dans [a, b]) ou `besoin` est vrai, bornes interpolees. */
function etendue(points: PointEpure[], besoin: (p: PointEpure) => number, a: number, b: number, autour?: number): [number, number] | null {
  const dedans = points.filter((p) => p.x >= a - TOLERANCE_X && p.x <= b + TOLERANCE_X);
  let i0 = -1;
  let i1 = -1;
  if (autour === undefined) {
    dedans.forEach((p, i) => {
      if (besoin(p) > 0) {
        if (i0 === -1) i0 = i;
        i1 = i;
      }
    });
  } else {
    const k = dedans.findIndex((p) => Math.abs(p.x - autour) < TOLERANCE_X && besoin(p) > 0);
    if (k === -1) return null;
    i0 = k;
    i1 = k;
    while (i0 > 0 && besoin(dedans[i0 - 1]) > 0) i0--;
    while (i1 < dedans.length - 1 && besoin(dedans[i1 + 1]) > 0) i1++;
  }
  if (i0 === -1) return null;
  const interp = (i: number, j: number): number => {
    const fi = besoin(dedans[i]);
    const fj = besoin(dedans[j]);
    return dedans[i].x + ((dedans[j].x - dedans[i].x) * fi) / (fi - fj);
  };
  const g = i0 > 0 ? interp(i0, i0 - 1) : dedans[0].x;
  const d = i1 < dedans.length - 1 ? interp(i1, i1 + 1) : dedans[dedans.length - 1].x;
  return [g, d];
}

/**
 * Dimensionnement en beton arme sur l'enveloppe ELU. `deltas` : coefficients
 * de redistribution par appui (1 = aucune), deja appliques a l'enveloppe.
 */
export function calculerBetonArme(
  cas: CasCalcules,
  elu: Enveloppe,
  d: DonneesBA,
  profil: ProfilPoutre,
  deltas: number[]
): ResultatBA {
  verifierDonneesBA(d, cas.zones.length, cas.poutre.appuis.length);
  const norme = normeSectionUls(profil);
  const c: Contexte = { d, profil, norme, beton: createConcrete(d.fck, norme), acier: createSteel(d.fyk, E_S, norme) };
  const avertissements: string[] = [];
  const h = d.section.h;
  const d_inf = h - d.a_inf;
  const d_sup = h - d.a_sup;
  const fyd = d.fyk / profil.gamma_S.valeur;

  // Decalage a_l = z (cot theta - cot alpha) / 2, cadres droits, z = 0,9 d (§9.2.1.3(2)).
  const a_l = (0.9 * Math.max(d_inf, d_sup) * d.cotTheta) / 2 / MM_PAR_M;

  // Enveloppe et enveloppe decalee, aux points de trace.
  const brut = elu.courbes.flat().map((p) => ({ x: p.x, M_max: p.M[1], M_min: p.M[0] }));
  const aciers = d.aciers;
  const montage = aireLit(aciers.montage);
  const MRd_montage = mrd(c, -1, montage);

  const phiInf = Math.max(...aciers.zones.map((z) => Math.max(z.renforts?.phi ?? 0, z.filants?.phi ?? 0)), 12);
  const phiSup = Math.max(...aciers.appuis.map((a) => a.chapeaux?.phi ?? 0), aciers.montage?.phi ?? 0, 12);
  const l_bd_inf = longueurAncrage(c, phiInf, d.a_inf);
  const l_bd_sup = longueurAncrage(c, phiSup, h - d.a_sup);

  const epure: PointEpure[] = brut.map((p) => {
    let Mdec_max = -Infinity;
    let Mdec_min = Infinity;
    for (const q of brut) {
      if (Math.abs(q.x - p.x) <= a_l + 1e-12) {
        Mdec_max = Math.max(Mdec_max, q.M_max);
        Mdec_min = Math.min(Mdec_min, q.M_min);
      }
    }
    return { ...p, Mdec_max, Mdec_min, MRd_inf: 0, MRd_sup: -MRd_montage };
  });

  // --- Zones : flexion positive, renforts, tranchant.
  const zones: ZoneBA[] = cas.zones.map((z, j) => {
    const choix = aciers.zones[j];
    const Af = aireLit(choix.filants);
    const Ar = aireLit(choix.renforts);
    const Mmax = elu.travees[j].M_max.valeur;
    const fl = Mmax > 1e-9 ? flexion(c, Mmax, 1, 1, Af + Ar > 0 ? Af + Ar : null) : null;
    const MRd_f = mrd(c, 1, Af);
    const besoin = etendue(epure, (p) => p.Mdec_max - MRd_f, z.x0, z.x1);
    let renforts: Arret | null = null;
    if (besoin !== null && Mmax > 1e-9) {
      const l = l_bd_inf / MM_PAR_M;
      renforts = { necessaire: besoin, de: Math.max(z.x0, besoin[0] - l), a: Math.min(z.x1, besoin[1] + l) };
      if (Ar === 0) avertissements.push(`${z.nom} : les filants ne couvrent pas l'épure décalée ; des renforts sont nécessaires.`);
    }
    const part = Af + Ar > 0 ? Af / (Af + Ar) : null;
    if (z.nom.startsWith('travee') && part !== null && part < 0.25) {
      avertissements.push(`${z.nom} : ${Math.round(part * 100)} % seulement des aciers inférieurs prolongés sur appui, moins des 25 % du §9.2.1.4(1) et du §9.2.1.5(1).`);
    }
    return { zone: z, flexion: fl, M_Rd_filants: MRd_f, renforts, part_filants: part, tranchant: [] };
  });

  // --- Appuis : flexion negative, chapeaux, ancrages.
  const xsAppuis = cas.poutre.appuis.map((a) => a.x);
  const appuis: AppuiBA[] = cas.poutre.appuis.map((a, i) => {
    const Mmin = elu.appuis[i].M_min.valeur;
    const chap = aireLit(aciers.appuis[i].chapeaux);
    const Asup = montage + chap;
    const fl = Mmin < -1e-9 ? flexion(c, -Mmin, -1, deltas[i] ?? 1, Asup > 0 ? Asup : null) : null;
    const besoin = etendue(epure, (p) => -p.Mdec_min - MRd_montage, 0, cas.poutre.longueur, a.x);
    let chapeaux: Arret | null = null;
    if (besoin !== null) {
      const l = l_bd_sup / MM_PAR_M;
      chapeaux = { necessaire: besoin, de: Math.max(0, besoin[0] - l), a: Math.min(cas.poutre.longueur, besoin[1] + l) };
      if (chap === 0) avertissements.push(`Appui A${i + 1} : les aciers de montage ne couvrent pas l'épure décalée ; des chapeaux sont nécessaires.`);
    }
    // Appui d'extremite : une seule zone voisine, une travee.
    const zg = cas.zones.findIndex((z) => Math.abs(z.x1 - a.x) < TOLERANCE_X);
    const zd = cas.zones.findIndex((z) => Math.abs(z.x0 - a.x) < TOLERANCE_X);
    const extremite = (zg === -1) !== (zd === -1);
    let ancrage: AppuiBA['ancrage'] = null;
    let monolithique: AppuiBA['monolithique'] = null;
    if (extremite) {
      const j = zg === -1 ? zd : zg;
      const V = enveloppeEn(cas, elu.combinaison, a.x, 'V', zg === -1 ? 1 : -1, zg === -1 ? 'droite' : 'gauche');
      const V_Ed = Math.abs(V.valeur);
      // §9.2.1.4(2), expression (9.3) : F_E = |V_Ed| a_l / z + N_Ed, N_Ed = 0.
      const F_E = V_Ed * (d.cotTheta / 2); // a_l / z = cot theta / 2
      const As_prov = aireLit(aciers.zones[j].filants);
      const As_req = (F_E * N_PAR_KN) / fyd;
      const phi = aciers.zones[j].filants?.phi ?? 12;
      const l_requise = As_prov > 0 ? longueurAncrage(c, phi, d.a_inf, Math.min(fyd, (F_E * N_PAR_KN) / As_prov)) : NaN;
      ancrage = { F_E, As_req, As_prov, l_requise };
      if (As_prov < As_req) avertissements.push(`Appui A${i + 1} : les filants inférieurs (${nombreAffiche(As_prov, 0)} mm2) n'ancrent pas F_E = ${nombreAffiche(F_E, 1)} kN (${nombreAffiche(As_req, 0)} mm2 requis, §9.2.1.4(2)).`);
      if (d.extremitesMonolithiques) {
        const M = profil.beta_1.valeur * Math.max(0, elu.travees[j].M_max.valeur);
        const f = M > 0 ? flexion(c, M, -1, 1, null) : null;
        monolithique = { M, As_req: f === null ? 0 : Math.max(f.As_req, f.As_min), As_prov: Asup };
      }
    }
    return { indice: i, x: a.x, delta: deltas[i] ?? 1, flexion: fl, chapeaux, ancrage, monolithique };
  });

  // --- Moments resistants le long de la poutre (epure), avec rampes d'ancrage.
  const rampe = (x: number, arret: Arret, base: number, total: number): number => {
    if (x < arret.de || x > arret.a) return base;
    const [n0, n1] = arret.necessaire;
    if (x < n0) return base + ((total - base) * (x - arret.de)) / Math.max(n0 - arret.de, 1e-9);
    if (x > n1) return base + ((total - base) * (arret.a - x)) / Math.max(arret.a - n1, 1e-9);
    return total;
  };
  for (const p of epure) {
    const j = cas.zones.findIndex((z) => p.x >= z.x0 - TOLERANCE_X && p.x <= z.x1 + TOLERANCE_X);
    const zb = zones[j];
    const totInf = mrd(c, 1, aireLit(aciers.zones[j].filants) + aireLit(aciers.zones[j].renforts));
    p.MRd_inf = zb.renforts !== null && aireLit(aciers.zones[j].renforts) > 0 ? rampe(p.x, zb.renforts, zb.M_Rd_filants, totInf) : zb.M_Rd_filants;
    let sup = MRd_montage;
    appuis.forEach((ap, i) => {
      if (ap.chapeaux === null || aciers.appuis[i].chapeaux === null) return;
      const tot = mrd(c, -1, montage + aireLit(aciers.appuis[i].chapeaux));
      sup = Math.max(sup, rampe(p.x, ap.chapeaux, MRd_montage, tot));
    });
    p.MRd_sup = -sup;
  }
  for (const p of epure) {
    if (p.Mdec_max > p.MRd_inf + 1e-6) {
      avertissements.push(`Epure : à x = ${nombreAffiche(p.x, 2)} m, le moment décalé ${nombreAffiche(p.Mdec_max, 1)} kN.m dépasse le moment résistant des aciers inférieurs ${nombreAffiche(p.MRd_inf, 1)} kN.m.`);
      break;
    }
  }
  for (const p of epure) {
    if (p.Mdec_min < p.MRd_sup - 1e-6) {
      avertissements.push(`Epure : à x = ${nombreAffiche(p.x, 2)} m, le moment décalé ${nombreAffiche(p.Mdec_min, 1)} kN.m dépasse le moment résistant des aciers supérieurs ${nombreAffiche(p.MRd_sup, 1)} kN.m.`);
      break;
    }
  }

  // --- Effort tranchant, aux extremites appuyees de chaque zone.
  const fywd = d.fyk / profil.gamma_S.valeur;
  const Asw = d.cadres.brins * aireBarre(d.cadres.phi);
  for (const zb of zones) {
    for (const [x, sensInterieur] of [[zb.zone.x0, 1], [zb.zone.x1, -1]] as [number, 1 | -1][]) {
      const i = xsAppuis.findIndex((y) => Math.abs(y - x) < TOLERANCE_X);
      if (i === -1) continue;
      const cote = sensInterieur === 1 ? 'droite' : 'gauche';
      const Vax = Math.max(
        Math.abs(enveloppeEn(cas, elu.combinaison, x, 'V', 1, cote).valeur),
        Math.abs(enveloppeEn(cas, elu.combinaison, x, 'V', -1, cote).valeur)
      );
      const decal = (d.largeurAppui / 2 + Math.max(d_inf, d_sup)) / MM_PAR_M;
      const xr = x + sensInterieur * Math.min(decal, (zb.zone.x1 - zb.zone.x0) / 2);
      const Vred = Math.max(
        Math.abs(enveloppeEn(cas, elu.combinaison, xr, 'V', 1).valeur),
        Math.abs(enveloppeEn(cas, elu.combinaison, xr, 'V', -1).valeur)
      );
      // Zone tendue pres de l'appui : en haut si l'appui porte un moment negatif.
      const negatif = elu.appuis[i].M_min.valeur < -1e-9;
      const AsT = negatif ? montage + aireLit(aciers.appuis[i].chapeaux) : aireLit(aciers.zones[cas.zones.indexOf(zb.zone)].filants);
      const sensM: 1 | -1 = negatif ? -1 : 1;
      const dd = negatif ? d_sup : d_inf;
      const rect = rectangularSection({
        width: d.section.b_w,
        height: h,
        concrete: c.beton,
        rebars: [{ depthFromTop: negatif ? d.a_sup : d_inf, area: Math.max(AsT, 1), steel: c.acier }],
      });
      const sansCadres = shearWithoutLinks(rect, 0, norme, { sensDuMoment: sensM });
      const avec = shearWithLinks(rect, { Asw, s: d.cadres.s, fywk: d.fyk }, norme, { cotTheta: d.cotTheta, sensDuMoment: sensM });
      const z = 0.9 * dd;
      const Asw_s_min = minimumWebRatio(d.fck, d.fyk) * d.section.b_w;
      const Asw_s_req = Math.max((Vred * N_PAR_KN) / (z * fywd * d.cotTheta), Asw_s_min);
      zb.tranchant.push({
        x,
        V_Ed: Vax,
        V_Ed_reduit: Vred,
        V_Rd_c: sansCadres.VRdc,
        V_Rd_max: avec.VRdmax,
        Asw_s_req,
        Asw_s_min,
        Asw_s_prov: Asw / d.cadres.s,
        V_Rd_s: avec.VRds,
        s_max: profil.s_l_max.valeur * dd,
      });
      if (Vax > avec.VRdmax) avertissements.push(`${zb.zone.nom}, x = ${nombreAffiche(x)} m : V_Ed = ${nombreAffiche(Vax, 1)} kN depasse V_Rd,max = ${nombreAffiche(avec.VRdmax, 1)} kN ; les bielles cèdent, agrandir la section.`);
    }
  }

  return { d_inf, d_sup, a_l, l_bd_inf, l_bd_sup, zones, appuis, epure, avertissements };
}
