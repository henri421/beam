/**
 * Cablage de l'interface des poutres continues.
 *
 * Ce module ne calcule RIEN : il tient le modele de saisie, appelle le noyau
 * au clic sur « Calculer », et confie a `form`, `dessin`, `vue` et `export`
 * — tous purs — la lecture de la saisie et la mise en forme. Le schema
 * mecanique suit la saisie en direct ; les resultats ne changent qu'au calcul,
 * et un bandeau signale qu'ils ne correspondent plus a la saisie.
 */

import { csv, nombreFr, ouvrirOuTelecharger, resultatsEnCsv, svgAutonome, telecharger, type BlocResultat } from 'aedificium-ui';
import { LIBELLES_APPUI, LIBELLES_CHARGE, calculerPoutre, verifierDonnees, type ResultatPoutre, type TypeAppui, type TypeCharge } from '../../src/index';
import {
  EXEMPLES,
  lignesAppuis,
  lignesCharges,
  lignesRotules,
  modeleDepuisJson,
  modeleEnJson,
  modeleParDefaut,
  nouvelAppui,
  nouvelleCharge,
  poutreDepuisModele,
  type LigneAppui,
  type LigneCharge,
  type Liste,
  type ModeleSaisie,
} from './form';
import { cote, dessinDiagramme, dessinSchema } from './dessin';
import { blocsResultats, messageDErreur, resume, tableauReactions, tableauTravees, valeursLeLongDeLaPoutre } from './vue';
import { STYLES_TRACE, noteDeCalculHtml } from './export';
import './style.css';

/** Element attendu de la page ; son absence est une erreur de developpement. */
function exige<T extends Element>(selecteur: string): T {
  const trouve = document.querySelector(selecteur);
  if (trouve === null) throw new Error(`element absent de la page : ${selecteur}`);
  return trouve as T;
}

const formulaire = exige<HTMLFormElement>('#formulaire');
const selecteurExemple = exige<HTMLSelectElement>('[data-role="exemple"]');
const fichier = exige<HTMLInputElement>('[data-role="ouvrir"]');
const zones = {
  rigidite: exige<HTMLElement>('[data-role="rigidite"]'),
  appuis: exige<HTMLElement>('[data-role="appuis"]'),
  rotules: exige<HTMLElement>('[data-role="rotules"]'),
  charges: exige<HTMLElement>('[data-role="charges"]'),
  erreurSaisie: exige<HTMLElement>('[data-role="erreur-saisie"]'),
  schema: exige<HTMLElement>('[data-role="schema"]'),
  perime: exige<HTMLElement>('[data-role="perime"]'),
  erreurCalcul: exige<HTMLElement>('[data-role="erreur-calcul"]'),
  attente: exige<HTMLElement>('[data-role="attente"]'),
  corps: exige<HTMLElement>('[data-role="resultats-corps"]'),
  resume: exige<HTMLElement>('[data-role="resume"]'),
  diagrammes: exige<HTMLElement>('[data-role="diagrammes"]'),
  reactions: exige<HTMLElement>('[data-role="reactions"]'),
  travees: exige<HTMLElement>('[data-role="travees"]'),
};

function montrer(el: HTMLElement, message: string | null): void {
  el.textContent = message ?? '';
  el.hidden = message === null;
}

// --- Etat ---------------------------------------------------------------------

const CLE_STOCKAGE = 'poutres-continues.modele';

let modele: ModeleSaisie = modeleParDefaut();
let resultat: ResultatPoutre | null = null;
/** Saisie au moment du dernier calcul : les sorties decrivent ce calcul, pas la saisie en cours. */
let modeleDuCalcul: ModeleSaisie = modele;

/** Le stockage local peut etre interdit (navigation privee, apercu) : on s'en passe. */
function sauvegarder(): void {
  try {
    localStorage.setItem(CLE_STOCKAGE, modeleEnJson(modele));
  } catch {
    /* sans stockage, la saisie vit le temps de la page */
  }
}

