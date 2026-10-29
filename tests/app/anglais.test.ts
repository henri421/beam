/**
 * Version anglaise (lot 8.8) : page `en/index.html` de meme squelette que la
 * page francaise, et AUCUN reste de francais dans ce qui s'affiche en anglais.
 * Chaque sortie passe par les memes traducteurs que main.ts (`trHtml`, `tr`,
 * `trBlocs`). Le francais, lui, est couvert par les autres tests, inchanges.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blocsEnTexte, constatsAffichage, contenuBalise, definirLangue, notationHtml, noteDeCalculHtml, resultatsEnCsv, texteVisible } from 'aedificium-ui';
import { libelleDisposition } from '../../src/index';
import { EXEMPLES, lignesAcier, lignesAppuis, lignesCharges, lignesFerraillage, lignesRotules, modeleDepuisJson, type ModeleSaisie } from '../../app/src/form';
import { dessinDiagramme, dessinEnveloppe, dessinEpure, dessinSchema } from '../../app/src/dessin';
import {
  avertissementsEnveloppe,
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
} from '../../app/src/vue';
import { STYLES_TRACE } from '../../app/src/export';
import { avertissementsDuCalcul, blocsDEntree, blocsDeSortie, calculerTout, dessins, noteDuCalcul } from '../../app/src/sorties';
import { tr, trBlocs, trHtml, trNote } from '../../app/src/textes';

const lire = (chemin: string): string => readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), 'utf8');
const controler = (nom: string, html: string): string[] => constatsAffichage(texteVisible(html), { langue: 'en' }).map((c) => `${nom} : ${c}`);
/** CSV : la virgule y est le separateur, pas une virgule decimale. */
const controlerCsv = (nom: string, csv: string): string[] =>
  constatsAffichage(csv, { langue: 'en' })
    .filter((c) => !c.startsWith('virgule decimale'))
    .map((c) => `${nom} : ${c}`);

/** Squelette d'une page : les attributs que lit le script, dans l'ordre. */
function squelette(html: string): string[] {
  return [...html.matchAll(/\s(id|data-[a-z-]+|type|inputmode|accept|value)="([^"]*)"/g)].map((m) => `${m[1]}=${m[2]}`);
}

describe('page anglaise', () => {
  const fr = lire('../../app/index.html');
  const en = lire('../../app/en/index.html');

  it('meme squelette que la page francaise', () => {
    expect(squelette(en)).toEqual(squelette(fr));
  });

  it('langue, script commun, liens entre les deux versions', () => {
    expect(en).toContain('<html lang="en">');
    expect(en).toContain('src="../src/main.ts"');
    expect(en).toMatch(/class="barre-langue" href="\.\.\/"/);
    expect(fr).toMatch(/class="barre-langue" href="en\/"/);
  });

  it('titre anglais, aucun reste de francais', () => {
    expect(contenuBalise(en, 'h1')).toBe('Continuous beams');
    expect(controler('page', en.replace(/lang="fr"[^>]*>FR</, '>'))).toEqual([]);
  });
});

