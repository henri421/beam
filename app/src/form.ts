/**
 * Saisie : modele de formulaire (textes tels que tapes), lecture en donnees
 * du noyau, rendu des lignes d'appuis, de rotules et de charges, exemples et
 * fichier de modele.
 *
 * Tout ici est PUR — aucun `document`. Le cablage vit dans `main.ts`.
 */

import { echapper, lireNombre, nombreAffiche } from 'aedificium-ui';
import { familles, type Nuance } from 'sections-ec3';
import {
  caracteristiquesProfil,
  LIBELLES_APPUI,
  LIBELLES_CAS,
  LIBELLES_CHARGE,
  lireLit,
  rigiditeFlexion,
  zonesDeChargement,
  type Appui,
  type CasDeCharge,
  type Charge,
  type DonneesAcier,
  type DonneesBA,
  type DonneesCombinaisons,
  type Formule,
  type Poutre,
  type TypeAppui,
  type TypeCharge,
} from '../../src/index';

export interface LigneAppui {
  type: TypeAppui;
  x: string;
  tassement: string;
  k_vertical: string;
  k_rotation: string;
  /** Coefficient de redistribution delta (beton arme), vide = 1. */
  delta: string;
}

export interface LigneCharge {
  type: TypeCharge;
  cas: CasDeCharge;
  x: string;
  P: string;
  M: string;
  a: string;
  b: string;
  q: string;
  q_a: string;
  q_b: string;
}

export interface SaisieCombinaisons {
  formule: Formule;
  psi0: string;
  psi1: string;
  psi2: string;
  gamma_T: string;
}

export interface SaisieBA {
  actif: boolean;
  forme: 'rectangle' | 'te';
  b_w: string;
  h: string;
  b_eff: string;
  h_f: string;
  fck: string;
  fyk: string;
  classe: 'A' | 'B' | 'C';
  a_inf: string;
  a_sup: string;
  cotTheta: string;
  cadre_phi: string;
  cadre_brins: string;
  cadre_s: string;
  largeurAppui: string;
  monolithique: boolean;
  montage: string;
  /** Par zone (travee ou console), dans l'ordre des abscisses. */
  zones: { filants: string; renforts: string }[];
  /** Par appui, dans l'ordre de saisie. */
  chapeaux: string[];
}

export interface SaisieAcier {
  actif: boolean;
  /** Profil en I du catalogue de sections-ec3. */
  profil: string;
  nuance: Nuance;
  /** Deversement empeche sur toute la poutre. */
  empeche: boolean;
  /** n de la fleche limite L / n. */
  flecheLimite: string;
  /** Ajoute le poids propre du profil aux charges G. */
  poidsPropre: boolean;
  /** Par zone : longueur entre maintiens (m, vide = longueur de la zone) et M_cr saisi (kN.m, vide = C1 = 1). */
  zones: { L_LT: string; Mcr: string }[];
}

export interface ModeleSaisie {
  longueur: string;
  E: string;
  I: string;
  appuis: LigneAppui[];
  rotules: string[];
  charges: LigneCharge[];
  combinaisons: SaisieCombinaisons;
  ba: SaisieBA;
  acier: SaisieAcier;
}

export const NUANCES: readonly Nuance[] = ['S235', 'S275', 'S355', 'S420', 'S460'];

/** Les profils en I lamines du catalogue, par famille. */
export function profilsEnI(): { famille: string; noms: string[] }[] {
  return familles()
    .filter((f) => f.type === 'I-lamine')
    .map((f) => ({ famille: f.famille, noms: f.noms }));
}

export function acierParDefaut(): SaisieAcier {
  return { actif: false, profil: 'IPE 300', nuance: 'S235', empeche: false, flecheLimite: '300', poidsPropre: true, zones: [] };
}

export function combinaisonsParDefaut(): SaisieCombinaisons {
  // psi de la categorie A (habitation), tableau A1.1 : a adapter a l'usage.
  return { formule: '6.10', psi0: '0.7', psi1: '0.5', psi2: '0.3', gamma_T: '1' };
}

