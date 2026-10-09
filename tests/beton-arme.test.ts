import { describe, expect, it } from 'vitest';
import {
  aireLit,
  calculerBetonArme,
  calculerCombinaisons,
  limiteXuD,
  lireLit,
  profilRecommande,
  type Charge,
  type DonneesBA,
  type DonneesCombinaisons,
  type Lit,
} from '../src/index';
import { appuiSimple, poutre } from './fixtures';

const P = profilRecommande();

// Valeurs attendues : diagramme parabole-rectangle integre a part (script hors
// depot) : alpha_R = 0,80952, k_a = 0,41597 ; f_cd = 16,667 MPa, f_yd = 434,78 MPa.

function ba(partiel: Partial<DonneesBA> = {}, nbZones = 1, nbAppuis = 2, lits: { inf?: Lit | null; montage?: Lit | null } = {}): DonneesBA {
  return {
    section: { forme: 'rectangle', b_w: 300, h: 500, b_eff: 300, h_f: 0 },
    fck: 25,
    fyk: 500,
    classeAcier: 'B',
    a_inf: 50,
    a_sup: 45,
    cotTheta: 2.5,
    cadres: { phi: 8, brins: 2, s: 200 },
    largeurAppui: 0,
    extremitesMonolithiques: false,
    aciers: {
      zones: Array.from({ length: nbZones }, () => ({ filants: lits.inf ?? null, renforts: null })),
      appuis: Array.from({ length: nbAppuis }, () => ({ chapeaux: null })),
      montage: lits.montage ?? null,
    },
    ...partiel,
  };
}

function comb(n: number, partiel: Partial<DonneesCombinaisons> = {}): DonneesCombinaisons {
  return { formule: '6.10', psi0: 0.7, psi1: 0.5, psi2: 0.3, gamma_T: 1, redistribution: Array(n).fill(1), ...partiel };
}

/** Travee isostatique de 6 m dont le moment ELU vaut M : q = 8 M / (1,35 L2) en G. */
function travee(M: number) {
  const q = (8 * M) / (1.35 * 36);
  const charges: Charge[] = [{ type: 'repartie', a: 0, b: 6, q, cas: 'G' }];
  const p = poutre(6, [appuiSimple(0), appuiSimple(6)], charges);
  const r = calculerCombinaisons(p, comb(2), P);
  return { p, r };
}

describe('lits de barres', () => {
  it('lecture des notations usuelles', () => {
    expect(lireLit('3HA16')).toEqual({ n: 3, phi: 16 });
    expect(lireLit(' 2 x 12 ')).toEqual({ n: 2, phi: 12 });
    expect(lireLit('4T20')).toEqual({ n: 4, phi: 20 });
    expect(lireLit('')).toBeNull();
    expect(() => lireLit('trois HA')).toThrow(/illisible/);
    expect(aireLit({ n: 3, phi: 16 })).toBeCloseTo(603.186, 3);
  });
});

describe('flexion', () => {
  it('x_u/d limite sans redistribution : (1 - 0,44) / (1,25 (0,6 + 0,0014/0,0035)) = 0,448', () => {
    expect(limiteXuD(P, 25, 0.0035, 1)).toBeCloseTo(0.448, 12);
    expect(limiteXuD(P, 25, 0.0035, 0.8)).toBeCloseTo(0.288, 12);
  });

  it('rectangle 300 x 500, d = 450, M_Ed = 150 kN.m : A_s = 836,1 mm2, x/d = 0,1996', () => {
    const { r } = travee(150);
    const res = calculerBetonArme(r.cas, r.elu, ba(), P, [1, 1]);
    const f = res.zones[0].flexion;
    expect(f?.M_Ed).toBeCloseTo(150, 6);
    expect(f?.As_req).toBeCloseTo(836.07, 0);
    expect(f?.xu_d_req).toBeCloseTo(0.19957, 3);
    expect(f?.As2_req).toBe(0);
    expect(f?.As_min).toBeCloseTo(180.06, 1);
    expect(f?.As_max).toBeCloseTo(6000, 6);
  });

  it('au-dela de x_u/d = 0,448 : aciers comprimes', () => {
    // x = 0,448 x 450 = 201,6 mm, M_c = 298,77 kN.m ; acier comprime a 50 mm plastifie,
    // beton deplace deduit (section-uls) : A_s2 = (400 - 298,77) / ((434,78 - 16,67) x 0,400) = 605,3 mm2.
    const { r } = travee(400);
    const f = calculerBetonArme(r.cas, r.elu, ba({ a_sup: 50 }), P, [1, 1]).zones[0].flexion;
    expect(f?.As2_req).toBeCloseTo(605.27, 0);
    expect(f?.As_req).toBeCloseTo(2458.87, 0);
    expect(f?.xu_d_req).toBeCloseTo(0.448, 3);
  });

  it('section en T : table comprimee en travee, ame comprimee sur appui', () => {
    const T = { forme: 'te' as const, b_w: 300, h: 500, b_eff: 1000, h_f: 120 };
    const { r } = travee(200);
    const f = calculerBetonArme(r.cas, r.elu, ba({ section: T }), P, [1, 1]).zones[0].flexion;
    expect(f?.As_req).toBeCloseTo(1055.40, 0);
    // Console de 3 m sous 1,35 x q : moment sur appui -150 kN.m, ame de 300 comprimee, d = 455.
    const q = (2 * 150) / (1.35 * 9);
    const p = poutre(3, [{ type: 'encastrement', x: 0, tassement: 0 }], [{ type: 'repartie', a: 0, b: 3, q }]);
    const rc = calculerCombinaisons(p, comb(1), P);
    const app = calculerBetonArme(rc.cas, rc.elu, ba({ section: T }, 1, 1), P, [1]).appuis[0].flexion;
    expect(app?.sens).toBe(-1);
    expect(app?.M_Ed).toBeCloseTo(150, 6);
    expect(app?.As_req).toBeCloseTo(825.10, 0);
  });

  it('moment resistant des aciers choisis', () => {
    const { r } = travee(150);
    // 836,07 mm2 donnent exactement 150 kN.m : 4HA16 = 804,2 mm2 un peu moins.
    const f = calculerBetonArme(r.cas, r.elu, ba({}, 1, 2, { inf: { n: 4, phi: 16 } }), P, [1, 1]).zones[0].flexion;
    expect(f?.As_prov).toBeCloseTo(804.25, 1);
    expect(f?.M_Rd).toBeLessThan(150);
    expect(f?.M_Rd).toBeGreaterThan(144);
  });
});

