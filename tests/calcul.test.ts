import { describe, expect, it } from 'vitest';
import { calculerPoutre, momentFlechissant, type Charge, type Poutre, type ResultatPoutre } from '../src/index';
import { appuiSimple, encastrement, poutre, uniforme } from './fixtures';

/** Moment flechissant en x, pris dans le troncon qui contient x (a droite d'un noeud). */
function M(r: ResultatPoutre, x: number): number {
  const t = r.troncons.find((t) => x >= t.x0 - 1e-9 && x < t.x1 - 1e-9) ?? r.troncons[r.troncons.length - 1];
  return momentFlechissant(t, x - t.x0);
}

/** Equilibre en moment autour de l'origine (kN.m), charges et reactions comprises. */
function momentResultant(p: Poutre, r: ResultatPoutre): number {
  let s = 0;
  const charge = (c: Charge): number => {
    switch (c.type) {
      case 'ponctuelle':
        return -c.P * c.x;
      case 'moment':
        return c.M;
      case 'repartie':
        return -c.q * (c.b - c.a) * ((c.a + c.b) / 2);
      case 'lineaire': {
        const l = c.b - c.a;
        const F1 = (c.q_a * l) / 2;
        const F2 = (c.q_b * l) / 2;
        return -F1 * (c.a + l / 3) - F2 * (c.a + (2 * l) / 3);
      }
    }
  };
  for (const c of p.charges) s += charge(c);
  r.reactions.forEach((re) => (s += re.R * re.appui.x + re.M_reaction));
  return s;
}

