/**
 * Cablage de l'interface des poutres continues.
 *
 * Ce module ne calcule RIEN : il tient le modele de saisie, appelle le noyau
 * au clic sur « Calculer », et confie a `form`, `dessin`, `vue` et `export`
 * — tous purs — la lecture de la saisie et la mise en forme. Le schema
 * mecanique suit la saisie en direct ; les resultats ne changent qu'au calcul,
 * et un bandeau signale qu'ils ne correspondent plus a la saisie.
 */

import { blocsEnTexte, csv, notationHtml, notationTexte, nombreAffiche, ouvrirOuTelecharger, resultatsEnCsv, svgAutonome, telecharger } from 'aedificium-ui';
import {
  libelleDisposition,
  resultatDeDisposition,
  verifierDonnees,
  zonesDeChargement,
  type Determinant,
  type Enveloppe,
  type Poutre,
  type ResultatPoutre,
  type TypeAppui,
  type TypeCharge,
  caracteristiquesProfil,
} from '../../src/index';
import {
  EXEMPLES,
  ajusterFerraillage,
  lignesAppuis,
  lignesCharges,
  lignesFerraillage,
  lignesRotules,
  modeleDepuisJson,
  modeleEnJson,
  modeleParDefaut,
  nouvelAppui,
  nouvelleCharge,
  poutreDepuisModele,
  type LigneAppui,
  type LigneCharge,
  type ModeleSaisie,
  lignesAcier,
  profilsEnI,
} from './form';
import { cote, dessinDiagramme, dessinEnveloppe, dessinEpure, dessinSchema } from './dessin';
import {
  avertissementsEnveloppe,
  messageDErreur,
  resume,
  resumeEnveloppe,
  tableauBAArrets,
  tableauBAExtremites,
  tableauBAFlexion,
  tableauBATranchant,
  tableauEnveloppeAppuis,
  tableauEnveloppeTravees,
  tableauReactions,
  tableauTravees,
  tableauAcier,
  valeursLeLongDeLaPoutre,
} from './vue';
import { STYLES_TRACE, noteDeCalculHtml } from './export';
import {
  HYPOTHESES,
  avertissementsDuCalcul,
  blocsDEntree,
  blocsDeSortie,
  calculerTout,
  dessins,
  type Calcul,
} from './sorties';
import './style.css';

/** Element attendu de la page ; son absence est une erreur de developpement. */
function exige<T extends Element>(selecteur: string): T {
  const trouve = document.querySelector(selecteur);
  if (trouve === null) throw new Error(`element absent de la page : ${selecteur}`);
  return trouve as T;
}

const formulaire = exige<HTMLFormElement>('#formulaire');
const selecteurExemple = exige<HTMLSelectElement>('[data-role="exemple"]');
const selecteurVue = exige<HTMLSelectElement>('[data-role="vue"]');
const selecteurDisposition = exige<HTMLSelectElement>('[data-role="disposition"]');
const selecteurDessin = exige<HTMLSelectElement>('[data-role="dessin-a-exporter"]');
const fichier = exige<HTMLInputElement>('[data-role="ouvrir"]');
const zones = {
  rigidite: exige<HTMLElement>('[data-role="rigidite"]'),
  appuis: exige<HTMLElement>('[data-role="appuis"]'),
  rotules: exige<HTMLElement>('[data-role="rotules"]'),
  charges: exige<HTMLElement>('[data-role="charges"]'),
  ferraillage: exige<HTMLElement>('[data-role="ferraillage"]'),
  erreurSaisie: exige<HTMLElement>('[data-role="erreur-saisie"]'),
  schema: exige<HTMLElement>('[data-role="schema"]'),
  perime: exige<HTMLElement>('[data-role="perime"]'),
  erreurCalcul: exige<HTMLElement>('[data-role="erreur-calcul"]'),
  attente: exige<HTMLElement>('[data-role="attente"]'),
  corps: exige<HTMLElement>('[data-role="resultats-corps"]'),
  avertissements: exige<HTMLElement>('[data-role="avertissements"]'),
  choixDisposition: exige<HTMLElement>('[data-role="choix-disposition"]'),
  resume: exige<HTMLElement>('[data-role="resume"]'),
  diagrammes: exige<HTMLElement>('[data-role="diagrammes"]'),
  reactions: exige<HTMLElement>('[data-role="reactions"]'),
  travees: exige<HTMLElement>('[data-role="travees"]'),
  sectionBA: exige<HTMLElement>('#beton-arme'),
  baAvertissements: exige<HTMLElement>('[data-role="ba-avertissements"]'),
  baCorps: exige<HTMLElement>('[data-role="ba-corps"]'),
  sectionAcier: exige<HTMLElement>('#acier'),
  acierAvertissements: exige<HTMLElement>('[data-role="acier-avertissements"]'),
  acierCorps: exige<HTMLElement>('[data-role="acier-corps"]'),
  acierZones: exige<HTMLElement>('[data-role="acier-zones"]'),
};

