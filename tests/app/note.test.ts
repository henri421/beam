/**
 * Tests d'acceptation de la note de calcul (etape 8, lot 8.7) : contenu range
 * dans les sections de la note commune d'aedificium-ui, dans l'ordre voulu par
 * l'utilisateur, conclusions generees depuis les verifications.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { noteDeCalculHtml, texteVisible, type ElementNote, type NoteDeCalcul } from 'aedificium-ui';
import { EXEMPLES, acierParDefaut, ajusterFerraillage, type ModeleSaisie } from '../../app/src/form';
import { HYPOTHESES, PROFIL, calculerTout, dessins, noteDuCalcul, type Calcul } from '../../app/src/sorties';
import { STYLES_TRACE } from '../../app/src/export';

const lire = (chemin: string): string => readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), 'utf8');

function calcul(m: ModeleSaisie): Calcul {
  const r = calculerTout(structuredClone(m));
  if (!r.ok) throw new Error(r.message);
  return r.calcul;
}

function modeleAcier(): ModeleSaisie {
  const m = structuredClone(EXEMPLES['trois-travees'].modele);
  m.acier = { ...acierParDefaut(), actif: true };
  ajusterFerraillage(m, 3);
  return m;
}

const CARTOUCHE = { projet: 'Immeuble Les Tilleuls', element: 'Poutre P12', date: '2026-10-26' };

const ba = calcul(EXEMPLES['ba-trois-travees'].modele);
const acier = calcul(modeleAcier());
const nue = calcul(EXEMPLES['trois-travees'].modele); // ni beton arme ni acier

/** Chaque valeur attendue est presente (le banc local n'a pas expect.arrayContaining). */
function contientTous(liste: string[], attendus: string[]): void {
  for (const a of attendus) expect(liste).toContain(a);
}

const svgs = (els: ElementNote[] | undefined): string[] => (els ?? []).flatMap((e) => (e.type === 'figure' ? [e.svg] : []));
const titresBlocs = (els: ElementNote[] | undefined): string[] => (els ?? []).flatMap((e) => (e.type === 'bloc' ? [e.bloc.titre] : []));
const lignesBlocs = (els: ElementNote[] | undefined): string[] =>
  (els ?? []).flatMap((e) => (e.type === 'bloc' ? e.bloc.lignes.map((l) => l.symbole) : []));

describe('noteDuCalcul — cartouche', () => {
  it('projet, element et date recus ; norme et outil fixes par l app', () => {
    const n = noteDuCalcul(ba, CARTOUCHE);
    expect(n.cartouche.projet).toBe('Immeuble Les Tilleuls');
    expect(n.cartouche.element).toBe('Poutre P12');
    expect(n.cartouche.date).toBe('2026-10-26');
    expect(n.cartouche.outil).toBe('poutres-continues');
    expect(n.cartouche.norme).toMatch(/EN 1990/);
    expect(n.cartouche.norme).toMatch(/EN 1992-1-1/);
    expect(noteDuCalcul(acier, CARTOUCHE).cartouche.norme).toMatch(/EN 1993-1-1/);
    expect(noteDuCalcul(acier, CARTOUCHE).cartouche.norme).not.toMatch(/EN 1992/);
  });

  it('element vide : le titre par defaut decrit la poutre', () => {
    expect(noteDuCalcul(ba, { ...CARTOUCHE, element: '  ' }).cartouche.element).toBe('Poutre de 16 m, 4 appuis');
  });
});