export function baParDefaut(): SaisieBA {
  return {
    actif: false,
    forme: 'rectangle',
    b_w: '300',
    h: '500',
    b_eff: '1000',
    h_f: '150',
    fck: '25',
    fyk: '500',
    classe: 'B',
    a_inf: '50',
    a_sup: '50',
    cotTheta: '2.5',
    cadre_phi: '8',
    cadre_brins: '2',
    cadre_s: '200',
    largeurAppui: '200',
    monolithique: false,
    montage: '2HA12',
    zones: [],
    chapeaux: [],
  };
}

export type Liste = 'appuis' | 'rotules' | 'charges';

export const TYPES_APPUI: TypeAppui[] = ['appui-simple', 'encastrement', 'glissiere', 'encastrement-elastique', 'ressort'];
export const TYPES_CHARGE: TypeCharge[] = ['ponctuelle', 'repartie', 'lineaire', 'moment'];

export function nouvelAppui(x: string, type: TypeAppui = 'appui-simple'): LigneAppui {
  return { type, x, tassement: '', k_vertical: '', k_rotation: '', delta: '' };
}

/** Ligne de charge neuve : reparties sur toute la longueur, intensites de 10 a ajuster. */
export function nouvelleCharge(type: TypeCharge, longueur: string): LigneCharge {
  return { type, cas: 'G', x: '', P: '10', M: '10', a: '0', b: longueur, q: '10', q_a: '0', q_b: '10' };
}

function charge(partiel: Partial<LigneCharge> & { type: TypeCharge }): LigneCharge {
  return { cas: 'G', x: '', P: '', M: '', a: '', b: '', q: '', q_a: '', q_b: '', ...partiel };
}

function exemple(m: Omit<ModeleSaisie, 'combinaisons' | 'ba' | 'acier'> & { ba?: Partial<SaisieBA>; acier?: Partial<SaisieAcier> }): ModeleSaisie {
  return { ...m, combinaisons: combinaisonsParDefaut(), ba: { ...baParDefaut(), ...m.ba }, acier: { ...acierParDefaut(), ...m.acier } };
}

// --- Exemples ---------------------------------------------------------------------