// Liste des profils en I, par famille, une fois pour toutes.
exige<HTMLSelectElement>('[data-role="profils"]').innerHTML = profilsEnI()
  .map((f) => `<optgroup label="${f.famille}">${f.noms.map((n) => `<option value="${n}">${n}</option>`).join('')}</optgroup>`)
  .join('');

function montrer(el: HTMLElement, message: string | null): void {
  el.textContent = message === null ? '' : notationTexte(message);
  el.hidden = message === null;
}

function alertes(messages: string[]): string {
  return messages.map((m) => `<p class="alerte">${notationHtml(m)}</p>`).join('');
}

// --- Etat ---------------------------------------------------------------------

const CLE_STOCKAGE = 'poutres-continues.modele';

type Vue = 'elu' | 'caracteristique' | 'frequente' | 'quasiPermanente' | 'direct';

const VUES: [Vue, string][] = [
  ['elu', 'Enveloppe ELU'],
  ['caracteristique', 'Enveloppe ELS caractéristique'],
  ['frequente', 'Enveloppe ELS fréquente'],
  ['quasiPermanente', 'Enveloppe ELS quasi permanente'],
  ['direct', 'Charges caractéristiques G + Q, toutes travées chargées'],
];

let modele: ModeleSaisie = modeleParDefaut();
let calcul: Calcul | null = null;
let vue: Vue = 'elu';
let signatureZones = '';

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

// --- Champs statiques ------------------------------------------------------------

type Chemin = 'longueur' | 'E' | 'I' | `comb.${string}` | `ba.${string}` | `acier.${string}`;

function lireChemin(chemin: Chemin): string | boolean {
  if (chemin.startsWith('comb.')) return (modele.combinaisons as unknown as Record<string, string>)[chemin.slice(5)];
  if (chemin.startsWith('ba.')) return (modele.ba as unknown as Record<string, string | boolean>)[chemin.slice(3)];
  if (chemin.startsWith('acier.')) return (modele.acier as unknown as Record<string, string | boolean>)[chemin.slice(6)];
  return modele[chemin as 'longueur' | 'E' | 'I'];
}

function ecrireChemin(chemin: Chemin, valeur: string | boolean): void {
  if (chemin.startsWith('comb.')) (modele.combinaisons as unknown as Record<string, unknown>)[chemin.slice(5)] = valeur;
  else if (chemin.startsWith('ba.')) (modele.ba as unknown as Record<string, unknown>)[chemin.slice(3)] = valeur;
  else if (chemin.startsWith('acier.')) (modele.acier as unknown as Record<string, unknown>)[chemin.slice(6)] = valeur;
  else modele[chemin as 'longueur' | 'E' | 'I'] = String(valeur);
}

function champsStatiques(): (HTMLInputElement | HTMLSelectElement)[] {
  return Array.from(formulaire.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-champ]:not([data-liste])'));
}

function ecrireChampsStatiques(): void {
  for (const el of champsStatiques()) {
    const v = lireChemin(el.dataset.champ as Chemin);
    if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = v === true;
    else el.value = String(v ?? '');
  }
}

function ajusterLesGroupes(): void {
  exige<HTMLElement>('[data-groupe="ba"]').hidden = !modele.ba.actif;
  exige<HTMLElement>('[data-groupe="te"]').hidden = modele.ba.forme !== 'te';
  exige<HTMLElement>('[data-groupe="acier"]').hidden = !modele.acier.actif;
}

// --- Listes ----------------------------------------------------------------------

function rendreLesListes(): void {
  zones.appuis.innerHTML = lignesAppuis(modele);
  zones.rotules.innerHTML = lignesRotules(modele);
  zones.charges.innerHTML = lignesCharges(modele);
  signatureZones = '';
}

