// Lot E (audit R4) : annexe nationale preremplie, coefficients du profil modifiables.
import { describe, expect, it } from 'vitest';
import { noteDeCalculHtml, texteVisible } from 'aedificium-ui';
import { profilRecommande } from '../../src/index';
import { CLES, clauseDe, coefsDeLAnnexe, profilDeCalcul, profilDeLAnnexe } from '../../app/src/annexe';
import { modeleDepuisJson, modeleEnJson, modeleParDefaut } from '../../app/src/form';
import { avertissementsDuCalcul, calculerTout, noteDuCalcul } from '../../app/src/sorties';

const CARTOUCHE = { projet: 'P', element: 'E', date: '2026-11-18' };

function calculLu(modif: Partial<Record<(typeof CLES)[number], string>> = {}) {
  const m = modeleParDefaut();
  m.combinaisons.annexe = 'lu';
  m.combinaisons.coefs = { ...coefsDeLAnnexe('lu'), ...modif };
  const r = calculerTout(m);
  if (!r.ok) throw new Error(r.message);
  return r.calcul;
}

describe('annexe nationale', () => {
  it('clauses lues dans les sources recommandees', () => {
    const p = profilRecommande();
    expect(clauseDe(p.gamma_G_sup.source)).toBe('tableau A1.2(B)');
    expect(clauseDe(p.gamma_C.source)).toBe('tableau 2.1N');
    expect(clauseDe(p.alpha_cc.source)).toBe('3.1.6(1)P');
  });

  it('Luxembourg : alpha_cc = 0,85, le reste recommande, sources AN-LU par partie', () => {
    const lu = profilDeLAnnexe('lu');
    const rec = profilRecommande();
    expect(lu.alpha_cc.valeur).toBe(0.85);
    expect(lu.alpha_cc.source).toMatch(/^ILNAS-EN 1992-1-1\/AN-LU:2020, 3\.1\.6\(1\)P : valeur présumée/);
    expect(lu.gamma_G_sup.source).toMatch(/^ILNAS-EN 1990\/AN-LU:2020, tableau A1\.2\(B\) : valeur recommandée présumée retenue/);
    for (const k of CLES.filter((c) => c !== 'alpha_cc')) expect(lu[k].valeur).toBe(rec[k].valeur);
    expect(profilDeLAnnexe('recommande')).toEqual(rec);
  });

  it('une valeur changee est marquee imposee', () => {
    const v = Object.fromEntries(CLES.map((k) => [k, profilDeLAnnexe('lu')[k].valeur])) as Record<(typeof CLES)[number], number>;
    const p = profilDeCalcul('lu', { ...v, gamma_Q: 1.6 });
    expect(p.gamma_Q).toEqual({ valeur: 1.6, source: 'valeur imposée par l’utilisateur' });
    expect(p.alpha_cc.valeur).toBe(0.85);
  });

  it('par defaut recommande ; annexe et coefficients enregistres et relus ; ancien fichier relu', () => {
    const m = modeleParDefaut();
    expect(m.combinaisons.annexe).toBe('recommande');
    expect(m.combinaisons.coefs.alpha_cc).toBe('1');
    m.combinaisons.annexe = 'lu';
    m.combinaisons.coefs = { ...coefsDeLAnnexe('lu'), gamma_C: '1.4' };
    const relu = modeleDepuisJson(modeleEnJson(m));
    expect(relu.combinaisons.annexe).toBe('lu');
    expect(relu.combinaisons.coefs.gamma_C).toBe('1.4');
    expect(relu.combinaisons.coefs.alpha_cc).toBe('0.85');
    const ancien = JSON.parse(modeleEnJson(modeleParDefaut()));
    delete ancien.modele.combinaisons.annexe;
    delete ancien.modele.combinaisons.coefs;
    const vieux = modeleDepuisJson(JSON.stringify(ancien));
    expect(vieux.combinaisons.annexe).toBe('recommande');
    expect(vieux.combinaisons.coefs).toEqual(coefsDeLAnnexe('recommande'));
  });

  it('Luxembourg : le calcul emploie le profil LU, la note le dit et avertit', () => {
    const c = calculLu({ gamma_C: '1.4' });
    expect(c.profil.alpha_cc.valeur).toBe(0.85);
    expect(c.profil.gamma_C.source).toMatch(/imposée/);
    const av = avertissementsDuCalcul(c);
    expect(av[0]).toMatch(/^Annexe nationale luxembourgeoise/);
    const note = noteDuCalcul(c, CARTOUCHE, av);
    expect(note.cartouche.norme).toContain('AN-LU:2020');
    const texte = texteVisible(noteDeCalculHtml(note, ''));
    expect(texte).toContain('ILNAS-EN 1992-1-1/AN-LU:2020, 3.1.6(1)P');
    expect(texte).toContain('imposée');
  });

  it('valeurs recommandees : calcul inchange, sans avertissement LU', () => {
    const r = calculerTout(modeleParDefaut());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.calcul.profil).toEqual(profilRecommande());
    expect(avertissementsDuCalcul(r.calcul).some((a) => /luxembourgeoise/.test(a))).toBe(false);
    expect(noteDuCalcul(r.calcul, CARTOUCHE).cartouche.norme).not.toContain('AN-LU');
  });
});