export const EXEMPLES: Record<string, { libelle: string; modele: ModeleSaisie }> = {
  'ba-trois-travees': {
    libelle: 'Poutre BA trois travées, G + Q, ferraillage',
    modele: exemple({
      longueur: '16',
      E: '31000',
      I: '540000',
      appuis: ['0', '5', '11', '16'].map((x) => nouvelAppui(x)),
      rotules: [],
      charges: [
        charge({ type: 'repartie', cas: 'G', a: '0', b: '16', q: '25' }),
        charge({ type: 'repartie', cas: 'Q', a: '0', b: '16', q: '15' }),
      ],
      ba: {
        actif: true,
        h: '600',
        zones: [
          { filants: '3HA12', renforts: '2HA14' },
          { filants: '3HA12', renforts: '2HA12' },
          { filants: '3HA12', renforts: '2HA14' },
        ],
        chapeaux: ['', '3HA16', '3HA16', ''],
      },
    }),
  },
  'trois-travees': {
    libelle: 'Trois travées égales, charge uniforme',
    modele: exemple({
      longueur: '15',
      E: '30000',
      I: '312500',
      appuis: ['0', '5', '10', '15'].map((x) => nouvelAppui(x)),
      rotules: [],
      charges: [charge({ type: 'repartie', a: '0', b: '15', q: '10' })],
    }),
  },
  'deux-consoles': {
    libelle: 'Biappuyée avec une console de chaque côté',
    modele: exemple({
      longueur: '10',
      E: '210000',
      I: '8356',
      appuis: [nouvelAppui('2'), nouvelAppui('8')],
      rotules: [],
      charges: [
        charge({ type: 'repartie', a: '0', b: '10', q: '10' }),
        charge({ type: 'repartie', cas: 'Q', a: '0', b: '10', q: '5' }),
        charge({ type: 'ponctuelle', x: '0', P: '5' }),
        charge({ type: 'ponctuelle', x: '10', P: '5' }),
      ],
    }),
  },
  'encastree-appuyee': {
    libelle: 'Encastrée - appuyée, charge triangulaire et force',
    modele: exemple({
      longueur: '6',
      E: '210000',
      I: '8356',
      appuis: [nouvelAppui('0', 'encastrement'), nouvelAppui('6')],
      rotules: [],
      charges: [
        charge({ type: 'lineaire', a: '0', b: '6', q_a: '0', q_b: '12' }),
        charge({ type: 'ponctuelle', cas: 'Q', x: '2', P: '20' }),
      ],
    }),
  },
  gerber: {
    libelle: 'Poutre Gerber (rotules), deux travées et console',
    modele: exemple({
      longueur: '16',
      E: '210000',
      I: '23130',
      appuis: [nouvelAppui('0'), nouvelAppui('7'), nouvelAppui('14')],
      rotules: ['8.5'],
      charges: [charge({ type: 'repartie', a: '0', b: '16', q: '15' }), charge({ type: 'ponctuelle', cas: 'Q', x: '16', P: '10' })],
    }),
  },
  ressorts: {
    libelle: 'Appui élastique et encastrement élastique',
    modele: exemple({
      longueur: '12',
      E: '30000',
      I: '540000',
      appuis: [
        { ...nouvelAppui('0', 'encastrement-elastique'), k_rotation: '20000' },
        { ...nouvelAppui('6', 'ressort'), k_vertical: '15000' },
        nouvelAppui('12'),
      ],
      rotules: [],
      charges: [charge({ type: 'repartie', a: '0', b: '12', q: '25' }), charge({ type: 'moment', x: '12', M: '-30' })],
    }),
  },
  tassement: {
    libelle: "Deux travées, tassement de l'appui central",
    modele: exemple({
      longueur: '12',
      E: '30000',
      I: '540000',
      appuis: [nouvelAppui('0'), { ...nouvelAppui('6'), tassement: '10' }, nouvelAppui('12')],
      rotules: [],
      charges: [charge({ type: 'repartie', a: '0', b: '12', q: '20' })],
    }),
  },
};

export function modeleParDefaut(): ModeleSaisie {
  return structuredClone(EXEMPLES['ba-trois-travees'].modele);
}

// --- Lecture ---------------------------------------------------------------------

export type Lecture = { ok: true; poutre: Poutre } | { ok: false; message: string };

class SaisieInvalide extends Error {}

function nombre(texte: string, quoi: string): number {
  const v = lireNombre(texte);
  if (v === null) throw new SaisieInvalide(`${quoi} : nombre à renseigner.`);
  return v;
}

function nombreOuZero(texte: string, quoi: string): number {
  return texte.trim() === '' ? 0 : nombre(texte, quoi);
}

/**
 * Donnees du noyau depuis la saisie. Une saisie illisible rend un message ;
 * la coherence (positions, mecanismes) reste l'affaire du noyau.
 */