function modeleSauvegarde(): ModeleSaisie | null {
  try {
    const texte = localStorage.getItem(CLE_STOCKAGE);
    return texte === null ? null : modeleDepuisJson(texte);
  } catch {
    return null;
  }
}

// --- Saisie -------------------------------------------------------------------

function ecrireChampsPoutre(): void {
  for (const el of formulaire.querySelectorAll<HTMLInputElement>('input[data-champ]:not([data-liste])')) {
    const nom = el.dataset.champ as 'longueur' | 'E' | 'I';
    el.value = modele[nom];
  }
}

function rendreLesListes(): void {
  zones.appuis.innerHTML = lignesAppuis(modele);
  zones.rotules.innerHTML = lignesRotules(modele);
  zones.charges.innerHTML = lignesCharges(modele);
}

/** Schema et rigidite en direct ; une saisie incoherente est signalee sans effacer le schema. */
function rafraichirSchema(): void {
  const lecture = poutreDepuisModele(modele);
  if (!lecture.ok) {
    montrer(zones.erreurSaisie, lecture.message);
    return;
  }
  zones.rigidite.textContent = `EI = ${nombreFr(lecture.poutre.EI, 0)} kN·m²`;
  try {
    verifierDonnees(lecture.poutre);
  } catch (e) {
    montrer(zones.erreurSaisie, messageDErreur(e));
    return;
  }
  montrer(zones.erreurSaisie, null);
  zones.schema.innerHTML = dessinSchema(lecture.poutre);
}

function apresModification(): void {
  rafraichirSchema();
  zones.perime.hidden = resultat === null;
  sauvegarder();
}

// --- Calcul ---------------------------------------------------------------------

function peindreResultat(r: ResultatPoutre): void {
  zones.resume.innerHTML = resume(r);
  zones.diagrammes.innerHTML = (['M', 'V', 'w'] as const).map((g) => dessinDiagramme(r, g)).join('');
  zones.reactions.innerHTML = tableauReactions(r);
  zones.travees.innerHTML = tableauTravees(r);
}

function calculer(): void {
  const lecture = poutreDepuisModele(modele);
  zones.attente.hidden = true;
  zones.perime.hidden = true;
  if (!lecture.ok) {
    montrer(zones.erreurCalcul, lecture.message);
    zones.corps.hidden = true;
    resultat = null;
    return;
  }
  try {
    resultat = calculerPoutre(lecture.poutre);
  } catch (e) {
    montrer(zones.erreurCalcul, messageDErreur(e));
    zones.corps.hidden = true;
    resultat = null;
    return;
  }
  modeleDuCalcul = structuredClone(modele);
  montrer(zones.erreurCalcul, null);
  peindreResultat(resultat);
  zones.corps.hidden = false;
}

function chargerModele(m: ModeleSaisie): void {
  modele = m;
  ecrireChampsPoutre();
  rendreLesListes();
  rafraichirSchema();
  sauvegarder();
  calculer();
}

// --- Evenements de saisie --------------------------------------------------------

formulaire.addEventListener('input', (evenement) => {
  const el = evenement.target;
  if (!(el instanceof HTMLInputElement) || el.type === 'file') return;
  const champ = el.dataset.champ;
  if (champ === undefined) return;
  const liste = el.dataset.liste as Liste | undefined;
  if (liste === undefined) {
    modele[champ as 'longueur' | 'E' | 'I'] = el.value;
  } else {
    const i = Number(el.dataset.index);
    if (liste === 'rotules') modele.rotules[i] = el.value;
    else if (liste === 'appuis') modele.appuis[i][champ as Exclude<keyof LigneAppui, 'type'>] = el.value;
    else modele.charges[i][champ as Exclude<keyof LigneCharge, 'type'>] = el.value;
  }
  apresModification();
});

formulaire.addEventListener('change', (evenement) => {
  const el = evenement.target;
  if (!(el instanceof HTMLSelectElement) || el.dataset.champ !== 'type') return;
  const i = Number(el.dataset.index);
  if (el.dataset.liste === 'appuis') modele.appuis[i].type = el.value as TypeAppui;
  if (el.dataset.liste === 'charges') modele.charges[i].type = el.value as TypeCharge;
  rendreLesListes();
  apresModification();
});

