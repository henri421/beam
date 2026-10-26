/**
 * Styles des traces exportes (SVG autonomes, note de calcul).
 *
 * Tout ici est PUR — aucun `document`. Le telechargement vit dans
 * `aedificium-ui` (`telecharger`, `ouvrirOuTelecharger`).
 */

import { JETONS } from 'aedificium-ui';

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