describe('poutres isostatiques', () => {
  it('travee simplement appuyee sous charge uniforme : qL/2, qL2/8, 5qL4/384EI', () => {
    const r = calculerPoutre(poutre(6, [appuiSimple(0), appuiSimple(6)], [uniforme(0, 6, 10)]));
    expect(r.degreHyperstatique).toBe(0);
    expect(r.reactions[0].R).toBeCloseTo(30, 9);
    expect(r.reactions[1].R).toBeCloseTo(30, 9);
    expect(r.extremes.M_max.valeur).toBeCloseTo(45, 9);
    expect(r.extremes.M_max.x).toBeCloseTo(3, 9);
    expect(r.extremes.w_max.valeur).toBeCloseTo(3.375, 9);
    expect(r.extremes.V_max.valeur).toBeCloseTo(30, 9);
  });

  it('console encastree, force en bout : M = -PL, fleche PL3/3EI', () => {
    const r = calculerPoutre(poutre(4, [encastrement(0)], [{ type: 'ponctuelle', x: 4, P: 20 }]));
    expect(r.reactions[0].R).toBeCloseTo(20, 9);
    expect(r.reactions[0].M_reaction).toBeCloseTo(80, 9);
    expect(r.reactions[0].M_droite).toBeCloseTo(-80, 9);
    expect(r.extremes.w_max.valeur).toBeCloseTo(8.533333333, 8);
    expect(r.extremes.w_max.x).toBeCloseTo(4, 9);
    expect(r.travees.map((t) => t.nom)).toEqual(['console droite']);
  });

  it('charge partielle : resultante 30 kN a 3,5 m', () => {
    const r = calculerPoutre(poutre(10, [appuiSimple(0), appuiSimple(10)], [uniforme(2, 5, 10)]));
    expect(r.reactions[0].R).toBeCloseTo(19.5, 9);
    expect(r.reactions[1].R).toBeCloseTo(10.5, 9);
  });

  it('charge triangulaire 0 -> q : qL/6 et qL/3, M max qL2/(9 racine 3) a L/racine 3', () => {
    const r = calculerPoutre(poutre(4, [appuiSimple(0), appuiSimple(4)], [{ type: 'lineaire', a: 0, b: 4, q_a: 0, q_b: 6 }]));
    expect(r.reactions[0].R).toBeCloseTo(4, 9);
    expect(r.reactions[1].R).toBeCloseTo(8, 9);
    expect(r.extremes.M_max.valeur).toBeCloseTo(6.158402871, 8);
    expect(r.extremes.M_max.x).toBeCloseTo(2.309401077, 8);
  });

  it('moment ponctuel : reactions +-M/L et saut de M au point d application', () => {
    const r = calculerPoutre(poutre(6, [appuiSimple(0), appuiSimple(6)], [{ type: 'moment', x: 2, M: 12 }]));
    expect(r.reactions[0].R).toBeCloseTo(2, 9);
    expect(r.reactions[1].R).toBeCloseTo(-2, 9);
    expect(M(r, 1.999999)).toBeCloseTo(4, 4);
    expect(M(r, 2)).toBeCloseTo(-8, 9);
  });

  it('poutre biappuyee a deux consoles de 2 m, travee de 6 m, charge uniforme', () => {
    // Appuis : R = qL/2 = 50. M sur appui -qa2/2 = -20 ; a mi-travee 50 x 3 - 10 x 52/2 = 25.
    // Rotation sur appui ql3/24EI - (qa2/2) l/2EI = 6e-4 rad ; bout de console -6e-4 x 2 + qa4/8EI = -0,8 mm (remonte).
    // Mi-travee 5ql4/384EI - (qa2/2) l2/8EI = 3,375 - 1,8 = 1,575 mm.
    const r = calculerPoutre(poutre(10, [appuiSimple(2), appuiSimple(8)], [uniforme(0, 10, 10)]));
    expect(r.degreHyperstatique).toBe(0);
    expect(r.travees.map((t) => t.nom)).toEqual(['console gauche', 'travee 1', 'console droite']);
    expect(r.reactions[0].R).toBeCloseTo(50, 9);
    expect(r.reactions[1].R).toBeCloseTo(50, 9);
    expect(r.reactions[0].M_gauche).toBeCloseTo(-20, 9);
    expect(r.reactions[0].V_gauche).toBeCloseTo(-20, 9);
    expect(r.reactions[0].V_droite).toBeCloseTo(30, 9);
    expect(r.travees[1].M_max.valeur).toBeCloseTo(25, 9);
    expect(r.travees[1].M_max.x).toBeCloseTo(5, 9);
    expect(r.travees[1].w_max.valeur).toBeCloseTo(1.575, 9);
    expect(r.travees[0].w_max.valeur).toBeCloseTo(-0.8, 9);
    expect(r.travees[0].w_max.x).toBeCloseTo(0, 9);
    expect(r.travees[2].w_max.valeur).toBeCloseTo(-0.8, 9);
  });

  it('poutre Gerber : console de 4 m, rotule, travee portee de 2 m', () => {
    const p = poutre(6, [encastrement(0), appuiSimple(6)], [uniforme(0, 6, 10)], [4]);
    const r = calculerPoutre(p);
    expect(r.degreHyperstatique).toBe(0);
    expect(r.reactions[0].R).toBeCloseTo(50, 9);
    expect(r.reactions[0].M_reaction).toBeCloseTo(120, 9);
    expect(r.reactions[1].R).toBeCloseTo(10, 9);
    expect(M(r, 4)).toBeCloseTo(0, 9);
  });
});