/** Lignes de ferraillage : redessinees seulement si les zones changent, pour garder le curseur. */
function rendreFerraillage(poutre: Poutre): void {
  const z = zonesDeChargement(poutre);
  const xs = poutre.appuis.map((a) => a.x);
  ajusterFerraillage(modele, z.length);
  const signature = JSON.stringify([z, xs, modele.ba.actif, modele.acier.actif]);
  if (signature === signatureZones) return;
  signatureZones = signature;
  zones.ferraillage.innerHTML = modele.ba.actif ? lignesFerraillage(modele, z, xs) : '';
  zones.acierZones.innerHTML = modele.acier.actif ? lignesAcier(modele, z) : '';
}

/** Schema et rigidite en direct ; une saisie incoherente est signalee sans effacer le schema. */
function rafraichirSchema(): void {
  ajusterLesGroupes();
  const lecture = poutreDepuisModele(modele);
  if (!lecture.ok) {
    montrer(zones.erreurSaisie, lecture.message);
    return;
  }
  zones.rigidite.textContent = `EI = ${nombreAffiche(lecture.poutre.EI, 0)} kN·m²`;
  try {
    verifierDonnees(lecture.poutre);
  } catch (e) {
    montrer(zones.erreurSaisie, messageDErreur(e));
    return;
  }
  montrer(zones.erreurSaisie, null);
  zones.schema.innerHTML = dessinSchema(lecture.poutre);
  if (modele.ba.actif || modele.acier.actif) rendreFerraillage(lecture.poutre);
  if (modele.acier.actif) {
    try {
      zones.rigidite.textContent = `EI = ${nombreAffiche(caracteristiquesProfil(modele.acier.profil).EI, 0)} kN·m² (profil ${modele.acier.profil})`;
    } catch {
      // Profil inconnu : le calcul le dira.
    }
  }
}

function apresModification(): void {
  rafraichirSchema();
  zones.perime.hidden = calcul === null;
  sauvegarder();
}

// --- Calcul ---------------------------------------------------------------------

function enveloppeDeLaVue(c: Calcul, v: Exclude<Vue, 'direct'>): Enveloppe {
  return c.comb[v];
}

/** Determinants proposes au rejeu : un par extremum, sans doublon de disposition. */
function determinants(env: Enveloppe): [string, Determinant][] {
  const liste: [string, Determinant][] = [];
  env.travees.forEach((t) => {
    liste.push([`${t.nom} : M max`, t.M_max], [`${t.nom} : M min`, t.M_min]);
  });
  env.appuis.forEach((a, i) => {
    liste.push([`A${i + 1} : M min sur appui`, a.M_min], [`A${i + 1} : R max`, a.R_max], [`A${i + 1} : R min`, a.R_min]);
  });
  const vus = new Set<string>();
  return liste.filter(([, d]) => {
    const cle = `${d.variante}|${d.zones.join(',')}`;
    if (vus.has(cle)) return false;
    vus.add(cle);
    return true;
  });
}

