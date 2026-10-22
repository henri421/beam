import { describe, expect, it } from 'vitest';
import {
  caracteristiquesProfil,
  calculerAcier,
  calculerCombinaisons,
  profilRecommande,
  type Charge,
  type DonneesAcier,
  type DonneesCombinaisons,
} from '../src/index';
import { appuiSimple, poutre } from './fixtures';

/**
 * Poutre metallique isostatique de 6 m, IPE 300 en S235, q_G = 10 kN/m.
 * Valeurs attendues calculees a la main.
 *
 * IPE 300 : A = 5381 mm2, I_y = 8356 cm4, W_pl,y = 628,4 cm3 (valeurs publiees ;
 * sections-ec3 les recalcule a moins de 0,5 % pres).
 *   ELU : q_d = 1,35 × 10 = 13,5 kN/m ; M_Ed = 13,5 × 36 / 8 = 60,75 kN.m ;
 *         V_Ed = 13,5 × 3 = 40,5 kN.
 *   M_pl,Rd = 628,4e3 × 235 / 1,0 = 147,7 kN.m ; taux 60,75 / 147,7 = 0,411.
 *   ELS caracteristique : w = 5 q L4 / (384 E I) = 5 × 10 × 6^4 / (384 × 210 000 × 8,356e-5)
 *         = 64 800 / 6 738,4 = 9,62 mm ; L/300 = 20 mm ; taux 0,481.
 */

const P = profilRecommande();

function comb(): DonneesCombinaisons {
  return { formule: '6.10', psi0: 0.7, psi1: 0.5, psi2: 0.3, gamma_T: 1, redistribution: [1, 1] };
}

function donnees(partiel: Partial<DonneesAcier> = {}): DonneesAcier {
  return { profil: 'IPE 300', nuance: 'S235', L_LT: [null], Mcr: [null], deversementEmpeche: true, flecheLimite: 300, ...partiel };
}

function calcul(d: DonneesAcier = donnees()) {
  const carac = caracteristiquesProfil(d.profil);
  const charges: Charge[] = [{ type: 'repartie', a: 0, b: 6, q: 10, cas: 'G' }];
  const p = { ...poutre(6, [appuiSimple(0), appuiSimple(6)], charges), EI: carac.EI };
  const r = calculerCombinaisons(p, comb(), P);
  return calculerAcier(r.cas.zones, r.elu, r.caracteristique, d);
}

describe('caracteristiques du profil', () => {
  it('IPE 300 : A, I_y, poids propre et EI', () => {
    const c = caracteristiquesProfil('IPE 300');
    expect(c.A).toBeGreaterThan(5381 * 0.995);
    expect(c.A).toBeLessThan(5381 * 1.005);
    expect(c.Iy).toBeGreaterThan(8356e4 * 0.995);
    expect(c.Iy).toBeLessThan(8356e4 * 1.005);
    // Poids : 5381e-6 × 78,5 = 0,422 kN/m.
    expect(c.poids).toBeCloseTo(0.4224, 2);
    expect(c.EI).toBeCloseTo((210000 * c.Iy) / 1e9, 6);
  });
});

describe('poutre isostatique IPE 300, S235', () => {
  it('M_Ed = 60,75 kN.m et V_Ed = 40,5 kN a l ELU', () => {
    const z = calcul().zones[0];
    expect(z.M_Ed).toBeCloseTo(60.75, 6);
    expect(z.V_Ed).toBeCloseTo(40.5, 6);
  });

  it('flexion de section : taux 60,75 / 147,7 = 0,411 (lineaire, pas le critere (6.41))', () => {
    const z = calcul().zones[0];
    expect(z.tauxSection).toBeGreaterThan(0.411 * 0.99);
    expect(z.tauxSection).toBeLessThan(0.411 * 1.01);
  });

  it('cisaillement : V_pl,Rd = A_v f_y / (√3 γ_M0), taux = 40,5 / V_pl,Rd', () => {
    // IPE 300 : A_v = 2568 mm2 (publie) ; V_pl,Rd = 2568 × 235 / √3 = 348,4 kN ; taux 0,116.
    const z = calcul().zones[0];
    expect(z.tauxCisaillement).toBeGreaterThan(0.116 * 0.98);
    expect(z.tauxCisaillement).toBeLessThan(0.116 * 1.02);
  });

  it('fleche caracteristique 9,62 mm pour une limite L/300 = 20 mm', () => {
    const z = calcul().zones[0];
    expect(z.w_lim).toBeCloseTo(20, 9);
    expect(z.w).toBeGreaterThan(9.62 * 0.99);
    expect(z.w).toBeLessThan(9.62 * 1.01);
    expect(calcul().verdict).toBe('conforme');
  });

  it('une limite L/700 = 8,57 mm rend la poutre non conforme a l ELS', () => {
    expect(calcul(donnees({ flecheLimite: 700 })).verdict).toBe('non-conforme');
  });

  it('sans maintien, le deversement sur 6 m est verifie et gouverne', () => {
    const r = calcul(donnees({ deversementEmpeche: false }));
    const z = r.zones[0];
    expect(z.tauxDeversement).not.toBeNull();
    expect(z.tauxDeversement ?? 0).toBeGreaterThan(z.tauxSection ?? 1);
    expect(r.avertissements.join(' ')).toMatch(/C1 = 1/);
  });

  it('un profil inconnu leve', () => {
    expect(() => calcul(donnees({ profil: 'IPE 333' }))).toThrow();
  });
});