describe('poutres hyperstatiques', () => {
  it('encastree - appuyee sous charge uniforme : 3qL/8, -qL2/8, 9qL2/128', () => {
    const r = calculerPoutre(poutre(6, [encastrement(0), appuiSimple(6)], [uniforme(0, 6, 10)]));
    expect(r.degreHyperstatique).toBe(1);
    expect(r.reactions[0].R).toBeCloseTo(37.5, 9);
    expect(r.reactions[1].R).toBeCloseTo(22.5, 9);
    expect(r.reactions[0].M_droite).toBeCloseTo(-45, 9);
    expect(r.extremes.M_max.valeur).toBeCloseTo(25.3125, 9);
    expect(r.extremes.M_max.x).toBeCloseTo(3.75, 9);
    // x = L (15 - racine 33) / 16, fleche q x2 (3L2 - 5Lx + 2x2) / 48EI
    expect(r.extremes.w_max.x).toBeCloseTo(3.470789008, 6);
    expect(r.extremes.w_max.valeur).toBeCloseTo(1.40385872, 7);
  });

  it('trois travees egales sous charge uniforme : 0,4 / 1,1 qL et -0,1 qL2', () => {
    const p = poutre(15, [appuiSimple(0), appuiSimple(5), appuiSimple(10), appuiSimple(15)], [uniforme(0, 15, 10)]);
    const r = calculerPoutre(p);
    expect(r.degreHyperstatique).toBe(2);
    [20, 55, 55, 20].forEach((R, i) => expect(r.reactions[i].R).toBeCloseTo(R, 9));
    expect(r.reactions[1].M_gauche).toBeCloseTo(-25, 9);
    expect(r.reactions[1].V_gauche).toBeCloseTo(-30, 9);
    expect(r.reactions[1].V_droite).toBeCloseTo(25, 9);
    expect(r.travees.map((t) => t.nom)).toEqual(['travee 1', 'travee 2', 'travee 3']);
    expect(r.travees[0].M_max.valeur).toBeCloseTo(20, 9);
    expect(r.travees[0].M_max.x).toBeCloseTo(2, 9);
    expect(r.travees[1].M_max.valeur).toBeCloseTo(6.25, 9);
    expect(r.travees[1].M_min.valeur).toBeCloseTo(-25, 9);
    expect(r.travees[1].V_max.valeur).toBeCloseTo(25, 9);
  });

  it('deux travees, force a mi-portee : M_B = -3PL/16, R_B = 22P/16', () => {
    const p = poutre(8, [appuiSimple(0), appuiSimple(4), appuiSimple(8)], [
      { type: 'ponctuelle', x: 2, P: 10 },
      { type: 'ponctuelle', x: 6, P: 10 },
    ]);
    const r = calculerPoutre(p);
    expect(r.reactions[0].R).toBeCloseTo(3.125, 9);
    expect(r.reactions[1].R).toBeCloseTo(13.75, 9);
    expect(r.reactions[1].M_droite).toBeCloseTo(-7.5, 9);
  });

  it('bi-encastree sous charge triangulaire : -qL2/30 et -qL2/20', () => {
    const r = calculerPoutre(poutre(6, [encastrement(0), encastrement(6)], [{ type: 'lineaire', a: 0, b: 6, q_a: 0, q_b: 12 }]));
    expect(r.degreHyperstatique).toBe(2);
    expect(r.reactions[0].M_droite).toBeCloseTo(-14.4, 9);
    expect(r.reactions[1].M_gauche).toBeCloseTo(-21.6, 9);
    expect(r.reactions[0].R).toBeCloseTo(10.8, 9);
    expect(r.reactions[1].R).toBeCloseTo(25.2, 9);
  });

  it('appui elastique central : R = delta0 / (L3/48EI + 1/k)', () => {
    const p = poutre(8, [appuiSimple(0), { type: 'ressort', x: 4, k_vertical: 5000, k_rotation: 0 }, appuiSimple(8)], [uniforme(0, 8, 10)]);
    const r = calculerPoutre(p);
    expect(r.degreHyperstatique).toBe(1);
    expect(r.reactions[1].R).toBeCloseTo(25.80645161, 7);
    expect(r.reactions[1].w).toBeCloseTo(5.161290323, 7);
    expect(r.reactions[0].R).toBeCloseTo(27.09677419, 7);
  });

  it('tassement de l appui central, sans charge : P = 6EI delta / l3, M_B = 3EI delta / l2', () => {
    const p = poutre(8, [appuiSimple(0), { type: 'appui-simple', x: 4, tassement: 10 }, appuiSimple(8)], []);
    const r = calculerPoutre(p);
    expect(r.reactions[1].R).toBeCloseTo(-46.875, 8);
    expect(r.reactions[0].R).toBeCloseTo(23.4375, 8);
    expect(r.reactions[1].M_gauche).toBeCloseTo(93.75, 8);
    expect(r.reactions[1].w).toBeCloseTo(10, 9);
    expect(r.equilibre.charges).toBe(0);
  });

  it('encastrement elastique : |M_A| = (qL3/24EI) / (1/k + L/3EI)', () => {
    const p = poutre(6, [{ type: 'encastrement-elastique', x: 0, tassement: 0, k_rotation: 20000 }, appuiSimple(6)], [uniforme(0, 6, 10)]);
    const r = calculerPoutre(p);
    expect(r.reactions[0].M_droite).toBeCloseTo(-20, 8);
    expect(r.reactions[0].M_reaction).toBeCloseTo(20, 8);
    expect(r.reactions[0].rotation).toBeCloseTo(-1, 8);
    expect(r.reactions[0].R).toBeCloseTo(33.33333333, 7);
    expect(r.reactions[1].R).toBeCloseTo(26.66666667, 7);
  });

  it('encastrement glissant en bout de console : fleche PL3/12EI, M = -/+ PL/2', () => {
    const p = poutre(3, [encastrement(0), { type: 'glissiere', x: 3 }], [{ type: 'ponctuelle', x: 3, P: 12 }]);
    const r = calculerPoutre(p);
    expect(r.degreHyperstatique).toBe(1);
    expect(r.reactions[0].R).toBeCloseTo(12, 9);
    expect(r.reactions[1].R).toBe(0);
    expect(r.reactions[0].M_droite).toBeCloseTo(-18, 9);
    expect(r.reactions[1].M_gauche).toBeCloseTo(18, 9);
    expect(r.reactions[0].M_reaction).toBeCloseTo(18, 9);
    expect(r.reactions[1].M_reaction).toBeCloseTo(18, 9);
    expect(r.reactions[1].w).toBeCloseTo(0.54, 9);
  });

  it('cas mixte : equilibre des forces et des moments', () => {
    const p = poutre(
      12,
      [
        { type: 'encastrement', x: 0, tassement: 3 },
        appuiSimple(4),
        { type: 'ressort', x: 8, k_vertical: 8000, k_rotation: 1500 },
        appuiSimple(11),
      ],
      [
        uniforme(0, 12, 7),
        { type: 'lineaire', a: 1, b: 6, q_a: 2, q_b: 9 },
        { type: 'ponctuelle', x: 9.5, P: 25 },
        { type: 'moment', x: 6, M: -15 },
        { type: 'ponctuelle', x: 12, P: 5 },
      ],
      [6.5]
    );
    const r = calculerPoutre(p);
    expect(r.equilibre.reactions).toBeCloseTo(r.equilibre.charges, 8);
    expect(momentResultant(p, r)).toBeCloseTo(0, 7);
    expect(M(r, 6.5)).toBeCloseTo(0, 8);
    expect(M(r, 12)).toBeCloseTo(0, 8);
  });
});

