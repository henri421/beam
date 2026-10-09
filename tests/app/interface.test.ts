import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JETONS, valeursDesJetons } from 'aedificium-ui';
import { calculerPoutre } from '../../src/index';
import {
  EXEMPLES,
  lignesAppuis,
  lignesCharges,
  modeleDepuisJson,
  modeleEnJson,
  modeleParDefaut,
  nouvelleCharge,
  poutreDepuisModele,
} from '../../app/src/form';
import { dessinDiagramme, dessinSchema } from '../../app/src/dessin';
import { blocsResultats, tableauReactions, valeursLeLongDeLaPoutre } from '../../app/src/vue';
import { STYLES_TRACE, noteDeCalculHtml } from '../../app/src/export';

describe('saisie', () => {
  it('le modele par defaut se lit : 15 m, EI = 30 000 MPa x 312 500 cm4 = 93 750 kN.m2', () => {
    const lecture = poutreDepuisModele(modeleParDefaut());
    expect(lecture.ok).toBe(true);
    if (!lecture.ok) return;
    expect(lecture.poutre.longueur).toBe(15);
    expect(lecture.poutre.EI).toBeCloseTo(93750, 9);
    expect(lecture.poutre.appuis).toHaveLength(4);
  });

  it('virgule decimale acceptee, tassement et raideur vides valent zero', () => {
    const m = modeleParDefaut();
    m.longueur = '15,0';
    m.appuis[0] = { type: 'ressort', x: '0', tassement: '', k_vertical: '5000', k_rotation: '' };
    const lecture = poutreDepuisModele(m);
    expect(lecture.ok && lecture.poutre.appuis[0]).toEqual({ type: 'ressort', x: 0, k_vertical: 5000, k_rotation: 0 });
  });

  it('un champ obligatoire vide est nomme', () => {
    const m = modeleParDefaut();
    m.charges[0].q = '';
    expect(poutreDepuisModele(m)).toEqual({ ok: false, message: 'Charge 1, intensite q : nombre a renseigner.' });
  });

  it('une charge neuve couvre toute la poutre', () => {
    expect(nouvelleCharge('lineaire', '12')).toMatchObject({ a: '0', b: '12', q_a: '0', q_b: '10' });
  });

  it('les lignes ne montrent que les champs du type', () => {
    const m = modeleParDefaut();
    expect(lignesAppuis(m)).toContain('data-champ="tassement"');
    expect(lignesAppuis(m)).not.toContain('data-champ="k_vertical"');
    expect(lignesCharges(m)).toContain('data-champ="q"');
    expect(lignesCharges(m)).not.toContain('data-champ="P"');
  });

  it('tous les exemples se calculent', () => {
    for (const e of Object.values(EXEMPLES)) {
      const lecture = poutreDepuisModele(e.modele);
      expect(lecture.ok).toBe(true);
      if (lecture.ok) expect(() => calculerPoutre(lecture.poutre)).not.toThrow();
    }
  });

  it('le fichier de modele fait l aller-retour, un fichier etranger est refuse', () => {
    const m = EXEMPLES.gerber.modele;
    expect(modeleDepuisJson(modeleEnJson(m))).toEqual(m);
    expect(() => modeleDepuisJson('{"format":"autre"}')).toThrow(/pas un modele/);
    expect(() => modeleDepuisJson('pas du json')).toThrow(/illisible/);
    expect(() =>
      modeleDepuisJson(JSON.stringify({ format: 'poutres-continues', modele: { appuis: [{ type: 'pieu' }] } }))
    ).toThrow(/inconnu/);
  });
});

describe('traces et sorties', () => {
  const lecture = poutreDepuisModele(EXEMPLES.ressorts.modele);
  if (!lecture.ok) throw new Error(lecture.message);
  const r = calculerPoutre(lecture.poutre);

  it('le schema porte appuis, ressorts et charges', () => {
    const svg = dessinSchema(r.poutre);
    expect(svg).toContain('class="ressort"');
    expect(svg).toContain('25,00 kN/m');
    expect(svg).toContain('30,00 kN·m');
  });

  it('chaque diagramme annote ses extremums', () => {
    expect(dessinDiagramme(r, 'M')).toContain(r.travees[0].M_max.valeur.toFixed(2).replace('.', ','));
    expect(dessinDiagramme(r, 'V')).toContain('Effort tranchant');
    expect(dessinDiagramme(r, 'w')).toContain('class="deformee"');
  });

  it('les tableaux et blocs couvrent chaque appui et chaque travee', () => {
    expect(tableauReactions(r)).toContain('A3');
    expect(blocsResultats(r)).toHaveLength(1 + r.reactions.length + r.travees.length);
    expect(valeursLeLongDeLaPoutre(r)[0]).toEqual(['x (m)', 'V (kN)', 'M (kN.m)', 'w (mm)']);
  });

  it('le :root de style.css concorde avec les jetons communs', () => {
    const css = readFileSync(fileURLToPath(new URL('../../app/src/style.css', import.meta.url)), 'utf8');
    const page = valeursDesJetons(css);
    for (const [nom, valeur] of valeursDesJetons(JETONS)) expect(page.get(nom)).toBe(valeur);
  });

  it('les regles de peinture de STYLES_TRACE sont aussi dans style.css', () => {
    const css = readFileSync(fileURLToPath(new URL('../../app/src/style.css', import.meta.url)), 'utf8');
    const regles = STYLES_TRACE.split('\n').filter((l) => l.startsWith('svg .'));
    expect(regles.length).toBeGreaterThan(10);
    for (const regle of regles) expect(css).toContain(regle);
  });

  it('la note porte les dessins, echappe le texte et rappelle la doctrine', () => {
    const html = noteDeCalculHtml(
      { titre: 'Poutre <test>', date: '2026-10-09', entrees: [], dessins: ['<svg></svg>'], resultats: blocsResultats(r), avertissements: [], hypotheses: ['h1'] },
      STYLES_TRACE
    );
    expect(html).toContain('Poutre &lt;test&gt;');
    expect(html).toContain('<div class="dessin"><svg></svg></div>');
    expect(html).toContain('constate, il ne prescrit pas');
  });
});