function peindreResultat(c: Calcul): void {
  zones.avertissements.innerHTML = alertes([...c.comb.avertissements, ...avertissementsEnveloppe(c.comb.elu)]);
  selecteurVue.innerHTML = VUES.map(([k, l]) => `<option value="${k}"${k === vue ? ' selected' : ''}>${l}</option>`).join('');
  const L = c.poutre.longueur;
  if (vue === 'direct') {
    zones.choixDisposition.hidden = true;
    peindreUnCas(c.direct, `<p class="note">Toutes les charges à leur valeur caractéristique (G + Q), sans coefficient, toutes travées chargées.</p>`);
  } else {
    const env = enveloppeDeLaVue(c, vue);
    const cas = vue === 'elu' ? c.comb.casELU : c.comb.cas;
    const liste = determinants(env);
    zones.choixDisposition.hidden = false;
    const choisi = selecteurDisposition.value;
    selecteurDisposition.innerHTML =
      `<option value="">— enveloppe —</option>` +
      liste.map(([nom, d], k) => `<option value="${k}"${String(k) === choisi ? ' selected' : ''}>${nom} — ${libelleDisposition(env, cas.zones, d)}</option>`).join('');
    const k = selecteurDisposition.value;
    if (k !== '' && liste[Number(k)] !== undefined) {
      const d = liste[Number(k)][1];
      const r = resultatDeDisposition(cas, env.combinaison.variantes[d.variante], d.zones);
      peindreUnCas(r, `<p class="note">${env.combinaison.nom} — disposition : ${libelleDisposition(env, cas.zones, d)}.</p>`, vue === 'elu');
    } else {
      zones.resume.innerHTML = resumeEnveloppe(env);
      const graphes = [dessinEnveloppe(env, L, 'M', `${env.combinaison.nom} — moment fléchissant`), dessinEnveloppe(env, L, 'V', `${env.combinaison.nom} — effort tranchant`)];
      if (env.combinaison.etat === 'ELS') graphes.push(dessinEnveloppe(env, L, 'w', `${env.combinaison.nom} — flèche`));
      zones.diagrammes.innerHTML = graphes.join('');
      zones.reactions.innerHTML = tableauEnveloppeAppuis(env, cas.zones);
      zones.travees.innerHTML = tableauEnveloppeTravees(env, cas.zones);
    }
  }
  if (c.acier === null) {
    zones.sectionAcier.hidden = true;
  } else {
    zones.sectionAcier.hidden = false;
    zones.acierAvertissements.innerHTML = alertes(c.acier.resultat.avertissements);
    zones.acierCorps.innerHTML = tableauAcier(c.acier.resultat);
  }
  if (c.ba === null) {
    zones.sectionBA.hidden = true;
  } else {
    const { donnees, resultat } = c.ba;
    zones.sectionBA.hidden = false;
    zones.baAvertissements.innerHTML = alertes(resultat.avertissements);
    zones.baCorps.innerHTML =
      dessinEpure(resultat, L, donnees.aciers) +
      tableauBAFlexion(resultat, donnees.aciers) +
      tableauBAArrets(resultat) +
      tableauBATranchant(resultat) +
      tableauBAExtremites(resultat);
  }
}

function peindreUnCas(r: ResultatPoutre, entete: string, sansFleche = false): void {
  zones.resume.innerHTML = entete + resume(r);
  const g = sansFleche ? (['M', 'V'] as const) : (['M', 'V', 'w'] as const);
  zones.diagrammes.innerHTML = g.map((x) => dessinDiagramme(r, x)).join('');
  zones.reactions.innerHTML = tableauReactions(r);
  zones.travees.innerHTML = tableauTravees(r);
}

function calculer(): void {
  zones.attente.hidden = true;
  zones.perime.hidden = true;
  const echec = (message: string): void => {
    montrer(zones.erreurCalcul, message);
    zones.corps.hidden = true;
    zones.sectionBA.hidden = true;
    zones.sectionAcier.hidden = true;
    calcul = null;
  };
  const resultat = calculerTout(modele);
  if (!resultat.ok) return echec(resultat.message);
  calcul = resultat.calcul;
  montrer(zones.erreurCalcul, null);
  // La liste des dessins exportables suit le calcul : l'epure n'existe
  // qu'avec le beton arme.
  const choisi = selecteurDessin.value;
  selecteurDessin.innerHTML = dessins(calcul)
    .map(({ nom, titre }) => `<option value="${nom}"${nom === choisi ? ' selected' : ''}>${titre}</option>`)
    .join('');
  peindreResultat(calcul);
  zones.corps.hidden = false;
}

function chargerModele(m: ModeleSaisie): void {
  modele = m;
  ecrireChampsStatiques();
  rendreLesListes();
  rafraichirSchema();
  sauvegarder();
  calculer();
}

// --- Evenements de saisie --------------------------------------------------------

formulaire.addEventListener('input', (evenement) => {
  const el = evenement.target;
  if (!(el instanceof HTMLInputElement) || el.type === 'file' || el.type === 'checkbox') return;
  const champ = el.dataset.champ;
  if (champ === undefined) return;
  const liste = el.dataset.liste;
  const i = Number(el.dataset.index);
  if (liste === undefined) ecrireChemin(champ as Chemin, el.value);
  else if (liste === 'rotules') modele.rotules[i] = el.value;
  else if (liste === 'appuis') modele.appuis[i][champ as Exclude<keyof LigneAppui, 'type'>] = el.value;
  else if (liste === 'charges') modele.charges[i][champ as Exclude<keyof LigneCharge, 'type' | 'cas'>] = el.value;
  else if (liste === 'ferraillage') modele.ba.zones[i][champ as 'filants' | 'renforts'] = el.value;
  else if (liste === 'chapeaux') modele.ba.chapeaux[i] = el.value;
  else if (liste === 'acier') modele.acier.zones[i][champ as 'L_LT' | 'Mcr'] = el.value;
  apresModification();
});

