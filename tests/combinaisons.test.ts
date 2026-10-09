import { describe, expect, it } from 'vitest';
import {
  calculerCas,
  calculerCombinaisons,
  calculerPoutre,
  combinerResultats,
  libelleDisposition,
  profilRecommande,
  redistribuer,
  resultatDeDisposition,
  verifierProfil,
  type Charge,
  type DonneesCombinaisons,
} from '../src/index';
import { appuiSimple, poutre } from './fixtures';

const P = profilRecommande();

function donnees(partiel: Partial<DonneesCombinaisons> = {}): DonneesCombinaisons {
  return { formule: '6.10', psi0: 0.7, psi1: 0.5, psi2: 0.3, gamma_T: 1, redistribution: [1, 1, 1, 1], ...partiel };
}

/** Trois travees de 5 m, g = 10 kN/m et q = 5 kN/m sur toute la longueur. */
function troisTravees() {
  const charges: Charge[] = [
    { type: 'repartie', a: 0, b: 15, q: 10, cas: 'G' },
    { type: 'repartie', a: 0, b: 15, q: 5, cas: 'Q' },
  ];
  return poutre(15, [appuiSimple(0), appuiSimple(5), appuiSimple(10), appuiSimple(15)], charges);
}

// Valeurs attendues : equation des trois moments, 2^3 dispositions et les deux
// coefficients de G enumeres a part (script hors depot), puis maximum.
describe('enveloppes, trois travees egales', () => {
  const r = calculerCombinaisons(troisTravees(), donnees(), P);

  it('Q coupee aux appuis : une charge Q par travee', () => {
    expect(r.cas.Q.map((q) => q?.equilibre.charges)).toEqual([25, 25, 25]);
    expect(r.cas.G.equilibre.charges).toBe(150);
    expect(r.cas.T).toBeNull();
  });

  it('ELS caracteristique : coefficients 0,080 g + 0,101 q, -0,100 g - 0,117 q, 0,025 g + 0,075 q', () => {
    const e = r.caracteristique;
    expect(e.travees[0].M_max.valeur).toBeCloseTo(32.552083, 5);
    expect(e.travees[0].M_max.zones).toEqual([0, 2]);
    expect(e.appuis[1].M_min.valeur).toBeCloseTo(-39.583333, 5);
    expect(e.appuis[1].M_min.zones).toEqual([0, 1]);
    expect(e.travees[1].M_max.valeur).toBeCloseTo(15.625, 5);
    expect(e.travees[1].M_max.zones).toEqual([1]);
    expect(e.appuis[1].R_max.valeur).toBeCloseTo(85, 8);
    expect(e.appuis[0].R_min.valeur).toBeCloseTo(18.75, 8);
    expect(e.appuis[0].R_max.valeur).toBeCloseTo(31.25, 8);
  });

  it('ELU (6.10) : 1,35 ou 1,00 G et 1,5 Q', () => {
    const e = r.elu;
    expect(e.travees[0].M_max.valeur).toBeCloseTo(45.833705, 5);
    expect(e.appuis[1].M_min.valeur).toBeCloseTo(-55.625, 6);
    expect(e.travees[1].M_max.valeur).toBeCloseTo(22.5, 6);
    expect(e.appuis[1].R_max.valeur).toBeCloseTo(119.25, 8);
    // Le minimum de R_A vient de G favorable (1,00) avec Q sur la travee 2.
    expect(e.appuis[0].R_min.valeur).toBeCloseTo(18.125, 8);
    expect(e.combinaison.variantes[e.appuis[0].R_min.variante].G).toBe(1);
    expect(e.appuis[0].R_min.zones).toEqual([1]);
    expect(libelleDisposition(e, r.cas.zones, e.appuis[0].R_min)).toBe('(6.10) 1 G + 1.5 Q ; Q sur travee 2');
  });

  it('(6.10a)/(6.10b) : la plus defavorable des deux', () => {
    // Appui B : (6.10a) 1,35 x 10 et 1,5 x 0,7 x 5 ; (6.10b) 0,85 x 1,35 x 10 et 1,5 x 5.
    // Coefficients -0,100 (g) et -0,1167 (q), en q l2 = 25 :
    // a : -(13,5 x 2,5 + 5,25 x 2,916667) = -49,0625 ; b : -(11,475 x 2,5 + 7,5 x 2,916667) = -50,5625.
    const ab = calculerCombinaisons(troisTravees(), donnees({ formule: '6.10ab' }), P);
    expect(ab.elu.appuis[1].M_min.valeur).toBeCloseTo(-50.5625, 6);
    expect(ab.elu.combinaison.variantes[ab.elu.appuis[1].M_min.variante].nom).toContain('6.10b');
  });

  it('ELS quasi permanent : G + psi2 Q', () => {
    // -(10 x 2,5 + 0,3 x 5 x 2,916667) = -29,375
    expect(r.quasiPermanente.appuis[1].M_min.valeur).toBeCloseTo(-29.375, 6);
  });

  it('une disposition rejoue l extremum avec ses diagrammes', () => {
    const d = r.elu.travees[0].M_max;
    const res = resultatDeDisposition(r.cas, r.elu.combinaison.variantes[d.variante], d.zones);
    expect(res.travees[0].M_max.valeur).toBeCloseTo(45.833705, 5);
    expect(res.equilibre.reactions).toBeCloseTo(res.equilibre.charges, 8);
  });
});