describe('affichage en anglais', () => {
  beforeEach(() => definirLangue('en'));
  afterEach(() => definirLangue('fr'));

  const CARTOUCHE = { projet: 'Hall', element: '', date: '2026-10-30' };

  /** Les exemples, puis les memes en beton arme et en acier. */
  function modeles(): ModeleSaisie[] {
    const base = Object.values(EXEMPLES).map((e) => structuredClone(e.modele));
    const ba = base.map((m) => ({ ...structuredClone(m), ba: { ...m.ba, actif: true }, acier: { ...m.acier, actif: false } }));
    const acier = base.map((m) => ({ ...structuredClone(m), ba: { ...m.ba, actif: false }, acier: { ...m.acier, actif: true } }));
    const te = { ...structuredClone(ba[0]), ba: { ...ba[0].ba, forme: 'te' as const, b_eff: '800', h_f: '120', monolithique: true } };
    return [...base, ...ba, ...acier, te];
  }

  it('ecran, dessins, note et CSV', () => {
    const constats: string[] = [];
    let calcules = 0;
    modeles().forEach((m, i) => {
      const ecran: string[] = [lignesAppuis(m), lignesRotules(m), lignesCharges(m)];
      const r = calculerTout(m);
      if (!r.ok) {
        constats.push(...controler(`modele ${i} erreur`, `<p>${notationHtml(tr(r.message))}</p>`));
        return;
      }
      calcules++;
      const c = r.calcul;
      const L = c.poutre.longueur;
      ecran.push(dessinSchema(c.poutre), resume(c.direct), tableauReactions(c.direct), tableauTravees(c.direct));
      ecran.push(...(['M', 'V', 'w'] as const).map((g) => dessinDiagramme(c.direct, g)));
      for (const env of [c.comb.elu, c.comb.caracteristique, c.comb.frequente, c.comb.quasiPermanente]) {
        const zones = env === c.comb.elu ? c.comb.casELU.zones : c.comb.cas.zones;
        ecran.push(resumeEnveloppe(env), tableauEnveloppeAppuis(env, zones), tableauEnveloppeTravees(env, zones));
        ecran.push(dessinEnveloppe(env, L, 'M', `${env.combinaison.nom} — moment fléchissant`), dessinEnveloppe(env, L, 'w', `${env.combinaison.nom} — flèche`));
        const d = env.travees[0].M_max;
        ecran.push(`<p>${env.combinaison.nom} — disposition : ${libelleDisposition(env, zones, d)}.</p>`);
      }
      ecran.push(...avertissementsDuCalcul(c).map((a) => `<p>${notationHtml(tr(a))}</p>`), ...avertissementsEnveloppe(c.comb.elu).map((a) => `<p>${notationHtml(tr(a))}</p>`));
      if (c.ba !== null) {
        const { donnees, resultat } = c.ba;
        const z = resultat.zones.map((x) => x.zone);
        ecran.push(lignesFerraillage(m, z, c.poutre.appuis.map((a) => a.x)));
        ecran.push(dessinEpure(resultat, L, donnees.aciers), tableauBAFlexion(resultat, donnees.aciers), tableauBAArrets(resultat), tableauBATranchant(resultat), tableauBAExtremites(resultat));
      }
      if (c.acier !== null) {
        ecran.push(lignesAcier(m, c.acier.resultat.zones.map((x) => x.zone)), tableauAcier(c.acier.resultat));
      }
      ecran.push(...dessins(c).map((d) => `<p>${d.titre}</p>${d.svg}`));
      constats.push(...ecran.flatMap((h, j) => controler(`modele ${i} ecran ${j}`, trHtml(h))));
      const note = noteDeCalculHtml(trNote(noteDuCalcul(c, CARTOUCHE, avertissementsDuCalcul(c))), STYLES_TRACE);
      constats.push(...controler(`modele ${i} note`, note));
      constats.push(...controlerCsv(`modele ${i} csv`, resultatsEnCsv(blocsEnTexte(trBlocs([...blocsDEntree(c), ...blocsDeSortie(c)])))));
    });
    expect(calcules).toBeGreaterThan(10);
    expect(constats).toEqual([]);
  });

  it('messages et erreurs', () => {
    const m = structuredClone(Object.values(EXEMPLES)[0].modele);
    const erreur = (x: Partial<ModeleSaisie>): string => {
      const r = calculerTout({ ...structuredClone(m), ...x });
      return r.ok ? '' : r.message;
    };
    const json = (t: string): string => {
      try {
        modeleDepuisJson(t);
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
      return '';
    };
    const messages = [
      erreur({ longueur: 'abc' }),
      erreur({ longueur: '0' }),
      erreur({ E: '0' }),
      erreur({ appuis: [] }),
      erreur({ appuis: [{ ...m.appuis[0], x: '99' }] }),
      erreur({ appuis: [m.appuis[0], { ...m.appuis[0] }] }),
      erreur({ appuis: [m.appuis[0]] }),
      erreur({ rotules: ['0'] }),
      erreur({ rotules: ['3', '3'] }),
      erreur({ charges: [{ ...m.charges[0], a: '5', b: '5' }] }),
      erreur({ charges: [{ ...m.charges[0], q: 'x' }] }),
      erreur({ combinaisons: { ...m.combinaisons, psi0: '2' } }),
      erreur({ combinaisons: { ...m.combinaisons, gamma_T: '-1' } }),
      erreur({ ba: { ...m.ba, actif: true, h: '0' } }),
      erreur({ ba: { ...m.ba, actif: true, cotTheta: '3' } }),
      erreur({ ba: { ...m.ba, actif: true, montage: 'xx' } }),
      erreur({ ba: { ...m.ba, actif: true, a_inf: '400', a_sup: '400' } }),
      erreur({ ba: { ...m.ba, actif: true }, acier: { ...m.acier, actif: true } }),
      erreur({ acier: { ...m.acier, actif: true, flecheLimite: '0' } }),
      json('{'),
      json('{}'),
      tr('Une nouvelle version est disponible. Recharger maintenant ?'),
      tr('Aucun calcul à exporter : lancer le calcul, puis réessayer.'),
      tr('Les données saisies ont changé depuis ce calcul : la note décrit le dernier calcul lancé.'),
      tr('element absent de la page : #x'),
    ];
    expect(messages.flatMap((t, i) => controler(`message ${i}`, `<p>${notationHtml(tr(t))}</p>`))).toEqual([]);
    expect(messages.slice(0, 21).filter((t) => t === '')).toEqual([]);
  });
});
