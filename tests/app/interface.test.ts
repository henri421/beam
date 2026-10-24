import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JETONS, nombreAffiche, valeursDesJetons } from 'aedificium-ui';
import { calculerBetonArme, calculerCombinaisons, calculerPoutre, profilRecommande } from '../../src/index';
import {
  EXEMPLES,
  donneesDepuisModele,
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
  it('le modele par defaut se lit : 16 m, EI = 31 000 MPa x 540 000 cm4 = 167 400 kN.m2', () => {
    const lecture = poutreDepuisModele(modeleParDefaut());
    expect(lecture.ok).toBe(true);
    if (!lecture.ok) return;
    expect(lecture.poutre.longueur).toBe(16);
    expect(lecture.poutre.EI).toBeCloseTo(167400, 9);
    expect(lecture.poutre.appuis).toHaveLength(4);
  });

  it('virgule decimale acceptee, tassement et raideur vides valent zero', () => {
    const m = modeleParDefaut();
    m.longueur = '15,0';
    m.appuis[0] = { type: 'ressort', x: '0', tassement: '', k_vertical: '5000', k_rotation: '', delta: '' };
    const lecture = poutreDepuisModele(m);
    expect(lecture.ok && lecture.poutre.appuis[0]).toEqual({ type: 'ressort', x: 0, k_vertical: 5000, k_rotation: 0 });
  });

  it('un champ obligatoire vide est nomme', () => {
    const m = modeleParDefaut();
    m.charges[0].q = '';
    expect(poutreDepuisModele(m)).toEqual({ ok: false, message: 'Charge 1, intensité q : nombre à renseigner.' });
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

  it('l exemple beton arme se calcule de bout en bout sans alerte', () => {
    const d = donneesDepuisModele(modeleParDefaut());
    expect(d.ok).toBe(true);
    if (!d.ok || d.ba === null) throw new Error('lecture');
    expect(d.poutre.charges.map((c) => c.cas)).toEqual(['G', 'Q']);
    const r = calculerCombinaisons(d.poutre, d.combinaisons, profilRecommande());
    const ba = calculerBetonArme(r.casELU, r.elu, d.ba, profilRecommande(), d.combinaisons.redistribution);
    expect(ba.avertissements).toEqual([]);
    expect(ba.zones.every((z) => z.renforts !== null)).toBe(true);
  });

  it('un lit illisible est nomme', () => {
    const m = modeleParDefaut();
    m.ba.montage = 'deux HA';
    const d = donneesDepuisModele(m);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.message).toContain('Aciers de montage');
  });

  it('un ancien modele sans cas ni beton arme se relit', () => {
    const ancien = JSON.stringify({ format: 'poutres-continues', version: 1, modele: { longueur: '6', E: '1', I: '1', appuis: [], rotules: [], charges: [{ type: 'repartie', a: '0', b: '6', q: '5' }] } });
    const m = modeleDepuisJson(ancien);
    expect(m.charges[0].cas).toBe('G');
    expect(m.ba.actif).toBe(false);
    expect(m.combinaisons.formule).toBe('6.10');
  });

  it('le fichier de modele fait l aller-retour, un fichier etranger est refuse', () => {
    const m = EXEMPLES.gerber.modele;
    expect(modeleDepuisJson(modeleEnJson(m))).toEqual(m);
    expect(() => modeleDepuisJson('{"format":"autre"}')).toThrow(/pas un modèle/);
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
    expect(svg).toContain('25 kN/m');
    expect(svg).toContain('30 kN·m');
  });

  it('chaque diagramme annote ses extremums', () => {
    expect(dessinDiagramme(r, 'M')).toContain(nombreAffiche(r.travees[0].M_max.valeur, 2));
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
    expect(html).not.toContain('constate, il ne prescrit pas');
  });
});

describe('option acier', () => {
  it('EI tire du profil, poids propre ajoute aux charges G', async () => {
    const { donneesDepuisModele, modeleParDefaut } = await import('../../app/src/form');
    const m = modeleParDefaut();
    m.ba.actif = false;
    m.acier = { ...m.acier, actif: true, profil: 'IPE 300', poidsPropre: true };
    const l = donneesDepuisModele(m);
    if (!l.ok) throw new Error(l.message);
    // IPE 300 : I_y = 8356 cm4 -> EI = 210 000 × 8,356e7 / 1e9 = 17 548 kN.m2 (a 0,5 % pres).
    expect(l.poutre.EI).toBeGreaterThan(17548 * 0.995);
    expect(l.poutre.EI).toBeLessThan(17548 * 1.005);
    const g = l.poutre.charges[l.poutre.charges.length - 1];
    expect(g.type === 'repartie' && g.cas === 'G' && g.q).toBeCloseTo(0.4224, 2);
    expect(l.acier?.profil).toBe('IPE 300');
  });

  it('beton arme et acier sont exclusifs', async () => {
    const { donneesDepuisModele, modeleParDefaut } = await import('../../app/src/form');
    const m = modeleParDefaut();
    m.ba.actif = true;
    m.acier.actif = true;
    const l = donneesDepuisModele(m);
    expect(!l.ok && l.message).toMatch(/OU acier/);
  });

  it('un fichier sans bloc acier se relit, acier inactif', async () => {
    const { modeleDepuisJson, modeleEnJson, modeleParDefaut } = await import('../../app/src/form');
    const m = modeleParDefaut() as unknown as Record<string, unknown>;
    delete m.acier;
    const relu = modeleDepuisJson(modeleEnJson(m as never));
    expect(relu.acier.actif).toBe(false);
    expect(relu.acier.profil).toBe('IPE 300');
  });
});