describe('noteDuCalcul — rangement par section', () => {
  const n = noteDuCalcul(ba, CARTOUCHE);
  const s = n.sections;
  const tous = dessins(ba);
  const svg = (nom: string): string => tous.find((d) => d.nom === nom)!.svg;

  it('geometrie : poutre, appuis, schema statique ; section de beton', () => {
    contientTous(titresBlocs(s.geometrie), ['Poutre', 'Appuis']);
    expect(svgs(s.geometrie)).toContain(svg('schema'));
    expect(lignesBlocs(s.geometrie)).toContain('section');
    expect(lignesBlocs(s.geometrie)).toContain('L');
  });

  it('materiaux : rigidite (E, I, EI) et materiaux du beton arme', () => {
    contientTous(lignesBlocs(s.materiaux), ['E', 'I', 'EI', 'f_ck / f_yk']);
    expect(lignesBlocs(s.geometrie)).not.toContain('E');
  });

  it('hypotheses : les hypotheses de l app et les parametres du profil normatif', () => {
    const listes = (s.hypotheses ?? []).flatMap((e) => (e.type === 'liste' ? e.items : []));
    for (const h of HYPOTHESES) expect(listes).toContain(h);
    const parametres = Object.entries(PROFIL).filter(([, v]) => typeof v === 'object').map(([k]) => k);
    expect(parametres.length).toBeGreaterThan(0);
    contientTous(lignesBlocs(s.hypotheses), parametres);
    // Les parametres ne sont plus dans le bloc des combinaisons.
    for (const k of parametres) expect(lignesBlocs(s.combinaisons)).not.toContain(k);
  });

  it('cas de charges : le bloc des charges', () => {
    expect(titresBlocs(s.charges)).toContain('Charges');
  });

  it('combinaisons : expression ELU, coefficients psi et gamma_T', () => {
    contientTous(lignesBlocs(s.combinaisons), ['ELU', 'psi_0, psi_1, psi_2', 'gamma_T']);
  });

  it('calculs : diagrammes et epure, resultats', () => {
    for (const nom of ['elu-moment', 'elu-effort-tranchant', 'els-fleche', 'caracteristique-deformee', 'epure']) {
      expect(svgs(s.calculs)).toContain(svg(nom));
    }
    expect(svgs(s.calculs)).not.toContain(svg('schema'));
    expect(titresBlocs(s.calculs)).toContain('Béton armé — effort tranchant');
  });

  it('chaque figure a une legende', () => {
    for (const cle of Object.keys(s) as (keyof NoteDeCalcul['sections'])[]) {
      for (const e of s[cle] ?? []) if (e.type === 'figure') expect(e.legende ?? '').not.toBe('');
    }
  });

  it('calculs : etape de l effort tranchant, formule (6.8), valeurs, resultat', () => {
    const etapes = (s.calculs ?? []).flatMap((e) => (e.type === 'etape' ? [e] : []));
    const v = etapes.find((e) => /V_Rd,s/.test(e.formule));
    expect(v).toBeDefined();
    expect(v!.clause ?? '').toMatch(/6\.2\.3/);
    expect(v!.clause ?? '').toMatch(/6\.8/);
    expect(v!.formule).toMatch(/A_sw/);
    expect(v!.formule).toMatch(/cot theta/);
    expect(v!.substituee).toMatch(/\d/);
    expect(v!.resultat).toMatch(/kN$/);
    // Le resultat est le V_Rd,s du noyau, a l'arrondi pres.
    const t = ba.ba!.resultat.zones.flatMap((z) => z.tranchant)[0];
    const lu = Number(v!.resultat.replace(/[^\d,.-]/g, '').replace(',', '.'));
    expect(Math.abs(lu - t.V_Rd_s)).toBeLessThan(0.05 * t.V_Rd_s);
  });

  it('sans beton arme ni acier : pas de materiaux du beton, pas de verification', () => {
    const m = noteDuCalcul(nue, CARTOUCHE);
    expect(lignesBlocs(m.sections.materiaux)).not.toContain('f_ck / f_yk');
    expect(m.verifications).toEqual([]);
    expect(lignesBlocs(m.sections.geometrie)).not.toContain('section');
  });

  it('acier : profil en materiaux, pas de section de beton', () => {
    const m = noteDuCalcul(acier, CARTOUCHE);
    expect(lignesBlocs(m.sections.materiaux)).toContain('profil');
    expect(lignesBlocs(m.sections.materiaux)).not.toContain('f_ck / f_yk');
  });

  it('avertissements du calcul repris', () => {
    const r = noteDuCalcul(ba, CARTOUCHE, ['Les données saisies ont changé depuis ce calcul.']);
    expect(r.avertissements ?? []).toContain('Les données saisies ont changé depuis ce calcul.');
  });
});