formulaire.addEventListener('change', (evenement) => {
  const el = evenement.target;
  if (el instanceof HTMLInputElement && el.type === 'checkbox' && el.dataset.champ !== undefined) {
    ecrireChemin(el.dataset.champ as Chemin, el.checked);
    if (el.dataset.champ === 'ba.actif' || el.dataset.champ === 'acier.actif') rendreLesListes();
    apresModification();
    return;
  }
  if (!(el instanceof HTMLSelectElement) || el.dataset.champ === undefined) return;
  const i = Number(el.dataset.index);
  if (el.dataset.liste === undefined) {
    ecrireChemin(el.dataset.champ as Chemin, el.value);
  } else if (el.dataset.champ === 'cas') {
    modele.charges[i].cas = el.value === 'Q' ? 'Q' : 'G';
  } else {
    if (el.dataset.liste === 'appuis') modele.appuis[i].type = el.value as TypeAppui;
    if (el.dataset.liste === 'charges') modele.charges[i].type = el.value as TypeCharge;
    rendreLesListes();
  }
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
  const liste = bouton.dataset.liste as 'appuis' | 'rotules' | 'charges' | undefined;
  if (action === 'ajouter' && liste !== undefined) {
    if (liste === 'appuis') modele.appuis.push(nouvelAppui(''));
    if (liste === 'rotules') modele.rotules.push('');
    if (liste === 'charges') modele.charges.push(nouvelleCharge((bouton.dataset.type ?? 'ponctuelle') as TypeCharge, modele.longueur));
    rendreLesListes();
    apresModification();
    // Le curseur va dans le premier champ de la ligne ajoutee.
    zones[liste].querySelector<HTMLElement>('.ligne:last-child input')?.focus();
  } else if (action === 'retirer' && liste !== undefined) {
    const i = Number(bouton.dataset.index);
    modele[liste].splice(i, 1);
    if (liste === 'appuis') modele.ba.chapeaux.splice(i, 1);
    rendreLesListes();
    apresModification();
  } else if (action === 'enregistrer') {
    telecharger('poutre.json', modeleEnJson(modele), 'application/json;charset=utf-8');
  }
});

selecteurVue.addEventListener('change', () => {
  vue = selecteurVue.value as Vue;
  selecteurDisposition.value = '';
  if (calcul !== null) peindreResultat(calcul);
});

selecteurDisposition.addEventListener('change', () => {
  if (calcul !== null) peindreResultat(calcul);
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

document.addEventListener('click', (evenement) => {
  const cible = evenement.target;
  if (!(cible instanceof HTMLElement)) return;
  const action = cible.dataset.action;
  if (action === undefined || !action.startsWith('exporter-')) return;
  if (calcul === null) {
    montrer(zones.erreurCalcul, 'Aucun calcul à exporter : lancer le calcul, puis réessayer.');
    return;
  }
  const c = calcul;
  // Un dessin par clic : plusieurs telechargements lances d'un meme clic, les
  // navigateurs bloquent tous ceux qui suivent le premier.
  if (action === 'exporter-dessin') {
    const d = dessins(c).find((x) => x.nom === selecteurDessin.value);
    if (d !== undefined) telecharger(`poutre-${d.nom}.svg`, svgAutonome(d.svg, STYLES_TRACE), 'image/svg+xml;charset=utf-8');
  } else if (action === 'exporter-resultats') {
    telecharger('poutre-resultats.csv', resultatsEnCsv(blocsEnTexte([...blocsDEntree(c), ...blocsDeSortie(c)])), 'text/csv;charset=utf-8');
  } else if (action === 'exporter-valeurs') {
    telecharger('poutre-valeurs.csv', csv(valeursLeLongDeLaPoutre(c.direct)), 'text/csv;charset=utf-8');
  } else if (action === 'exporter-note') {
    const avertissements = [
      ...(zones.perime.hidden ? [] : ['Les données saisies ont changé depuis ce calcul : la note décrit le dernier calcul lancé.']),
      ...avertissementsDuCalcul(c),
    ];
    const html = noteDeCalculHtml(
      {
        titre: `Poutre de ${cote(c.poutre.longueur)} m, ${c.poutre.appuis.length} appuis`,
        date: new Date().toISOString().slice(0, 10),
        entrees: blocsDEntree(c),
        dessins: dessins(c).map((d) => d.svg),
        resultats: blocsDeSortie(c),
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
