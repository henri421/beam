/**
 * Les sorties : SVG autonomes, CSV, JSON et note de calcul.
 *
 * Tout ici est PUR — aucun `document`. Le telechargement vit dans
 * `aedificium-ui` (`telecharger`, `ouvrirOuTelecharger`).
 */

import { JETONS, echapper, type BlocResultat } from 'aedificium-ui';

/**
 * Styles du trace, jetons compris : un document exporte ne voit pas la
 * feuille de la page, et les jetons seuls DEFINISSENT des couleurs sans en
 * appliquer aucune — le dessin sortirait en aplat noir. Les regles de
 * peinture de `style.css` sont donc recopiees ici ; toute evolution de l'une
 * doit etre reportee dans l'autre.
 */
export const STYLES_TRACE = `${JETONS}

svg { background: var(--surface); color-scheme: light; font-family: var(--sans); }
svg .titre { fill: var(--texte); font-size: 13px; font-weight: 600; }
svg .poutre { stroke: var(--texte); stroke-width: 3.5; stroke-linecap: round; }
svg .appui { fill: var(--surface); stroke: var(--texte); stroke-width: 1.4; }
svg .appui-trait { stroke: var(--texte); stroke-width: 1.4; }
svg .sol { stroke: var(--texte); stroke-width: 1.4; }
svg .hachure { stroke: var(--texte-faible); stroke-width: 1; }
svg .ressort { fill: none; stroke: var(--texte); stroke-width: 1.3; }
svg .rotule { fill: var(--surface); stroke: var(--texte); stroke-width: 1.6; }
svg .charge { fill: var(--compression); fill-opacity: 0.14; stroke: var(--compression); stroke-width: 1.2; }
svg .charge-fleche { stroke: var(--compression); stroke-width: 1.1; }
svg .charge-fleche-tete { fill: var(--compression); }
svg .force { stroke: var(--traction); stroke-width: 2; }
svg .force-tete { fill: var(--traction); }
svg .moment { fill: none; stroke: var(--traction); stroke-width: 1.8; }
svg .moment-tete { fill: var(--traction); }
svg .cote { stroke: var(--neutre); stroke-width: 1; }
svg .cote-texte { fill: var(--texte-doux); font-size: 11px; font-family: var(--mono); }
svg .valeur { fill: var(--texte); font-size: 11px; font-family: var(--mono); }
svg .legende { fill: var(--texte-faible); font-size: 11px; }
svg .repere { stroke: var(--bordure); stroke-width: 1; stroke-dasharray: 3 3; }
svg .axe { stroke: var(--texte); stroke-width: 1.2; }
svg .axe-repos { stroke: var(--neutre); stroke-width: 1.2; stroke-dasharray: 5 4; }
svg .courbe { fill: none; stroke: var(--texte); stroke-width: 1.4; }
svg .aplat-positif { fill: var(--compression); fill-opacity: 0.2; stroke: none; }
svg .aplat-negatif { fill: var(--traction); fill-opacity: 0.2; stroke: none; }
svg .deformee { fill: none; stroke: var(--compression); stroke-width: 2; }
svg .point { fill: var(--texte); }
svg .aplat-enveloppe { fill: var(--compression); fill-opacity: 0.14; stroke: none; }
svg .courbe-max { fill: none; stroke: var(--texte); stroke-width: 1.4; }
svg .courbe-min { fill: none; stroke: var(--texte); stroke-width: 1.4; stroke-dasharray: 5 3; }
svg .courbe-decalee { fill: none; stroke: var(--neutre); stroke-width: 1.2; stroke-dasharray: 4 3; }
svg .resistant { fill: none; stroke: var(--traction); stroke-width: 2; }
svg .coffrage { fill: var(--beton); stroke: var(--texte-faible); stroke-width: 1; }
svg .barre { stroke: var(--traction); stroke-width: 2.4; stroke-linecap: round; }`;

export interface NoteDeCalcul {
  titre: string;
  date: string;
  entrees: BlocResultat[];
  dessins: string[];
  resultats: BlocResultat[];
  avertissements: string[];
  hypotheses: string[];
}

