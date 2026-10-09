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
import {
  LIBELLES_APPUI,
  LIBELLES_CHARGE,
  calculerBetonArme,
  calculerCombinaisons,
  calculerPoutre,
  libelleDisposition,
  profilRecommande,
  resultatDeDisposition,
  verifierDonnees,
  zonesDeChargement,
  type DonneesBA,
  type Determinant,
  type Enveloppe,
  type Poutre,
  type ResultatBA,
  type ResultatCombinaisons,
  type ResultatPoutre,
  type TypeAppui,
  type TypeCharge,
} from '../../src/index';
import {
  EXEMPLES,
  ajusterFerraillage,
  donneesDepuisModele,
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
} from './form';
import { cote, dessinDiagramme, dessinEnveloppe, dessinEpure, dessinSchema } from './dessin';
import {
  avertissementsEnveloppe,
  blocsBA,
  blocsEnveloppe,
  blocsResultats,
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
  valeursLeLongDeLaPoutre,
} from './vue';
import { STYLES_TRACE, noteDeCalculHtml } from './export';
import './style.css';

/** Element attendu de la page ; son absence est une erreur de developpement. */
function exige<T extends Element>(selecteur: string): T {
  const trouve = document.querySelector(selecteur);
  if (trouve === null) throw new Error(`element absent de la page : ${selecteur}`);
  return trouve as T;
}

const PROFIL = profilRecommande();

const formulaire = exige<HTMLFormElement>('#formulaire');
const selecteurExemple = exige<HTMLSelectElement>('[data-role="exemple"]');
const selecteurVue = exige<HTMLSelectElement>('[data-role="vue"]');
const selecteurDisposition = exige<HTMLSelectElement>('[data-role="disposition"]');
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
};

function montrer(el: HTMLElement, message: string | null): void {
  el.textContent = message ?? '';
  el.hidden = message === null;
}

function alertes(messages: string[]): string {
  return messages.map((m) => `<p class="alerte">${m.replace(/</g, '&lt;')}</p>`).join('');
}

// --- Etat ---------------------------------------------------------------------

const CLE_STOCKAGE = 'poutres-continues.modele';

interface Calcul {
  poutre: Poutre;
  /** Toutes les charges a leur valeur caracteristique, toutes travees chargees. */
  direct: ResultatPoutre;
  comb: ResultatCombinaisons;
  ba: { donnees: DonneesBA; resultat: ResultatBA } | null;
  modele: ModeleSaisie;
}

type Vue = 'elu' | 'caracteristique' | 'frequente' | 'quasiPermanente' | 'direct';

const VUES: [Vue, string][] = [
  ['elu', 'Enveloppe ELU'],
  ['caracteristique', 'Enveloppe ELS caracteristique'],
  ['frequente', 'Enveloppe ELS frequente'],
  ['quasiPermanente', 'Enveloppe ELS quasi permanente'],
  ['direct', 'Charges caracteristiques G + Q, toutes travees chargees'],
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

type Chemin = 'longueur' | 'E' | 'I' | `comb.${string}` | `ba.${string}`;

function lireChemin(chemin: Chemin): string | boolean {
  if (chemin.startsWith('comb.')) return (modele.combinaisons as unknown as Record<string, string>)[chemin.slice(5)];
  if (chemin.startsWith('ba.')) return (modele.ba as unknown as Record<string, string | boolean>)[chemin.slice(3)];
  return modele[chemin as 'longueur' | 'E' | 'I'];
}

function ecrireChemin(chemin: Chemin, valeur: string | boolean): void {
  if (chemin.startsWith('comb.')) (modele.combinaisons as unknown as Record<string, unknown>)[chemin.slice(5)] = valeur;
  else if (chemin.startsWith('ba.')) (modele.ba as unknown as Record<string, unknown>)[chemin.slice(3)] = valeur;
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
  const signature = JSON.stringify([z, xs, modele.ba.actif]);
  if (signature === signatureZones) return;
  signatureZones = signature;
  zones.ferraillage.innerHTML = lignesFerraillage(modele, z, xs);
}

/** Schema et rigidite en direct ; une saisie incoherente est signalee sans effacer le schema. */
function rafraichirSchema(): void {
  ajusterLesGroupes();
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
  if (modele.ba.actif) rendreFerraillage(lecture.poutre);
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
    peindreUnCas(c.direct, `<p class="note">Toutes les charges a leur valeur caracteristique (G + Q), sans coefficient, toutes travees chargees.</p>`);
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
      const graphes = [dessinEnveloppe(env, L, 'M', `${env.combinaison.nom} — moment flechissant`), dessinEnveloppe(env, L, 'V', `${env.combinaison.nom} — effort tranchant`)];
      if (env.combinaison.etat === 'ELS') graphes.push(dessinEnveloppe(env, L, 'w', `${env.combinaison.nom} — fleche`));
      zones.diagrammes.innerHTML = graphes.join('');
      zones.reactions.innerHTML = tableauEnveloppeAppuis(env, cas.zones);
      zones.travees.innerHTML = tableauEnveloppeTravees(env, cas.zones);
    }
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
  const lecture = donneesDepuisModele(modele);
  zones.attente.hidden = true;
  zones.perime.hidden = true;
  const echec = (message: string): void => {
    montrer(zones.erreurCalcul, message);
    zones.corps.hidden = true;
    zones.sectionBA.hidden = true;
    calcul = null;
  };
  if (!lecture.ok) return echec(lecture.message);
  try {
    const direct = calculerPoutre(lecture.poutre);
    const comb = calculerCombinaisons(lecture.poutre, lecture.combinaisons, PROFIL, lecture.ba?.classeAcier ?? 'B');
    const ba =
      lecture.ba === null
        ? null
        : { donnees: lecture.ba, resultat: calculerBetonArme(comb.casELU, comb.elu, lecture.ba, PROFIL, lecture.combinaisons.redistribution) };
    calcul = { poutre: lecture.poutre, direct, comb, ba, modele: structuredClone(modele) };
  } catch (e) {
    return echec(messageDErreur(e));
  }
  montrer(zones.erreurCalcul, null);
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
  apresModification();
});

