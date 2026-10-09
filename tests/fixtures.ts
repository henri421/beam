/**
 * Fabriques des cas de reference. EI = 50 000 kN.m2 sauf mention contraire.
 */

import type { Appui, Charge, Poutre } from '../src/index';

export const EI_REFERENCE = 50000;

export function poutre(longueur: number, appuis: Appui[], charges: Charge[], rotules: number[] = []): Poutre {
  return { longueur, EI: EI_REFERENCE, appuis, rotules, charges };
}

export function appuiSimple(x: number): Appui {
  return { type: 'appui-simple', x, tassement: 0 };
}

export function encastrement(x: number): Appui {
  return { type: 'encastrement', x, tassement: 0 };
}

export function uniforme(a: number, b: number, q: number): Charge {
  return { type: 'repartie', a, b, q };
}
