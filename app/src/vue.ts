/**
 * Mise en forme des resultats : tableaux HTML et blocs de sortie (CSV, note).
 *
 * Tout ici est PUR — aucun `document`.
 */

import { echapper, nombreFr, type BlocResultat } from 'aedificium-ui';
import { LIBELLES_APPUI, retientLaRotation, type Appui, type Reaction, type ResultatPoutre } from '../../src/index';
import { cote } from './dessin';

/** Message lisible d'une erreur levee par le noyau. */
export function messageDErreur(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const kN = (v: number): string => nombreFr(v, 2);
const ou = (v: number | null, d = 2): string => (v === null ? '—' : nombreFr(v, d));

function retientLeDeplacement(a: Appui): boolean {
  return a.type !== 'glissiere' && !(a.type === 'ressort' && a.k_vertical === 0);
}

/** Moment sur appui : une seule valeur, sauf saut (couple applique sur l'appui). */
function momentSurAppui(re: Reaction): string {
  const g = re.M_gauche;
  const d = re.M_droite;
  if (g === null || d === null || Math.abs(g - d) < 1e-9 * (1 + Math.abs(g))) return ou(g ?? d);
  return `${nombreFr(g, 2)} / ${nombreFr(d, 2)}`;
}

export function resume(r: ResultatPoutre): string {
  const h = r.degreHyperstatique;
  const nature = h === 0 ? 'isostatique' : `hyperstatique de degre ${h}`;
  const ecart = r.equilibre.reactions - r.equilibre.charges;
  return (
    `<table class="grandeurs"><tbody>` +
    `<tr><th>structure</th><td class="libelle">poutre ${nature}</td><td class="valeur">h = ${h}</td></tr>` +
    `<tr><th>EI</th><td class="libelle">rigidite de flexion</td><td class="valeur">${nombreFr(r.poutre.EI, 0)} kN·m²</td></tr>` +
    `<tr><th>&Sigma;F</th><td class="libelle">charges verticales (vers le bas)</td><td class="valeur">${kN(r.equilibre.charges)} kN</td></tr>` +
    `<tr><th>&Sigma;R</th><td class="libelle">reactions verticales (vers le haut)</td><td class="valeur">${kN(r.equilibre.reactions)} kN</td></tr>` +
    `<tr><th>ecart</th><td class="libelle">controle d equilibre &Sigma;R - &Sigma;F</td><td class="valeur">${nombreFr(ecart, 6)} kN</td></tr>` +
    `<tr><th>M<sub>max</sub></th><td class="libelle">moment maximal, a x = ${cote(r.extremes.M_max.x)} m</td><td class="valeur">${kN(r.extremes.M_max.valeur)} kN·m</td></tr>` +
    `<tr><th>M<sub>min</sub></th><td class="libelle">moment minimal, a x = ${cote(r.extremes.M_min.x)} m</td><td class="valeur">${kN(r.extremes.M_min.valeur)} kN·m</td></tr>` +
    `<tr><th>|V|<sub>max</sub></th><td class="libelle">effort tranchant maximal, a x = ${cote(r.extremes.V_max.x)} m</td><td class="valeur">${kN(r.extremes.V_max.valeur)} kN</td></tr>` +
    `<tr><th>|w|<sub>max</sub></th><td class="libelle">fleche maximale, a x = ${cote(r.extremes.w_max.x)} m</td><td class="valeur">${nombreFr(r.extremes.w_max.valeur, 2)} mm</td></tr>` +
    `</tbody></table>`
  );
}

export function tableauReactions(r: ResultatPoutre): string {
  const lignes = r.reactions
    .map((re, i) => {
      const a = re.appui;
      return (
        `<tr><td>A${i + 1}</td><td>${echapper(LIBELLES_APPUI[a.type])}</td><td class="valeur">${cote(a.x)}</td>` +
        `<td class="valeur">${retientLeDeplacement(a) ? kN(re.R) : '—'}</td>` +
        `<td class="valeur">${retientLaRotation(a) ? kN(re.M_reaction) : '—'}</td>` +
        `<td class="valeur">${momentSurAppui(re)}</td>` +
        `<td class="valeur">${ou(re.V_gauche)}</td><td class="valeur">${ou(re.V_droite)}</td>` +
        `<td class="valeur">${nombreFr(re.w, 2)}</td><td class="valeur">${nombreFr(re.rotation, 3)}</td></tr>`
      );
    })
    .join('');
  return (
    `<div class="defilement"><table class="tableau"><thead><tr>` +
    `<th>appui</th><th>type</th><th>x (m)</th><th>R (kN) &uarr;+</th><th>M<sub>r</sub> (kN·m) &#8634;+</th>` +
    `<th>M (kN·m)</th><th>V<sub>g</sub> (kN)</th><th>V<sub>d</sub> (kN)</th><th>w (mm) &darr;+</th><th>&theta; (mrad)</th>` +
    `</tr></thead><tbody>${lignes}</tbody></table></div>`
  );
}

export function tableauTravees(r: ResultatPoutre): string {
  const lignes = r.travees
    .map(
      (t) =>
        `<tr><td>${echapper(t.nom)}</td><td class="valeur">${cote(t.x0)} – ${cote(t.x1)}</td>` +
        `<td class="valeur">${kN(t.M_max.valeur)} <span class="clause">x=${cote(t.M_max.x)}</span></td>` +
        `<td class="valeur">${kN(t.M_min.valeur)} <span class="clause">x=${cote(t.M_min.x)}</span></td>` +
        `<td class="valeur">${kN(t.V_max.valeur)} <span class="clause">x=${cote(t.V_max.x)}</span></td>` +
        `<td class="valeur">${nombreFr(t.w_max.valeur, 2)} <span class="clause">x=${cote(t.w_max.x)}</span></td></tr>`
    )
    .join('');
  return (
    `<div class="defilement"><table class="tableau"><thead><tr>` +
    `<th>travee</th><th>de – a (m)</th><th>M<sub>max</sub> (kN·m)</th><th>M<sub>min</sub> (kN·m)</th>` +
    `<th>V extreme (kN)</th><th>w extreme (mm)</th>` +
    `</tr></thead><tbody>${lignes}</tbody></table></div>`
  );
}

/** Blocs de sortie (CSV, note de calcul). */
export function blocsResultats(r: ResultatPoutre): BlocResultat[] {
  return [
    {
      titre: 'Synthese',
      lignes: [
        { symbole: 'h', libelle: 'degre d hyperstaticite', valeur: String(r.degreHyperstatique) },
        { symbole: 'SF', libelle: 'somme des charges verticales (vers le bas)', valeur: `${kN(r.equilibre.charges)} kN` },
        { symbole: 'SR', libelle: 'somme des reactions verticales (vers le haut)', valeur: `${kN(r.equilibre.reactions)} kN` },
        { symbole: 'M_max', libelle: `moment maximal, x = ${cote(r.extremes.M_max.x)} m`, valeur: `${kN(r.extremes.M_max.valeur)} kN.m` },
        { symbole: 'M_min', libelle: `moment minimal, x = ${cote(r.extremes.M_min.x)} m`, valeur: `${kN(r.extremes.M_min.valeur)} kN.m` },
        { symbole: 'V_max', libelle: `effort tranchant extreme, x = ${cote(r.extremes.V_max.x)} m`, valeur: `${kN(r.extremes.V_max.valeur)} kN` },
        { symbole: 'w_max', libelle: `fleche extreme, x = ${cote(r.extremes.w_max.x)} m`, valeur: `${nombreFr(r.extremes.w_max.valeur, 2)} mm` },
      ],
      note: null,
    },
    ...r.reactions.map((re, i) => {
      const a = re.appui;
      const lignes = [{ symbole: 'x', libelle: 'abscisse', valeur: `${cote(a.x)} m` }];
      if (retientLeDeplacement(a)) lignes.push({ symbole: 'R', libelle: 'reaction verticale, positive vers le haut', valeur: `${kN(re.R)} kN` });
      if (retientLaRotation(a)) lignes.push({ symbole: 'M_r', libelle: 'moment de reaction, sens trigonometrique', valeur: `${kN(re.M_reaction)} kN.m` });
      lignes.push(
        { symbole: 'M', libelle: 'moment flechissant sur appui', valeur: `${momentSurAppui(re)} kN.m` },
        { symbole: 'V_g / V_d', libelle: 'effort tranchant a gauche / a droite', valeur: `${ou(re.V_gauche)} / ${ou(re.V_droite)} kN` },
        { symbole: 'w', libelle: 'deplacement vertical, positif vers le bas', valeur: `${nombreFr(re.w, 2)} mm` },
        { symbole: 'theta', libelle: 'rotation, sens trigonometrique', valeur: `${nombreFr(re.rotation, 3)} mrad` }
      );
      return { titre: `Appui A${i + 1} — ${LIBELLES_APPUI[a.type]}`, lignes, note: null };
    }),
    ...r.travees.map((t) => ({
      titre: `${t.nom[0].toUpperCase()}${t.nom.slice(1)} (${cote(t.x0)} – ${cote(t.x1)} m)`,
      lignes: [
        { symbole: 'M_max', libelle: `moment maximal, x = ${cote(t.M_max.x)} m`, valeur: `${kN(t.M_max.valeur)} kN.m` },
        { symbole: 'M_min', libelle: `moment minimal, x = ${cote(t.M_min.x)} m`, valeur: `${kN(t.M_min.valeur)} kN.m` },
        { symbole: 'V', libelle: `effort tranchant extreme, x = ${cote(t.V_max.x)} m`, valeur: `${kN(t.V_max.valeur)} kN` },
        { symbole: 'w', libelle: `fleche extreme, x = ${cote(t.w_max.x)} m`, valeur: `${nombreFr(t.w_max.valeur, 2)} mm` },
      ],
      note: null,
    })),
  ];
}

/** Valeurs echantillonnees le long de la poutre, pour un tableur (CSV). */
export function valeursLeLongDeLaPoutre(r: ResultatPoutre): string[][] {
  const lignes = [['x (m)', 'V (kN)', 'M (kN.m)', 'w (mm)']];
  for (const c of r.courbes) {
    for (const p of c) lignes.push([nombreFr(p.x, 4), nombreFr(p.V, 3), nombreFr(p.M, 3), nombreFr(p.w, 4)]);
  }
  return lignes;
}