formulaire.addEventListener('submit', (evenement) => {
  evenement.preventDefault();
  calculer();
});

formulaire.addEventListener('click', (evenement) => {
  const cible = evenement.target;
  if (!(cible instanceof HTMLElement)) return;
  const bouton = cible.closest<HTMLButtonElement>('button[data-action]');
  if (bouton === null) return;
  const action = bouton.dataset.action;
  const liste = bouton.dataset.liste as Liste | undefined;
  if (action === 'ajouter' && liste !== undefined) {
    if (liste === 'appuis') modele.appuis.push(nouvelAppui(''));
    if (liste === 'rotules') modele.rotules.push('');
    if (liste === 'charges') modele.charges.push(nouvelleCharge((bouton.dataset.type ?? 'ponctuelle') as TypeCharge, modele.longueur));
    rendreLesListes();
    apresModification();
    // Le curseur va dans le premier champ de la ligne ajoutee.
    const zone = zones[liste];
    zone.querySelector<HTMLElement>('.ligne:last-child input')?.focus();
  } else if (action === 'retirer' && liste !== undefined) {
    modele[liste].splice(Number(bouton.dataset.index), 1);
    rendreLesListes();
    apresModification();
  } else if (action === 'enregistrer') {
    telecharger('poutre.json', modeleEnJson(modele), 'application/json;charset=utf-8');
  }
});

selecteurExemple.innerHTML += Object.entries(EXEMPLES)
  .map(([cle, e]) => `<option value="${cle}">${e.libelle}</option>`)
  .join('');
selecteurExemple.addEventListener('change', () => {
  const exemple = EXEMPLES[selecteurExemple.value];
  if (exemple !== undefined) chargerModele(structuredClone(exemple.modele));
  selecteurExemple.value = '';
});

fichier.addEventListener('change', () => {
  const f = fichier.files?.[0];
  if (f === undefined) return;
  void f.text().then((texte) => {
    try {
      chargerModele(modeleDepuisJson(texte));
    } catch (e) {
      montrer(zones.erreurSaisie, messageDErreur(e));
    }
    fichier.value = '';
  });
});

// --- Sorties ---------------------------------------------------------------------

function blocsDEntree(r: ResultatPoutre): BlocResultat[] {
  const p = r.poutre;
  return [
    {
      titre: 'Poutre',
      lignes: [
        { symbole: 'L', libelle: 'longueur totale', valeur: `${cote(p.longueur)} m` },
        { symbole: 'E', libelle: 'module d elasticite', valeur: `${modeleDuCalcul.E} MPa` },
        { symbole: 'I', libelle: 'inertie', valeur: `${modeleDuCalcul.I} cm4` },
        { symbole: 'EI', libelle: 'rigidite de flexion', valeur: `${nombreFr(p.EI, 0)} kN.m2` },
        { symbole: 'rotules', libelle: 'rotules internes', valeur: p.rotules.length === 0 ? 'aucune' : p.rotules.map((x) => `${cote(x)} m`).join(', ') },
      ],
      note: null,
    },
    {
      titre: 'Appuis',
      lignes: p.appuis.map((a, i) => {
        const details: string[] = [`x = ${cote(a.x)} m`];
        if ('tassement' in a && a.tassement !== 0) details.push(`tassement ${nombreFr(a.tassement, 2)} mm`);
        if (a.type === 'ressort' && a.k_vertical > 0) details.push(`k_v = ${nombreFr(a.k_vertical, 0)} kN/m`);
        if ((a.type === 'ressort' || a.type === 'encastrement-elastique') && a.k_rotation > 0) details.push(`k_theta = ${nombreFr(a.k_rotation, 0)} kN.m/rad`);
        return { symbole: `A${i + 1}`, libelle: LIBELLES_APPUI[a.type], valeur: details.join(', ') };
      }),
      note: null,
    },
    {
      titre: 'Charges',
      lignes: p.charges.map((c, i) => {
        const valeur =
          c.type === 'ponctuelle'
            ? `P = ${nombreFr(c.P, 2)} kN a x = ${cote(c.x)} m`
            : c.type === 'moment'
              ? `M = ${nombreFr(c.M, 2)} kN.m a x = ${cote(c.x)} m`
              : c.type === 'repartie'
                ? `q = ${nombreFr(c.q, 2)} kN/m de ${cote(c.a)} a ${cote(c.b)} m`
                : `q = ${nombreFr(c.q_a, 2)} a ${nombreFr(c.q_b, 2)} kN/m de ${cote(c.a)} a ${cote(c.b)} m`;
        return { symbole: `C${i + 1}`, libelle: LIBELLES_CHARGE[c.type], valeur };
      }),
      note: p.charges.length === 0 ? 'Aucune charge.' : null,
    },
  ];
}