describe('superposition et tassements', () => {
  it('la somme des cas egale le calcul direct, tassement compris', () => {
    const p = poutre(
      12,
      [{ type: 'encastrement', x: 0, tassement: 0 }, { type: 'appui-simple', x: 5, tassement: 8 }, appuiSimple(12)],
      [
        { type: 'repartie', a: 0, b: 12, q: 12, cas: 'G' },
        { type: 'lineaire', a: 2, b: 9, q_a: 3, q_b: 8, cas: 'Q' },
        { type: 'ponctuelle', x: 5, P: 30, cas: 'Q' },
        { type: 'moment', x: 10, M: 7, cas: 'Q' },
      ]
    );
    const cas = calculerCas(p);
    expect(cas.T).not.toBeNull();
    const termes = [[1, cas.G], [1, cas.T], ...cas.Q.filter((q) => q !== null).map((q) => [1, q])] as [number, never][];
    const somme = combinerResultats(p, termes);
    const direct = calculerPoutre(p);
    direct.reactions.forEach((re, i) => expect(somme.reactions[i].R).toBeCloseTo(re.R, 8));
    expect(somme.extremes.M_max.valeur).toBeCloseTo(direct.extremes.M_max.valeur, 8);
    expect(somme.extremes.w_max.valeur).toBeCloseTo(direct.extremes.w_max.valeur, 8);
  });

  it('le tassement est pris ou non, le pire des deux', () => {
    const p = poutre(8, [appuiSimple(0), { type: 'appui-simple', x: 4, tassement: 10 }, appuiSimple(8)], []);
    const r = calculerCombinaisons(p, donnees({ redistribution: [1, 1, 1], gamma_T: 1.2 }), P);
    // R_B = -46,875 kN sous le tassement seul (6 EI delta / l3), x 1,2.
    expect(r.elu.appuis[1].R_min.valeur).toBeCloseTo(-56.25, 8);
    expect(r.elu.appuis[1].R_max.valeur).toBeCloseTo(0, 8);
  });
});

describe('redistribution', () => {
  it('delta = 0,8 sur l appui B : moment reduit, equilibre conserve', () => {
    const p = troisTravees();
    const cas = calculerCas(p);
    const G = redistribuer(cas.G, [1, 0.8, 1, 1], cas.zones);
    // M_B(G) = -0,1 x 10 x 25 = -25 -> -20 ; M_C inchange.
    expect(G.reactions[1].M_gauche).toBeCloseTo(-20, 8);
    expect(G.reactions[2].M_gauche).toBeCloseTo(-25, 8);
    // Travee 1 : R_A = 25 - 20/5 = 21 ; somme des reactions inchangee.
    expect(G.reactions[0].R).toBeCloseTo(21, 8);
    expect(G.equilibre.reactions).toBeCloseTo(150, 8);
  });

  it('ELU redistribue, ELS non', () => {
    const r = calculerCombinaisons(troisTravees(), donnees({ redistribution: [1, 0.85, 1, 1] }), P);
    expect(r.elu.appuis[1].M_min.valeur).toBeCloseTo(-55.625 * 0.85, 6);
    expect(r.caracteristique.appuis[1].M_min.valeur).toBeCloseTo(-39.583333, 5);
  });

  it('controles du §5.5(4)', () => {
    expect(() => calculerCombinaisons(troisTravees(), donnees({ redistribution: [1, 0.6, 1, 1] }), P)).toThrow(/minimum 0.7/);
    expect(() => calculerCombinaisons(troisTravees(), donnees({ redistribution: [0.9, 1, 1, 1] }), P)).toThrow(/intermediaires/);
    const inegales = poutre(15, [appuiSimple(0), appuiSimple(2), appuiSimple(15)], [{ type: 'repartie', a: 0, b: 15, q: 1 }]);
    expect(() => calculerCombinaisons(inegales, donnees({ redistribution: [1, 0.9, 1] }), P)).toThrow(/rapport des portees/);
  });
});

describe('profil', () => {
  it('une valeur sans source bloque le calcul', () => {
    const p = profilRecommande();
    p.gamma_Q = { valeur: 1.5, source: ' ' };
    expect(() => verifierProfil(p)).toThrow(/gamma_Q n a pas de source/);
  });
});