describe('noteDuCalcul — verifications', () => {
  it('beton arme : flexion par zone et par appui, effort tranchant par extremite', () => {
    const r = ba.ba!.resultat;
    const v = noteDuCalcul(ba, CARTOUCHE).verifications;
    const flexZones = r.zones.filter((z) => z.flexion !== null && z.flexion.M_Rd !== null);
    const flexAppuis = r.appuis.filter((a) => a.flexion !== null && a.flexion.M_Rd !== null);
    const tranchants = r.zones.flatMap((z) => z.tranchant);
    expect(v).toHaveLength(flexZones.length + flexAppuis.length + tranchants.length);
    expect(flexZones.length).toBeGreaterThan(0);
    expect(tranchants.length).toBeGreaterThan(0);

    const z0 = flexZones[0];
    const f = v.find((x) => x.nom === `Flexion, ${z0.zone.nom}`);
    expect(f).toBeDefined();
    expect(f!.taux).toBeCloseTo(z0.flexion!.M_Ed / z0.flexion!.M_Rd!, 9);
    expect(f!.ok).toBe(f!.taux! <= 1);
    expect(f!.clause ?? '').toMatch(/6\.1/);

    const t0 = tranchants[0];
    const vt = v.filter((x) => x.nom.startsWith('Effort tranchant'));
    expect(vt).toHaveLength(tranchants.length);
    expect(vt[0].taux).toBeCloseTo(t0.V_Ed_reduit / Math.min(t0.V_Rd_s, t0.V_Rd_max), 9);
    expect(vt[0].clause ?? '').toMatch(/6\.2\.3/);
    expect(vt.every((x) => x.ok === x.taux! <= 1)).toBe(true);
  });

  it('acier : section, cisaillement, deversement (s il s applique) et fleche par zone', () => {
    const r = acier.acier!.resultat;
    const v = noteDuCalcul(acier, CARTOUCHE).verifications;
    let attendu = 0;
    for (const z of r.zones) {
      const nom = z.zone.nom;
      const section = v.find((x) => x.nom === `Section, ${nom}`);
      const fleche = v.find((x) => x.nom === `Flèche, ${nom}`);
      expect(section).toBeDefined();
      expect(fleche).toBeDefined();
      expect(fleche!.taux).toBeCloseTo(z.tauxFleche, 9);
      if (z.tauxSection !== null) expect(section!.taux).toBeCloseTo(z.tauxSection, 9);
      else expect(Number.isFinite(section!.taux)).toBe(false); // erreur : hors domaine, jamais masquee
      expect(v.some((x) => x.nom === `Cisaillement, ${nom}`)).toBe(true);
      expect(v.some((x) => x.nom === `Déversement, ${nom}`)).toBe(z.tauxDeversement !== null);
      attendu += 3 + (z.tauxDeversement !== null ? 1 : 0);
    }
    expect(v).toHaveLength(attendu);
  });
});

describe('note HTML complete', () => {
  const html = noteDeCalculHtml(noteDuCalcul(ba, CARTOUCHE), STYLES_TRACE);
  const titres = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => texteVisible(m[1]).trim());

  it('les sept sections, dans l ordre', () => {
    expect(titres).toEqual([
      '1. Géométrie',
      '2. Matériaux',
      '3. Hypothèses',
      '4. Cas de charges',
      '5. Combinaisons de charges',
      '6. Calculs et vérifications',
      '7. Conclusions',
    ]);
  });

  it('sans verification, la note s arrete aux calculs', () => {
    const h = noteDeCalculHtml(noteDuCalcul(nue, CARTOUCHE), STYLES_TRACE);
    const t = [...h.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => texteVisible(m[1]).trim());
    expect(t[t.length - 1]).toMatch(/Calculs et vérifications$/);
  });
});

describe('cablage', () => {
  const main = lire('../../app/src/main.ts');
  const exporte = lire('../../app/src/export.ts');
  const page = lire('../../app/index.html');

  it('la note vient d aedificium-ui ; l ancienne note locale a disparu', () => {
    expect(main).toMatch(/noteDuCalcul\(/);
    expect(main).toMatch(/import\s*\{[^}]*\bnoteDeCalculHtml\b[^}]*\}\s*from\s*'aedificium-ui'/);
    expect(exporte).not.toMatch(/function noteDeCalculHtml|interface NoteDeCalcul/);
  });

  it('champs projet et element dans le volet des sorties', () => {
    expect(page).toMatch(/<input[^>]*data-role="projet"/);
    expect(page).toMatch(/<input[^>]*data-role="element"/);
  });
});