const HYPOTHESES = [
  'Calcul elastique lineaire au premier ordre, petits deplacements.',
  'Poutre d Euler-Bernoulli de rigidite EI constante ; deformation d effort tranchant et effort normal negliges.',
  'Methode des deplacements ; solution exacte entre noeuds pour des charges au plus lineaires.',
  'Appuis bilateraux : une reaction negative (soulevement) est rendue telle quelle.',
  'Charges telles que saisies, sans combinaison ni coefficient partiel ni charge alternee.',
  'Signes : charges vers le bas positives ; M positif fibre inferieure tendue ; V = dM/dx ; fleche positive vers le bas ; moments appliques et de reaction positifs dans le sens trigonometrique.',
];

function dessins(r: ResultatPoutre): string[] {
  return [dessinSchema(r.poutre), dessinDiagramme(r, 'M'), dessinDiagramme(r, 'V'), dessinDiagramme(r, 'w')];
}

document.addEventListener('click', (evenement) => {
  const cible = evenement.target;
  if (!(cible instanceof HTMLElement)) return;
  const action = cible.dataset.action;
  if (action === undefined || !action.startsWith('exporter-')) return;
  if (resultat === null) {
    montrer(zones.erreurCalcul, 'Aucun calcul a exporter : lancer le calcul, puis reessayer.');
    return;
  }
  const r = resultat;
  const noms = ['schema', 'moment', 'effort-tranchant', 'deformee'];
  if (action === 'exporter-dessins') {
    dessins(r).forEach((svg, i) => telecharger(`poutre-${noms[i]}.svg`, svgAutonome(svg, STYLES_TRACE), 'image/svg+xml;charset=utf-8'));
  } else if (action === 'exporter-resultats') {
    telecharger('poutre-resultats.csv', resultatsEnCsv([...blocsDEntree(r), ...blocsResultats(r)]), 'text/csv;charset=utf-8');
  } else if (action === 'exporter-valeurs') {
    telecharger('poutre-valeurs.csv', csv(valeursLeLongDeLaPoutre(r)), 'text/csv;charset=utf-8');
  } else if (action === 'exporter-note') {
    const avertissements = zones.perime.hidden ? [] : ['Les donnees saisies ont change depuis ce calcul : la note decrit le dernier calcul lance.'];
    const html = noteDeCalculHtml(
      {
        titre: `Poutre de ${cote(r.poutre.longueur)} m, ${r.poutre.appuis.length} appuis`,
        date: new Date().toISOString().slice(0, 10),
        entrees: blocsDEntree(r),
        dessins: dessins(r),
        resultats: blocsResultats(r),
        avertissements,
        hypotheses: HYPOTHESES,
      },
      STYLES_TRACE
    );
    ouvrirOuTelecharger('poutre-note.html', html);
  }
});

// --- Demarrage ---------------------------------------------------------------------

chargerModele(modeleSauvegarde() ?? modeleParDefaut());

// Hors navigateur (tests), pas de service worker.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  void import('./pwa').then((m) => m.enregistrerServiceWorker());
}