describe('controles', () => {
  it('poutre hypostatique par decompte : refusee', () => {
    expect(() => calculerPoutre(poutre(6, [appuiSimple(3)], [uniforme(0, 6, 1)]))).toThrow(/hypostatique/);
    expect(() => calculerPoutre(poutre(6, [appuiSimple(0), appuiSimple(6)], [], [3]))).toThrow(/hypostatique \(degré -1\)/);
  });

  it('mecanisme local malgre un degre positif : refuse', () => {
    // Deux rotules dans la premiere travee : l appui en 0 et les rotules en 2
    // et 4 sont trois articulations alignees. Degre 1 + 1 + 2 - 2 - 2 = 0.
    const p = poutre(10, [appuiSimple(0), appuiSimple(6), encastrement(10)], [uniforme(0, 10, 1)], [2, 4]);
    expect(() => calculerPoutre(p)).toThrow(/instable/);
  });

  it('donnees incoherentes : refusees avec la grandeur nommee', () => {
    expect(() => calculerPoutre(poutre(0, [appuiSimple(0)], []))).toThrow(/longueur de la poutre L/);
    expect(() => calculerPoutre(poutre(6, [appuiSimple(0), appuiSimple(7)], []))).toThrow(/appui 2/);
    expect(() => calculerPoutre(poutre(6, [appuiSimple(0), appuiSimple(0)], []))).toThrow(/même abscisse/);
    expect(() => calculerPoutre(poutre(6, [appuiSimple(0), appuiSimple(6)], [uniforme(4, 2, 1)]))).toThrow(/fin strictement/);
    expect(() => calculerPoutre(poutre(6, [encastrement(0), encastrement(3)], [], [3]))).toThrow(/rotule 1 coïncide/);
    expect(() =>
      calculerPoutre(poutre(6, [appuiSimple(0), appuiSimple(6)], [{ type: 'moment', x: 3, M: 1 }], [3]))
    ).toThrow(/sur une rotule/);
    expect(() =>
      calculerPoutre(poutre(6, [appuiSimple(0), { type: 'ressort', x: 6, k_vertical: 0, k_rotation: 0 }], []))
    ).toThrow(/non nulle/);
  });
});