formulaire.addEventListener('change', (evenement) => {
  const el = evenement.target;
  if (el instanceof HTMLInputElement && el.type === 'checkbox' && el.dataset.champ !== undefined) {
    ecrireChemin(el.dataset.champ as Chemin, el.checked);
    if (el.dataset.champ === 'ba.actif') rendreLesListes();
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

function blocsDEntree(c: Calcul): BlocResultat[] {
  const p = c.poutre;
  const m = c.modele;
  const blocs: BlocResultat[] = [
    {
      titre: 'Poutre',
      lignes: [
        { symbole: 'L', libelle: 'longueur totale', valeur: `${cote(p.longueur)} m` },
        { symbole: 'E', libelle: 'module d elasticite', valeur: `${m.E} MPa` },
        { symbole: 'I', libelle: 'inertie', valeur: `${m.I} cm4` },
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
      lignes: p.charges.map((ch, i) => {
        const valeur =
          ch.type === 'ponctuelle'
            ? `P = ${nombreFr(ch.P, 2)} kN a x = ${cote(ch.x)} m`
            : ch.type === 'moment'
              ? `M = ${nombreFr(ch.M, 2)} kN.m a x = ${cote(ch.x)} m`
              : ch.type === 'repartie'
                ? `q = ${nombreFr(ch.q, 2)} kN/m de ${cote(ch.a)} a ${cote(ch.b)} m`
                : `q = ${nombreFr(ch.q_a, 2)} a ${nombreFr(ch.q_b, 2)} kN/m de ${cote(ch.a)} a ${cote(ch.b)} m`;
        return { symbole: `C${i + 1} (${ch.cas ?? 'G'})`, libelle: LIBELLES_CHARGE[ch.type], valeur };
      }),
      note: p.charges.length === 0 ? 'Aucune charge.' : null,
    },
    {
      titre: 'Combinaisons',
      lignes: [
        { symbole: 'ELU', libelle: 'expression', valeur: m.combinaisons.formule === '6.10' ? '(6.10)' : '(6.10a) et (6.10b)' },
        { symbole: 'psi_0, psi_1, psi_2', libelle: 'coefficients de Q', valeur: `${m.combinaisons.psi0} ; ${m.combinaisons.psi1} ; ${m.combinaisons.psi2}` },
        { symbole: 'gamma_T', libelle: 'coefficient des tassements a l ELU', valeur: m.combinaisons.gamma_T },
        ...Object.entries(PROFIL)
          .filter(([, v]) => typeof v === 'object')
          .map(([k, v]) => ({ symbole: k, libelle: (v as { source: string }).source, valeur: String((v as { valeur: number }).valeur) })),
      ],
      note: `Profil : ${PROFIL.nom} (${PROFIL.date}).`,
    },
  ];
  if (c.ba !== null) {
    const s = c.ba.donnees.section;
    blocs.push({
      titre: 'Beton arme',
      lignes: [
        { symbole: 'section', libelle: s.forme === 'te' ? 'en T' : 'rectangulaire', valeur: s.forme === 'te' ? `b_w ${s.b_w}, h ${s.h}, b_eff ${s.b_eff}, h_f ${s.h_f} mm` : `${s.b_w} x ${s.h} mm` },
        { symbole: 'f_ck / f_yk', libelle: 'materiaux', valeur: `${c.ba.donnees.fck} / ${c.ba.donnees.fyk} MPa, classe ${c.ba.donnees.classeAcier}` },
        { symbole: 'a_inf / a_sup', libelle: 'distances fibres - axes des aciers', valeur: `${c.ba.donnees.a_inf} / ${c.ba.donnees.a_sup} mm` },
        { symbole: 'cot theta', libelle: 'inclinaison des bielles', valeur: String(c.ba.donnees.cotTheta) },
      ],
      note: null,
    });
  }
  return blocs;
}

const HYPOTHESES = [
  'Calcul elastique lineaire au premier ordre, petits deplacements ; poutre d Euler-Bernoulli de rigidite EI constante.',
  'Methode des deplacements ; solution exacte entre noeuds pour des charges au plus lineaires.',
  'Enveloppes exactes par superposition : G sur toute la poutre avec un seul coefficient ; Q placee zone par zone la ou elle est defavorable ; tassements pris ou non.',
  'Une seule action variable Q ; appuis bilateraux, un soulevement est signale et rendu tel quel.',
  'Beton arme : flexion simple (section-uls, parabole-rectangle) ; x_u/d limite par le §5.5(4), delta = 1 hors redistribution ; effort tranchant §6.2 cadres droits, z = 0,9 d ; epure decalee de a_l (§9.2.1.3) ; l_bd avec alpha = 1 et sigma_sd = f_yd (dispositions-constructives).',
  'Signes : charges vers le bas positives ; M positif fibre inferieure tendue ; V = dM/dx ; fleche positive vers le bas ; moments appliques et de reaction positifs dans le sens trigonometrique.',
];

function dessins(c: Calcul): { nom: string; svg: string }[] {
  const L = c.poutre.longueur;
  const liste = [
    { nom: 'schema', svg: dessinSchema(c.poutre) },
    { nom: 'elu-moment', svg: dessinEnveloppe(c.comb.elu, L, 'M', `${c.comb.elu.combinaison.nom} — moment flechissant`) },
    { nom: 'elu-effort-tranchant', svg: dessinEnveloppe(c.comb.elu, L, 'V', `${c.comb.elu.combinaison.nom} — effort tranchant`) },
    { nom: 'els-fleche', svg: dessinEnveloppe(c.comb.caracteristique, L, 'w', `${c.comb.caracteristique.combinaison.nom} — fleche`) },
    { nom: 'caracteristique-deformee', svg: dessinDiagramme(c.direct, 'w') },
  ];
  if (c.ba !== null) liste.push({ nom: 'epure', svg: dessinEpure(c.ba.resultat, L, c.ba.donnees.aciers) });
  return liste;
}

function blocsDeSortie(c: Calcul): BlocResultat[] {
  const z = c.comb.cas.zones;
  return [
    ...blocsResultats(c.direct).map((b) => ({ ...b, titre: `Caracteristique G + Q — ${b.titre}` })),
    ...blocsEnveloppe(c.comb.elu, z),
    ...blocsEnveloppe(c.comb.caracteristique, z),
    ...blocsEnveloppe(c.comb.quasiPermanente, z),
    ...(c.ba === null ? [] : blocsBA(c.ba.resultat, c.ba.donnees.aciers)),
  ];
}

document.addEventListener('click', (evenement) => {
  const cible = evenement.target;
  if (!(cible instanceof HTMLElement)) return;
  const action = cible.dataset.action;
  if (action === undefined || !action.startsWith('exporter-')) return;
  if (calcul === null) {
    montrer(zones.erreurCalcul, 'Aucun calcul a exporter : lancer le calcul, puis reessayer.');
    return;
  }
  const c = calcul;
  if (action === 'exporter-dessins') {
    dessins(c).forEach(({ nom, svg }) => telecharger(`poutre-${nom}.svg`, svgAutonome(svg, STYLES_TRACE), 'image/svg+xml;charset=utf-8'));
  } else if (action === 'exporter-resultats') {
    telecharger('poutre-resultats.csv', resultatsEnCsv([...blocsDEntree(c), ...blocsDeSortie(c)]), 'text/csv;charset=utf-8');
  } else if (action === 'exporter-valeurs') {
    telecharger('poutre-valeurs.csv', csv(valeursLeLongDeLaPoutre(c.direct)), 'text/csv;charset=utf-8');
  } else if (action === 'exporter-note') {
    const avertissements = [
      ...(zones.perime.hidden ? [] : ['Les donnees saisies ont change depuis ce calcul : la note decrit le dernier calcul lance.']),
      ...c.comb.avertissements,
      ...avertissementsEnveloppe(c.comb.elu),
      ...(c.ba === null ? [] : c.ba.resultat.avertissements),
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