const AIDE_AU_CALCUL =
  "Outil d'aide au calcul. Cet outil constate, il ne prescrit pas. Le calcul est elastique " +
  "lineaire, sur les charges telles que saisies : combinaisons, coefficients partiels, " +
  "redistribution et verifications de section restent a la charge de l'ingenieur. " +
  "Cette note est un compte rendu, pas une justification reglementaire signee.";

const STYLE_NOTE = `
  body { margin: 0; padding: 24px 28px; background: var(--surface); color: var(--texte); font: 14px/1.5 var(--sans); }
  h1 { font-size: 1.1rem; font-weight: normal; letter-spacing: .02em; margin: 0 0 .2rem; }
  h2 { font-size: .95rem; font-weight: 600; margin: 1.6rem 0 .5rem; border-bottom: 1px solid var(--bordure); padding-bottom: .25rem; }
  h3 { font-size: .8rem; font-weight: 600; margin: 1rem 0 .35rem; }
  .date { color: var(--texte-faible); font-size: .8rem; margin: 0 0 1.2rem; }
  table { border-collapse: collapse; width: 100%; margin: .3rem 0 .6rem; }
  td { border-bottom: 1px solid var(--bordure-douce); padding: .25rem .4rem; vertical-align: top; }
  td.sym { font-family: var(--mono); width: 8rem; background: var(--surface-appui); }
  td.lib { color: var(--texte-doux); }
  td.val { font-family: var(--mono); font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
  .note { color: var(--texte-doux); font-size: .8rem; margin: .2rem 0 .8rem; }
  .avertissement { border-left: 3px solid var(--alerte); background: var(--alerte-fond); color: var(--alerte);
                   padding: .5rem .7rem; border-radius: var(--rayon); margin: .5rem 0; font-size: .82rem; }
  .dessin { margin: .6rem 0 1rem; page-break-inside: avoid; }
  .dessin svg { max-width: 100%; height: auto; }
  .pied { margin-top: 2rem; padding-top: .6rem; border-top: 1px solid var(--bordure); color: var(--texte-doux); font-size: .78rem; }
  ul { margin: .3rem 0 .6rem; padding-left: 1.1rem; color: var(--texte-doux); font-size: .82rem; }
  @media print { body { background: #fff; padding: 0; } h2 { page-break-after: avoid; } }
`;

function tableDuBloc(bloc: BlocResultat): string {
  const lignes = bloc.lignes
    .map(
      (l) =>
        `<tr><td class="sym">${echapper(l.symbole)}</td><td class="lib">${echapper(l.libelle)}</td><td class="val">${echapper(l.valeur)}</td></tr>`
    )
    .join('');
  const table = lignes === '' ? '' : `<table>${lignes}</table>`;
  // Le motif est rendu MEME sans ligne : c'est le cas ou il porte toute l'information.
  const note = bloc.note === null ? '' : `<p class="note">${echapper(bloc.note)}</p>`;
  return `<h3>${echapper(bloc.titre)}</h3>${table}${note}`;
}

/**
 * Note de calcul HTML autonome, imprimable en PDF : donnees, schema,
 * diagrammes, reactions et extremums par travee.
 */
export function noteDeCalculHtml(note: NoteDeCalcul, styles: string): string {
  const avertissements = note.avertissements.map((a) => `<p class="avertissement">${echapper(a)}</p>`).join('');
  const dessins = note.dessins.map((svg) => `<div class="dessin">${svg}</div>`).join('');
  const hypotheses =
    note.hypotheses.length === 0
      ? ''
      : `<h2>Hypotheses et limites</h2><ul>${note.hypotheses.map((h) => `<li>${echapper(h)}</li>`).join('')}</ul>`;
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" />
<title>Note de calcul — ${echapper(note.titre)}</title>
<style>${styles}${STYLE_NOTE}</style></head>
<body>
<h1>Note de calcul — poutre continue, calcul elastique lineaire</h1>
<p class="date">${echapper(note.titre)} · ${echapper(note.date)}</p>
${avertissements}
<h2>Donnees d entree</h2>${note.entrees.map(tableDuBloc).join('')}
<h2>Schema et diagrammes</h2>${dessins}
<h2>Resultats</h2>${note.resultats.map(tableDuBloc).join('')}
${hypotheses}
<p class="pied">${AIDE_AU_CALCUL}</p>
</body></html>`;
}
