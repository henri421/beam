/**
 * Saisie : modele de formulaire (textes tels que tapes), lecture en donnees
 * du noyau, rendu des lignes d'appuis, de rotules et de charges, exemples et
 * fichier de modele.
 *
 * Tout ici est PUR — aucun `document`. Le cablage vit dans `main.ts`.
 */

import { echapper, lireNombre } from 'aedificium-ui';
import {
  LIBELLES_APPUI,
  LIBELLES_CHARGE,
  rigiditeFlexion,
  type Appui,
  type Charge,
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
}

export interface LigneCharge {
  type: TypeCharge;
  x: string;
  P: string;
  M: string;
  a: string;
  b: string;
  q: string;
  q_a: string;
  q_b: string;
}

export interface ModeleSaisie {
  longueur: string;
  E: string;
  I: string;
  appuis: LigneAppui[];
  rotules: string[];
  charges: LigneCharge[];
}

export type Liste = 'appuis' | 'rotules' | 'charges';

export const TYPES_APPUI: TypeAppui[] = ['appui-simple', 'encastrement', 'glissiere', 'encastrement-elastique', 'ressort'];
export const TYPES_CHARGE: TypeCharge[] = ['ponctuelle', 'repartie', 'lineaire', 'moment'];

export function nouvelAppui(x: string, type: TypeAppui = 'appui-simple'): LigneAppui {
  return { type, x, tassement: '', k_vertical: '', k_rotation: '' };
}

/** Ligne de charge neuve : reparties sur toute la longueur, intensites de 10 a ajuster. */
export function nouvelleCharge(type: TypeCharge, longueur: string): LigneCharge {
  return { type, x: '', P: '10', M: '10', a: '0', b: longueur, q: '10', q_a: '0', q_b: '10' };
}

function charge(partiel: Partial<LigneCharge> & { type: TypeCharge }): LigneCharge {
  return { x: '', P: '', M: '', a: '', b: '', q: '', q_a: '', q_b: '', ...partiel };
}

// --- Exemples ---------------------------------------------------------------------

export const EXEMPLES: Record<string, { libelle: string; modele: ModeleSaisie }> = {
  'trois-travees': {
    libelle: 'Trois travees egales, charge uniforme',
    modele: {
      longueur: '15',
      E: '30000',
      I: '312500',
      appuis: ['0', '5', '10', '15'].map((x) => nouvelAppui(x)),
      rotules: [],
      charges: [charge({ type: 'repartie', a: '0', b: '15', q: '10' })],
    },
  },
  'encastree-appuyee': {
    libelle: 'Encastree - appuyee, charge triangulaire et force',
    modele: {
      longueur: '6',
      E: '210000',
      I: '8356',
      appuis: [nouvelAppui('0', 'encastrement'), nouvelAppui('6')],
      rotules: [],
      charges: [
        charge({ type: 'lineaire', a: '0', b: '6', q_a: '0', q_b: '12' }),
        charge({ type: 'ponctuelle', x: '2', P: '20' }),
      ],
    },
  },
  'deux-consoles': {
    libelle: 'Biappuyee avec une console de chaque cote',
    modele: {
      longueur: '10',
      E: '210000',
      I: '8356',
      appuis: [nouvelAppui('2'), nouvelAppui('8')],
      rotules: [],
      charges: [charge({ type: 'repartie', a: '0', b: '10', q: '10' }), charge({ type: 'ponctuelle', x: '0', P: '5' }), charge({ type: 'ponctuelle', x: '10', P: '5' })],
    },
  },
  gerber: {
    libelle: 'Poutre Gerber (rotules), deux travees et console',
    modele: {
      longueur: '16',
      E: '210000',
      I: '23130',
      appuis: [nouvelAppui('0'), nouvelAppui('7'), nouvelAppui('14')],
      rotules: ['8.5'],
      charges: [charge({ type: 'repartie', a: '0', b: '16', q: '15' }), charge({ type: 'ponctuelle', x: '16', P: '10' })],
    },
  },
  ressorts: {
    libelle: 'Appui elastique et encastrement elastique',
    modele: {
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
    },
  },
  tassement: {
    libelle: 'Deux travees, tassement de l appui central',
    modele: {
      longueur: '12',
      E: '30000',
      I: '540000',
      appuis: [nouvelAppui('0'), { ...nouvelAppui('6'), tassement: '10' }, nouvelAppui('12')],
      rotules: [],
      charges: [charge({ type: 'repartie', a: '0', b: '12', q: '20' })],
    },
  },
};

export function modeleParDefaut(): ModeleSaisie {
  return structuredClone(EXEMPLES['trois-travees'].modele);
}

// --- Lecture ---------------------------------------------------------------------

export type Lecture = { ok: true; poutre: Poutre } | { ok: false; message: string };

class SaisieInvalide extends Error {}

function nombre(texte: string, quoi: string): number {
  const v = lireNombre(texte);
  if (v === null) throw new SaisieInvalide(`${quoi} : nombre a renseigner.`);
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
          return { type: 'ponctuelle', x: nombre(l.x, `${n}, abscisse x`), P: nombre(l.P, `${n}, force P`) };
        case 'moment':
          return { type: 'moment', x: nombre(l.x, `${n}, abscisse x`), M: nombre(l.M, `${n}, moment M`) };
        case 'repartie':
          return { type: 'repartie', a: nombre(l.a, `${n}, debut a`), b: nombre(l.b, `${n}, fin b`), q: nombre(l.q, `${n}, intensite q`) };
        case 'lineaire':
          return {
            type: 'lineaire',
            a: nombre(l.a, `${n}, debut a`),
            b: nombre(l.b, `${n}, fin b`),
            q_a: nombre(l.q_a, `${n}, intensite q_a`),
            q_b: nombre(l.q_b, `${n}, intensite q_b`),
          };
      }
    });
    return { ok: true, poutre: { longueur, EI, appuis, rotules, charges } };
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
      return `<div class="ligne">${enTete('charges', i, `C${i + 1}`, choix('charges', i, l.type, TYPES_CHARGE, LIBELLES_CHARGE))}<div class="ligne-champs">${champs.join('')}</div></div>`;
    })
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
    throw new Error('Fichier illisible : ce n est pas du JSON.');
  }
  const o = brut as { format?: unknown; modele?: Partial<Record<keyof ModeleSaisie, unknown>> };
  if (o === null || typeof o !== 'object' || o.format !== FORMAT_FICHIER || typeof o.modele !== 'object' || o.modele === null) {
    throw new Error('Ce fichier n est pas un modele de poutres-continues.');
  }
  const m = o.modele;
  const tableau = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? v.filter((e): e is Record<string, unknown> => e !== null && typeof e === 'object') : [];
  const appuis = tableau(m.appuis).map((a): LigneAppui => {
    if (!TYPES_APPUI.includes(a.type as TypeAppui)) throw new Error(`Type d appui inconnu : ${texte(a.type)}.`);
    return { type: a.type as TypeAppui, x: texte(a.x), tassement: texte(a.tassement), k_vertical: texte(a.k_vertical), k_rotation: texte(a.k_rotation) };
  });
  const charges = tableau(m.charges).map((c): LigneCharge => {
    if (!TYPES_CHARGE.includes(c.type as TypeCharge)) throw new Error(`Type de charge inconnu : ${texte(c.type)}.`);
    return charge({
      type: c.type as TypeCharge,
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
  return {
    longueur: texte(m.longueur),
    E: texte(m.E),
    I: texte(m.I),
    appuis,
    rotules: Array.isArray(m.rotules) ? m.rotules.map(texte) : [],
    charges,
  };
}
