/**
 * Tests d'acceptation de l'etape 8.2 (finitions) : notations, arrondis,
 * accents, titre, phrases types, sur le texte VISIBLE (ecran, dessins, note,
 * CSV, page). Le controle lui-meme vit dans aedificium-ui (`constatsAffichage`).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NOMS_GRECS, blocsEnTexte, constatsAffichage, contenuBalise, csv, notationHtml, noteDeCalculHtml, resultatsEnCsv, texteVisible } from 'aedificium-ui';
import { EXEMPLES, acierParDefaut, ajusterFerraillage, lignesAppuis, lignesCharges, type ModeleSaisie } from '../../app/src/form';
import {
  resume,
  resumeEnveloppe,
  tableauAcier,
  tableauBAArrets,
  tableauBAExtremites,
  tableauBAFlexion,
  tableauBATranchant,
  tableauEnveloppeAppuis,
  tableauEnveloppeTravees,
  tableauReactions,
  tableauTravees,
  valeursLeLongDeLaPoutre,
} from '../../app/src/vue';
import { STYLES_TRACE } from '../../app/src/export';
import { avertissementsDuCalcul, blocsDEntree, blocsDeSortie, calculerTout, dessins, noteDuCalcul } from '../../app/src/sorties';

const TITRE = 'Poutres continues';
const lire = (chemin: string): string => readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), 'utf8');
const controler = (nom: string, html: string): string[] => constatsAffichage(texteVisible(html)).map((c) => `${nom} : ${c}`);

function modeleAcier(): ModeleSaisie {
  const m = structuredClone(EXEMPLES['trois-travees'].modele);
  m.acier = { ...acierParDefaut(), actif: true };
  ajusterFerraillage(m, 3);
  return m;
}

const MODELES: [string, ModeleSaisie][] = [...Object.entries(EXEMPLES).map(([n, e]): [string, ModeleSaisie] => [n, e.modele]), ['acier', modeleAcier()]];

function sorties() {
  const ecran: string[] = [];
  const notes: string[] = [];
  const csvs: string[] = [];
  for (const [nom, m] of MODELES) {
    const r = calculerTout(m);
    if (!r.ok) throw new Error(`${nom} : ${r.message}`);
    const c = r.calcul;
    const z = c.comb.cas.zones;
    ecran.push(lignesAppuis(m), lignesCharges(m), resume(c.direct), tableauReactions(c.direct), tableauTravees(c.direct));
    for (const env of [c.comb.elu, c.comb.caracteristique, c.comb.frequente, c.comb.quasiPermanente]) {
      ecran.push(resumeEnveloppe(env), tableauEnveloppeAppuis(env, z), tableauEnveloppeTravees(env, z));
    }
    if (c.ba !== null) {
      const { donnees, resultat } = c.ba;
      ecran.push(tableauBAFlexion(resultat, donnees.aciers), tableauBAArrets(resultat), tableauBATranchant(resultat), tableauBAExtremites(resultat));
    }
    if (c.acier !== null) ecran.push(tableauAcier(c.acier.resultat));
    const svgs = dessins(c);
    ecran.push(...svgs.map((d) => d.svg), ...svgs.map((d) => d.titre), ...avertissementsDuCalcul(c).map((a) => notationHtml(a)));
    notes.push(
      noteDeCalculHtml(noteDuCalcul(c, { projet: 'Projet', element: 'Poutre', date: '2026-10-24' }, avertissementsDuCalcul(c)), STYLES_TRACE)
    );
    csvs.push(resultatsEnCsv(blocsEnTexte([...blocsDEntree(c), ...blocsDeSortie(c)])), csv(valeursLeLongDeLaPoutre(c.direct)));
  }
  return { ecran, notes, csvs };
}

describe('texte visible : notations, arrondis, accents, phrases types', () => {
  const s = sorties();

  it('ecran et dessins', () => {
    expect(s.ecran.flatMap((h, i) => controler(`ecran ${i}`, h))).toEqual([]);
  });

  it('note de calcul', () => {
    expect(s.notes.flatMap((h, i) => controler(`note ${i}`, h))).toEqual([]);
  });

  it('page (index.html)', () => {
    expect(controler('page', lire('../../app/index.html'))).toEqual([]);
  });

  it('libelles des exemples', () => {
    expect(Object.values(EXEMPLES).flatMap((e) => controler('exemple', e.libelle))).toEqual([]);
  });

  it('CSV : texte brut, ni « _ » ni nom de lettre grecque ni balise', () => {
    for (const c of s.csvs) {
      expect(c).not.toContain('_');
      expect(c).not.toMatch(NOMS_GRECS);
      expect(c).not.toContain('<');
    }
  });
});

describe('titre', () => {
  const page = lire('../../app/index.html');

  it('titre de la page sans tiret, majuscule initiale', () => {
    expect(contenuBalise(page, 'h1')).toBe(TITRE);
    expect(contenuBalise(page, 'title')?.startsWith(TITRE)).toBe(true);
  });

  it('titre en grand', () => {
    const regle = /(^|\n)h1\s*\{([^}]*)\}/.exec(lire('../../app/src/style.css'))?.[2] ?? '';
    expect(regle).toMatch(/font-size:\s*1\.75rem/);
    expect(regle).toMatch(/font-weight:\s*600/);
  });
});

describe('main.ts passe par les fonctions testees', () => {
  it('sorties et CSV', () => {
    const main = lire('../../app/src/main.ts');
    expect(main).toContain("from './sorties'");
    expect(main).toContain('calculerTout(');
    expect(main).toContain('blocsEnTexte(');
    expect(main).not.toMatch(/function blocsDEntree|function blocsDeSortie|function dessins|const HYPOTHESES/);
  });
});