describe('effort tranchant et ancrages', () => {
  it('A_sw/s = V_Ed,red / (z f_ywd cot theta), V_Ed a d du nu', () => {
    // q = 8 x 150 / (1,35 x 36) ; V_Ed a l axe = 1,35 q L / 2 = 100 kN ;
    // a 0,1 + 0,455 m (b = 200 mm, d = max(450, 455)) : 100 (1 - 2 x 0,555 / 6) = 81,5 kN.
    const { r } = travee(150);
    const res = calculerBetonArme(r.cas, r.elu, ba({ largeurAppui: 200 }, 1, 2, { inf: { n: 4, phi: 16 } }), P, [1, 1]);
    const t = res.zones[0].tranchant[0];
    expect(t.V_Ed).toBeCloseTo(100, 6);
    expect(t.V_Ed_reduit).toBeCloseTo(81.5, 6);
    // z = 0,9 x 450 = 405 mm, f_ywd = 434,78 MPa, cot theta = 2,5 : 81 500 / (405 x 434,78 x 2,5) = 0,18513
    // minimum : 0,08 racine(25) / 500 x 300 = 0,24 mm2/mm, qui gouverne.
    expect(t.Asw_s_min).toBeCloseTo(0.24, 9);
    expect(t.Asw_s_req).toBeCloseTo(0.24, 9);
    expect(t.s_max).toBeCloseTo(337.5, 9);
  });

  it('appui d extremite : F_E = V_Ed cot theta / 2', () => {
    const { r } = travee(150);
    const res = calculerBetonArme(r.cas, r.elu, ba({}, 1, 2, { inf: { n: 4, phi: 16 } }), P, [1, 1]);
    const a = res.appuis[0].ancrage;
    expect(a?.F_E).toBeCloseTo(125, 6);
    expect(a?.As_req).toBeCloseTo((125000 * 1.15) / 500, 6);
  });

  it('decalage a_l = 0,9 d cot theta / 2 = 0,5119 m pour d = 455 mm', () => {
    const { r } = travee(150);
    const res = calculerBetonArme(r.cas, r.elu, ba(), P, [1, 1]);
    expect(res.a_l).toBeCloseTo((0.9 * 455 * 2.5) / 2 / 1000, 12);
  });
});

describe('epure sur trois travees', () => {
  const charges: Charge[] = [
    { type: 'repartie', a: 0, b: 15, q: 20, cas: 'G' },
    { type: 'repartie', a: 0, b: 15, q: 10, cas: 'Q' },
  ];
  const p = poutre(15, [appuiSimple(0), appuiSimple(5), appuiSimple(10), appuiSimple(15)], charges);
  const r = calculerCombinaisons(p, comb(4), P);
  const lit = (n: number, phi: number): Lit => ({ n, phi });
  const d = ba({}, 3, 4, { inf: lit(2, 12), montage: lit(2, 10) });
  d.aciers.zones[0].renforts = lit(2, 16);
  d.aciers.appuis[1].chapeaux = lit(3, 16);
  const res = calculerBetonArme(r.cas, r.elu, d, P, [1, 1, 1, 1]);

  it('renforts de rive : necessaires sur une partie de la travee, ancres au-dela', () => {
    const z = res.zones[0];
    expect(z.renforts).not.toBeNull();
    const ren = z.renforts!;
    expect(ren.necessaire[0]).toBeGreaterThan(0);
    expect(ren.necessaire[1]).toBeLessThan(5);
    expect(ren.necessaire[0] - ren.de).toBeCloseTo(Math.min(res.l_bd_inf / 1000, ren.necessaire[0]), 9);
  });

  it('chapeaux sur l appui B, de part et d autre', () => {
    const ch = res.appuis[1].chapeaux!;
    expect(ch.necessaire[0]).toBeLessThan(5);
    expect(ch.necessaire[1]).toBeGreaterThan(5);
    expect(ch.a - ch.necessaire[1]).toBeCloseTo(res.l_bd_sup / 1000, 9);
  });

  it('l epure resistante couvre la courbe decalee ou le signale', () => {
    const couvert = res.epure.every((pt) => pt.Mdec_max <= pt.MRd_inf + 1e-6 && pt.Mdec_min >= pt.MRd_sup - 1e-6);
    const signale = res.avertissements.some((a) => a.startsWith('Epure'));
    expect(couvert || signale).toBe(true);
  });

  it('regle des 25 % : 2HA12 filants sur 2HA12 + 2HA16 = 36 %', () => {
    expect(res.zones[0].part_filants).toBeCloseTo(226.19 / (226.19 + 402.12), 3);
  });
});
