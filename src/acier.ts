/**
 * Poutre continue en acier : verification de chaque zone (travee ou console)
 * par le noyau de `sections-ec3` (EN 1993-1-1), a partir des enveloppes de la
 * poutre.
 *
 * Par zone, a l'ELU : resistance de section (flexion, effort tranchant,
 * interaction M-V) et deversement entre maintiens lateraux ; a l'ELS : fleche
 * de l'enveloppe caracteristique comparee a une limite L / n saisie.
 *
 * Choix declares, du cote de la securite :
 * - M_Ed et V_Ed sont les maximums en valeur absolue sur la zone, pris
 *   ensemble meme s'ils ne viennent pas du meme point ni de la meme
 *   disposition des charges ;
 * - deversement avec C1 = 1 (moment uniforme, le cas le plus defavorable),
 *   charge au centre de cisaillement ; un M_cr calcule par ailleurs peut
 *   etre saisi zone par zone ;
 * - profils en I lamines du catalogue de sections-ec3, flexion autour de
 *   l'axe fort, sans effort normal.
 *
 * Unites : m pour les abscisses et les longueurs de zone, mm pour les
 * sections et les fleches, kN, kN.m, MPa.
 */

import {
  E,
  ec3Recommande,
  profilCatalogue,
  proprietes,
  verifierElement,
  type Nuance,
  type ResultatElement,
} from 'sections-ec3';
import type { Enveloppe, Zone } from './combinaisons';
import { MM_PAR_M } from './modele';

/** Poids volumique de l'acier (kN/m3), EN 1991-1-1 tableau A.4. */
export const POIDS_VOLUMIQUE_ACIER = 78.5;
/** mm2 -> m2, mm4 -> kN.m2 avec E en MPa. */
const M2_PAR_MM2 = 1e-6;
const KNM2_PAR_NMM2 = 1e-9;

export interface DonneesAcier {
  /** Nom d'un profil en I du catalogue de sections-ec3 (« IPE 300 »). */
  profil: string;
  nuance: Nuance;
  /** Par zone : longueur entre maintiens lateraux de la membrure comprimee (m) ; null = longueur de la zone. */
  L_LT: (number | null)[];
  /** Par zone : M_cr calcule par ailleurs (kN.m) ; null = expression avec C1 = 1. */
  Mcr: (number | null)[];
  /** Deversement empeche sur toute la poutre (dalle connectee, maintien continu). */
  deversementEmpeche: boolean;
  /** Fleche limite L / n : la valeur de n (300 pour L/300). */
  flecheLimite: number;
}

/** Caracteristiques du profil utiles a la poutre. */
export interface CaracteristiquesProfil {
  nom: string;
  /** Aire (mm2), inertie autour de l'axe fort (mm4). */
  A: number;
  Iy: number;
  /** Poids propre (kN/m). */
  poids: number;
  /** Rigidite de flexion E I_y (kN.m2). */
  EI: number;
}

/** Aire, inertie, poids propre et rigidite d'un profil du catalogue. */
export function caracteristiquesProfil(nom: string): CaracteristiquesProfil {
  const p = profilCatalogue(nom);
  const prop = proprietes(p);
  return {
    nom,
    A: prop.A,
    Iy: prop.Iy,
    poids: prop.A * M2_PAR_MM2 * POIDS_VOLUMIQUE_ACIER,
    EI: E * prop.Iy * KNM2_PAR_NMM2,
  };
}

export interface ZoneAcier {
  zone: Zone;
  /** Maximums en valeur absolue sur la zone, a l'ELU (kN.m, kN). */
  M_Ed: number;
  V_Ed: number;
  /** Longueur de deversement retenue (m). */
  L_LT: number;
  /** Verification de sections-ec3 ; null si elle a leve (motif dans `erreur`). */
  element: ResultatElement | null;
  erreur: string | null;
  /**
   * Taux LINEAIRES, sollicitation / resistance : M_Ed / M_y,V,Rd (section,
   * reduit par le cisaillement), V_Ed / V_pl,z,Rd, M_Ed / M_b,Rd (null si le
   * deversement est sans objet). Le critere (6.41) de sections-ec3 eleve le
   * rapport des moments au carre pour un profil en I : il ne se lit pas comme
   * un taux de travail.
   */
  tauxSection: number | null;
  tauxCisaillement: number | null;
  tauxDeversement: number | null;
  /** Fleche caracteristique maximale (mm), limite (mm), taux. */
  w: number;
  w_lim: number;
  tauxFleche: number;
}