export function poutreDepuisModele(m: ModeleSaisie): Lecture {
  try {
    const longueur = nombre(m.longueur, 'Longueur L');
    const E = nombre(m.E, 'Module E');
    const I = nombre(m.I, 'Inertie I');
    const EI = rigiditeFlexion(E, I);
    const appuis = m.appuis.map((l, i): Appui => {
      const n = `Appui ${i + 1}`;
      const x = nombre(l.x, `${n}, abscisse x`);
      switch (l.type) {
        case 'appui-simple':
        case 'encastrement':
          return { type: l.type, x, tassement: nombreOuZero(l.tassement, `${n}, tassement`) };
        case 'glissiere':
          return { type: 'glissiere', x };
        case 'encastrement-elastique':
          return {
            type: 'encastrement-elastique',
            x,
            tassement: nombreOuZero(l.tassement, `${n}, tassement`),
            k_rotation: nombre(l.k_rotation, `${n}, raideur en rotation`),
          };
        case 'ressort':
          return {
            type: 'ressort',
            x,
            k_vertical: nombreOuZero(l.k_vertical, `${n}, raideur verticale`),
            k_rotation: nombreOuZero(l.k_rotation, `${n}, raideur en rotation`),
          };
      }
    });
    const rotules = m.rotules.map((r, i) => nombre(r, `Rotule ${i + 1}, abscisse x`));
    const charges = m.charges.map((l, i): Charge => {
      const n = `Charge ${i + 1}`;
      switch (l.type) {
        case 'ponctuelle':
          return { type: 'ponctuelle', x: nombre(l.x, `${n}, abscisse x`), P: nombre(l.P, `${n}, force P`), cas: l.cas };
        case 'moment':
          return { type: 'moment', x: nombre(l.x, `${n}, abscisse x`), M: nombre(l.M, `${n}, moment M`), cas: l.cas };
        case 'repartie':
          return { type: 'repartie', a: nombre(l.a, `${n}, début a`), b: nombre(l.b, `${n}, fin b`), q: nombre(l.q, `${n}, intensité q`), cas: l.cas };
        case 'lineaire':
          return {
            type: 'lineaire',
            a: nombre(l.a, `${n}, début a`),
            b: nombre(l.b, `${n}, fin b`),
            q_a: nombre(l.q_a, `${n}, intensité q_a`),
            q_b: nombre(l.q_b, `${n}, intensité q_b`),
            cas: l.cas,
          };
      }
    });
    return { ok: true, poutre: { longueur, EI, appuis, rotules, charges } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Ajuste les listes de ferraillage au nombre de zones et d'appuis courant. */
export function ajusterFerraillage(m: ModeleSaisie, nbZones: number): void {
  while (m.ba.zones.length < nbZones) m.ba.zones.push({ filants: '', renforts: '' });
  m.ba.zones.length = nbZones;
  while (m.acier.zones.length < nbZones) m.acier.zones.push({ L_LT: '', Mcr: '' });
  m.acier.zones.length = nbZones;
  while (m.ba.chapeaux.length < m.appuis.length) m.ba.chapeaux.push('');
  m.ba.chapeaux.length = m.appuis.length;
}

export type LectureComplete =
  | { ok: true; poutre: Poutre; combinaisons: DonneesCombinaisons; ba: DonneesBA | null; acier: DonneesAcier | null }
  | { ok: false; message: string };

/**
 * Poutre en acier : EI tire du profil (E = 210 000 MPa, I_y), et poids propre
 * ajoute aux charges G sur toute la longueur si demande. Les champs E et I de
 * la saisie sont alors ignores.
 */
function poutreAcier(p: Poutre, a: SaisieAcier): Poutre {
  const c = caracteristiquesProfil(a.profil);
  const charges: Charge[] = a.poidsPropre ? [...p.charges, { type: 'repartie', a: 0, b: p.longueur, q: c.poids, cas: 'G' }] : p.charges;
  return { ...p, EI: c.EI, charges };
}

/**
 * Toutes les donnees du calcul : poutre, combinaisons et, si le beton arme
 * est active, section, materiaux et aciers choisis.
 */
export function donneesDepuisModele(m: ModeleSaisie): LectureComplete {
  const lecture = poutreDepuisModele(m);
  if (!lecture.ok) return lecture;
  try {
    const c = m.combinaisons;
    const combinaisons: DonneesCombinaisons = {
      formule: c.formule,
      psi0: nombre(c.psi0, 'psi_0'),
      psi1: nombre(c.psi1, 'psi_1'),
      psi2: nombre(c.psi2, 'psi_2'),
      gamma_T: nombre(c.gamma_T, 'gamma des tassements'),
      redistribution: m.ba.actif ? m.appuis.map((a, i) => (a.delta.trim() === '' ? 1 : nombre(a.delta, `Appui ${i + 1}, delta`))) : m.appuis.map(() => 1),
    };
    if (m.ba.actif && m.acier.actif) throw new SaisieInvalide('Choisir béton armé OU acier, pas les deux.');
    if (m.acier.actif) {
      const a = m.acier;
      ajusterFerraillage(m, zonesDeChargement(lecture.poutre).length);
      const optionnel = (t: string, quoi: string): number | null => (t.trim() === '' ? null : nombre(t, quoi));
      let poutre: Poutre;
      try {
        poutre = poutreAcier(lecture.poutre, a);
      } catch (e) {
        throw new SaisieInvalide(`Profil ${a.profil} : ${e instanceof Error ? e.message : String(e)}`);
      }
      const acier: DonneesAcier = {
        profil: a.profil,
        nuance: a.nuance,
        L_LT: a.zones.map((z, j) => optionnel(z.L_LT, `Zone ${j + 1}, longueur entre maintiens`)),
        Mcr: a.zones.map((z, j) => optionnel(z.Mcr, `Zone ${j + 1}, M_cr`)),
        deversementEmpeche: a.empeche,
        flecheLimite: nombre(a.flecheLimite, 'Flèche limite L / n'),
      };
      return { ok: true, poutre, combinaisons, ba: null, acier };
    }
    if (!m.ba.actif) return { ok: true, poutre: lecture.poutre, combinaisons, ba: null, acier: null };
    const b = m.ba;
    const nbZones = zonesDeChargement(lecture.poutre).length;
    ajusterFerraillage(m, nbZones);
    const lit = (t: string, quoi: string) => {
      try {
        return lireLit(t);
      } catch (e) {
        throw new SaisieInvalide(`${quoi} : ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    const ba: DonneesBA = {
      section: {
        forme: b.forme,
        b_w: nombre(b.b_w, "Largeur d'âme b_w"),
        h: nombre(b.h, 'Hauteur h'),
        b_eff: b.forme === 'te' ? nombre(b.b_eff, 'Largeur de table b_eff') : nombre(b.b_w, "Largeur d'âme b_w"),
        h_f: b.forme === 'te' ? nombre(b.h_f, 'Épaisseur de table h_f') : 0,
      },
      fck: nombre(b.fck, 'f_ck'),
      fyk: nombre(b.fyk, 'f_yk'),
      classeAcier: b.classe,
      a_inf: nombre(b.a_inf, 'a_inf'),
      a_sup: nombre(b.a_sup, 'a_sup'),
      cotTheta: nombre(b.cotTheta, 'cot theta'),
      cadres: { phi: nombre(b.cadre_phi, 'Diamètre des cadres'), brins: nombre(b.cadre_brins, 'Nombre de brins'), s: nombre(b.cadre_s, 'Espacement des cadres') },
      largeurAppui: nombreOuZero(b.largeurAppui, 'Largeur des appuis'),
      extremitesMonolithiques: b.monolithique,
      aciers: {
        zones: b.zones.map((z, j) => ({ filants: lit(z.filants, `Zone ${j + 1}, filants`), renforts: lit(z.renforts, `Zone ${j + 1}, renforts`) })),
        appuis: b.chapeaux.map((t, i) => ({ chapeaux: lit(t, `Appui ${i + 1}, chapeaux`) })),
        montage: lit(b.montage, 'Aciers de montage'),
      },
    };
    return { ok: true, poutre: lecture.poutre, combinaisons, ba, acier: null };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

// --- Rendu des lignes ----------------------------------------------------------------

function champ(liste: Liste, i: number, nom: string, libelle: string, valeur: string, indication = ''): string {
  return (
    `<label class="champ"><span>${libelle}</span>` +
    `<input type="text" inputmode="decimal" data-liste="${liste}" data-index="${i}" data-champ="${nom}" ` +
    `value="${echapper(valeur)}"${indication === '' ? '' : ` placeholder="${echapper(indication)}"`} /></label>`
  );
}

function choix(liste: Liste, i: number, valeur: string, options: string[], libelles: Record<string, string>): string {
  const opts = options
    .map((o) => `<option value="${o}"${o === valeur ? ' selected' : ''}>${echapper(libelles[o])}</option>`)
    .join('');
  return `<select data-liste="${liste}" data-index="${i}" data-champ="type" aria-label="type">${opts}</select>`;
}

function enTete(liste: Liste, i: number, titre: string, select: string): string {
  return (
    `<div class="ligne-tete"><span class="ligne-num">${titre}</span>${select}` +
    `<button type="button" class="retirer" data-action="retirer" data-liste="${liste}" data-index="${i}" ` +
    `aria-label="retirer ${titre}" title="retirer">&times;</button></div>`
  );
}

export function lignesAppuis(m: ModeleSaisie): string {
  return m.appuis
    .map((l, i) => {
      const champs = [champ('appuis', i, 'x', 'x (m)', l.x)];
      if (l.type === 'appui-simple' || l.type === 'encastrement' || l.type === 'encastrement-elastique') {
        champs.push(champ('appuis', i, 'tassement', 'tassement (mm, &darr;+)', l.tassement, '0'));
      }
      if (l.type === 'ressort') champs.push(champ('appuis', i, 'k_vertical', 'k<sub>v</sub> (kN/m)', l.k_vertical, '0'));
      if (l.type === 'ressort' || l.type === 'encastrement-elastique') {
        champs.push(champ('appuis', i, 'k_rotation', 'k<sub>&theta;</sub> (kN&middot;m/rad)', l.k_rotation, l.type === 'ressort' ? '0' : ''));
      }
      if (m.ba.actif) champs.push(champ('appuis', i, 'delta', '&delta; redistribution', l.delta, '1'));
      return `<div class="ligne">${enTete('appuis', i, `A${i + 1}`, choix('appuis', i, l.type, TYPES_APPUI, LIBELLES_APPUI))}<div class="ligne-champs">${champs.join('')}</div></div>`;
    })
    .join('');
}

export function lignesRotules(m: ModeleSaisie): string {
  return m.rotules
    .map(
      (x, i) =>
        `<div class="ligne">${enTete('rotules', i, `R${i + 1}`, '<span class="ligne-type">rotule interne</span>')}<div class="ligne-champs">${champ('rotules', i, 'x', 'x (m)', x)}</div></div>`
    )
    .join('');
}

export function lignesCharges(m: ModeleSaisie): string {
  return m.charges
    .map((l, i) => {
      const c = (nom: keyof LigneCharge, lib: string): string => champ('charges', i, nom, lib, l[nom]);
      const champs =
        l.type === 'ponctuelle'
          ? [c('x', 'x (m)'), c('P', 'P (kN, &darr;+)')]
          : l.type === 'moment'
            ? [c('x', 'x (m)'), c('M', 'M (kN&middot;m, &#8634;+)')]
            : l.type === 'repartie'
              ? [c('a', 'de a (m)'), c('b', 'a b (m)'), c('q', 'q (kN/m, &darr;+)')]
              : [c('a', 'de a (m)'), c('b', 'a b (m)'), c('q_a', 'q<sub>a</sub> (kN/m)'), c('q_b', 'q<sub>b</sub> (kN/m)')];
      const cas =
        `<select data-liste="charges" data-index="${i}" data-champ="cas" aria-label="cas de charge" class="choix-cas">` +
        (['G', 'Q'] as CasDeCharge[]).map((k) => `<option value="${k}" title="${LIBELLES_CAS[k]}"${k === l.cas ? ' selected' : ''}>${k}</option>`).join('') +
        `</select>`;
      return `<div class="ligne">${enTete('charges', i, `C${i + 1}`, cas + choix('charges', i, l.type, TYPES_CHARGE, LIBELLES_CHARGE))}<div class="ligne-champs">${champs.join('')}</div></div>`;
    })
    .join('');
}

/** Lignes des aciers choisis : une par zone (inferieurs), une par appui (chapeaux). */
export function lignesFerraillage(m: ModeleSaisie, zones: { nom: string; x0: number; x1: number }[], xsAppuis: number[]): string {
  const texte = (liste: string, i: number, nom: string, lib: string, valeur: string): string =>
    `<label class="champ"><span>${lib}</span><input type="text" data-liste="${liste}" data-index="${i}" data-champ="${nom}" ` +
    `value="${echapper(valeur)}" placeholder="3HA16" /></label>`;
  const z = zones
    .map(
      (zone, j) =>
        `<div class="ligne"><div class="ligne-tete"><span class="ligne-num">${echapper(zone.nom)}</span>` +
        `<span class="ligne-type">${nombreAffiche(zone.x0)} – ${nombreAffiche(zone.x1)} m, aciers inférieurs</span></div><div class="ligne-champs">` +
        texte('ferraillage', j, 'filants', 'filants', m.ba.zones[j]?.filants ?? '') +
        texte('ferraillage', j, 'renforts', 'renforts', m.ba.zones[j]?.renforts ?? '') +
        `</div></div>`
    )
    .join('');
  const a = xsAppuis
    .map(
      (x, i) =>
        `<div class="ligne"><div class="ligne-tete"><span class="ligne-num">A${i + 1}</span>` +
        `<span class="ligne-type">x = ${nombreAffiche(x)} m, aciers supérieurs</span></div><div class="ligne-champs">` +
        texte('chapeaux', i, 'chapeaux', 'chapeaux', m.ba.chapeaux[i] ?? '') +
        `</div></div>`
    )
    .join('');
  return z + a;
}

/** Lignes de la poutre en acier : par zone, longueur entre maintiens et M_cr facultatif. */
export function lignesAcier(m: ModeleSaisie, zones: { nom: string; x0: number; x1: number }[]): string {
  const champ = (j: number, nom: string, lib: string, valeur: string, indication: string): string =>
    `<label class="champ"><span>${lib}</span><input type="text" inputmode="decimal" data-liste="acier" data-index="${j}" data-champ="${nom}" ` +
    `value="${echapper(valeur)}" placeholder="${echapper(indication)}" /></label>`;
  return zones
    .map(
      (zone, j) =>
        `<div class="ligne"><div class="ligne-tete"><span class="ligne-num">${echapper(zone.nom)}</span>` +
        `<span class="ligne-type">${nombreAffiche(zone.x0)} – ${nombreAffiche(zone.x1)} m</span></div><div class="ligne-champs">` +
        champ(j, 'L_LT', 'Longueur entre maintiens (m)', m.acier.zones[j]?.L_LT ?? '', nombreAffiche(zone.x1 - zone.x0)) +
        champ(j, 'Mcr', 'M_cr (kN.m)', m.acier.zones[j]?.Mcr ?? '', 'C1 = 1') +
        `</div></div>`
    )
    .join('');
}

// --- Fichier de modele -------------------------------------------------------------

export const FORMAT_FICHIER = 'poutres-continues';

export function modeleEnJson(m: ModeleSaisie): string {
  return JSON.stringify({ format: FORMAT_FICHIER, version: 1, modele: m }, null, 2);
}

function texte(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
}

/**
 * Modele depuis un fichier enregistre. Un champ absent devient vide ; un type
 * inconnu fait refuser le fichier plutot que d'etre remplace en silence.
 */
export function modeleDepuisJson(contenu: string): ModeleSaisie {
  let brut: unknown;
  try {
    brut = JSON.parse(contenu);
  } catch {
    throw new Error("Fichier illisible : ce n'est pas du JSON.");
  }
  const o = brut as { format?: unknown; modele?: Partial<Record<keyof ModeleSaisie, unknown>> };
  if (o === null || typeof o !== 'object' || o.format !== FORMAT_FICHIER || typeof o.modele !== 'object' || o.modele === null) {
    throw new Error("Ce fichier n'est pas un modèle de poutres-continues.");
  }
  const m = o.modele;
  const tableau = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? v.filter((e): e is Record<string, unknown> => e !== null && typeof e === 'object') : [];
  const appuis = tableau(m.appuis).map((a): LigneAppui => {
    if (!TYPES_APPUI.includes(a.type as TypeAppui)) throw new Error(`Type d'appui inconnu : ${texte(a.type)}.`);
    return {
      type: a.type as TypeAppui,
      x: texte(a.x),
      tassement: texte(a.tassement),
      k_vertical: texte(a.k_vertical),
      k_rotation: texte(a.k_rotation),
      delta: texte(a.delta),
    };
  });
  const charges = tableau(m.charges).map((c): LigneCharge => {
    if (!TYPES_CHARGE.includes(c.type as TypeCharge)) throw new Error(`Type de charge inconnu : ${texte(c.type)}.`);
    return charge({
      type: c.type as TypeCharge,
      cas: c.cas === 'Q' ? 'Q' : 'G',
      x: texte(c.x),
      P: texte(c.P),
      M: texte(c.M),
      a: texte(c.a),
      b: texte(c.b),
      q: texte(c.q),
      q_a: texte(c.q_a),
      q_b: texte(c.q_b),
    });
  });
  const objet = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {});
  const cDef = combinaisonsParDefaut();
  const c = objet(m.combinaisons);
  const bDef = baParDefaut();
  const b = objet(m.ba);
  // Fichier anterieur a l'option acier : bloc absent, acier inactif.
  const aDef = acierParDefaut();
  const ac = objet(m.acier);
  const t = (v: unknown, def: string): string => (v === undefined ? def : texte(v));
  return {
    longueur: texte(m.longueur),
    E: texte(m.E),
    I: texte(m.I),
    appuis,
    rotules: Array.isArray(m.rotules) ? m.rotules.map(texte) : [],
    charges,
    combinaisons: {
      formule: c.formule === '6.10ab' ? '6.10ab' : '6.10',
      psi0: t(c.psi0, cDef.psi0),
      psi1: t(c.psi1, cDef.psi1),
      psi2: t(c.psi2, cDef.psi2),
      gamma_T: t(c.gamma_T, cDef.gamma_T),
    },
    ba: {
      actif: b.actif === true,
      forme: b.forme === 'te' ? 'te' : 'rectangle',
      b_w: t(b.b_w, bDef.b_w),
      h: t(b.h, bDef.h),
      b_eff: t(b.b_eff, bDef.b_eff),
      h_f: t(b.h_f, bDef.h_f),
      fck: t(b.fck, bDef.fck),
      fyk: t(b.fyk, bDef.fyk),
      classe: b.classe === 'A' || b.classe === 'C' ? b.classe : 'B',
      a_inf: t(b.a_inf, bDef.a_inf),
      a_sup: t(b.a_sup, bDef.a_sup),
      cotTheta: t(b.cotTheta, bDef.cotTheta),
      cadre_phi: t(b.cadre_phi, bDef.cadre_phi),
      cadre_brins: t(b.cadre_brins, bDef.cadre_brins),
      cadre_s: t(b.cadre_s, bDef.cadre_s),
      largeurAppui: t(b.largeurAppui, bDef.largeurAppui),
      monolithique: b.monolithique === true,
      montage: t(b.montage, bDef.montage),
      zones: tableau(b.zones).map((z) => ({ filants: texte(z.filants), renforts: texte(z.renforts) })),
      chapeaux: Array.isArray(b.chapeaux) ? b.chapeaux.map(texte) : [],
    },
    acier: {
      actif: ac.actif === true,
      profil: typeof ac.profil === 'string' && ac.profil !== '' ? ac.profil : aDef.profil,
      nuance: NUANCES.includes(ac.nuance as Nuance) ? (ac.nuance as Nuance) : aDef.nuance,
      empeche: ac.empeche === true,
      flecheLimite: t(ac.flecheLimite, aDef.flecheLimite),
      poidsPropre: ac.poidsPropre !== false,
      zones: tableau(ac.zones).map((z) => ({ L_LT: texte(z.L_LT), Mcr: texte(z.Mcr) })),
    },
  };
}