export interface ResultatAcier {
  profil: CaracteristiquesProfil;
  zones: ZoneAcier[];
  verdict: 'conforme' | 'non-conforme' | 'incomplet';
  avertissements: string[];
}

function maxAbs(a: number, b: number): number {
  return Math.max(Math.abs(a), Math.abs(b));
}

/**
 * Verifie chaque zone de la poutre en acier.
 *
 * `elu` : enveloppe ELU fondamentale ; `caracteristique` : enveloppe ELS
 * caracteristique, pour la fleche.
 */
export function calculerAcier(zones: readonly Zone[], elu: Enveloppe, caracteristique: Enveloppe, d: DonneesAcier): ResultatAcier {
  if (!(Number.isFinite(d.flecheLimite) && d.flecheLimite > 0)) {
    throw new Error('La fleche limite L / n doit avoir un n strictement positif (-).');
  }
  const profil = caracteristiquesProfil(d.profil);
  const section = profilCatalogue(d.profil);
  const normes = ec3Recommande();
  const avertissements: string[] = [];

  const resultats = zones.map((zone, j): ZoneAcier => {
    const te = elu.travees[j];
    const tc = caracteristique.travees[j];
    if (te === undefined || tc === undefined) throw new Error(`Zone ${zone.nom} : enveloppe absente.`);
    const longueur = zone.x1 - zone.x0;
    const M_Ed = maxAbs(te.M_max.valeur, te.M_min.valeur);
    const V_Ed = maxAbs(te.V_max.valeur, te.V_min.valeur);
    const L_LT = d.L_LT[j] ?? longueur;
    const Mcr = d.Mcr[j] ?? null;
    const w = Math.abs(tc.w_max.valeur);
    const w_lim = (longueur * MM_PAR_M) / d.flecheLimite;

    let element: ResultatElement | null = null;
    let erreur: string | null = null;
    try {
      element = verifierElement(
        {
          profil: section,
          nuance: d.nuance,
          N: 0,
          My: M_Ed,
          Mz: 0,
          Vz: V_Ed,
          Vy: 0,
          // Sans effort normal, les longueurs de flambement ne servent pas.
          Lcr_y: longueur * MM_PAR_M,
          Lcr_z: longueur * MM_PAR_M,
          L_LT: L_LT * MM_PAR_M,
          deversementEmpeche: d.deversementEmpeche,
          // C1 = 1 : moment uniforme, le plus defavorable des diagrammes.
          diagrammeLT: { type: 'lineaire', psi: 1 },
          pointApplication: 'centre',
          McrSaisi: Mcr,
          diagrammeY: { type: 'lineaire', psi: 1 },
          diagrammeZ: { type: 'lineaire', psi: 1 },
        },
        normes
      );
    } catch (e) {
      erreur = e instanceof Error ? e.message : String(e);
    }
    const dev = element?.verifications.find((v) => v.nom === 'Deversement');
    return {
      zone,
      M_Ed,
      V_Ed,
      L_LT,
      element,
      erreur,
      tauxSection: element === null ? null : M_Ed / element.interaction.MN_y_Rd,
      tauxCisaillement: element === null ? null : V_Ed / element.resistances.Vz_Rd,
      tauxDeversement: dev?.applicable === true && dev.taux !== null ? dev.taux : null,
      w,
      w_lim,
      tauxFleche: w / w_lim,
    };
  });

  if (!d.deversementEmpeche) {
    avertissements.push(
      'Deversement avec C1 = 1 (moment uniforme) sur la longueur entre maintiens saisie : du cote de la securite. ' +
        'Un M_cr calcule par ailleurs peut etre saisi par zone.'
    );
  }
  avertissements.push('M_Ed et V_Ed : maximums de la zone pris ensemble pour l interaction M-V (sens de la securite).');

  const incomplet = resultats.some((z) => z.element === null);
  const refus = resultats.some(
    (z) =>
      z.element?.verdict === 'non-conforme' ||
      z.tauxFleche > 1 ||
      [z.tauxSection, z.tauxCisaillement, z.tauxDeversement].some((t) => t !== null && t > 1)
  );
  return { profil, zones: resultats, verdict: refus ? 'non-conforme' : incomplet ? 'incomplet' : 'conforme', avertissements };
}
