/**
 * Mise en forme des resultats : tableaux HTML et blocs de sortie (CSV, note).
 *
 * Tout ici est PUR — aucun `document`.
 */

import { echapper, nombreFr, tauxFr, type BlocResultat } from 'aedificium-ui';
import {
  LIBELLES_APPUI,
  libelleDisposition,
  libelleLit,
  retientLaRotation,
  type AciersChoisis,
  type Appui,
  type Determinant,
  type Enveloppe,
  type Flexion,
  type Reaction,
  type ResultatBA,
  type ResultatPoutre,
  type Zone,
  type ResultatAcier,
} from '../../src/index';
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

// --- Enveloppes ------------------------------------------------------------------

function dispo(env: Enveloppe, zones: Zone[], d: Determinant): string {
  return `<span class="clause">${echapper(libelleDisposition(env, zones, d))}</span>`;
}

function cellule(d: Determinant, env: Enveloppe, zones: Zone[], dec = 2): string {
  return `<td class="valeur">${nombreFr(d.valeur, dec)} <span class="clause">x=${cote(d.x)}</span><br />${dispo(env, zones, d)}</td>`;
}

export function tableauEnveloppeTravees(env: Enveloppe, zones: Zone[]): string {
  const els = env.combinaison.etat === 'ELS';
  const lignes = env.travees
    .map(
      (t) =>
        `<tr><td>${echapper(t.nom)}</td>` +
        cellule(t.M_max, env, zones) +
        cellule(t.M_min, env, zones) +
        cellule(t.V_max, env, zones) +
        cellule(t.V_min, env, zones) +
        (els ? cellule(t.w_max, env, zones) : '') +
        `</tr>`
    )
    .join('');
  return (
    `<div class="defilement"><table class="tableau"><thead><tr><th>zone</th><th>M<sub>max</sub> (kN·m)</th><th>M<sub>min</sub> (kN·m)</th>` +
    `<th>V<sub>max</sub> (kN)</th><th>V<sub>min</sub> (kN)</th>${els ? '<th>w extreme (mm)</th>' : ''}</tr></thead><tbody>${lignes}</tbody></table></div>`
  );
}

export function tableauEnveloppeAppuis(env: Enveloppe, zones: Zone[]): string {
  const lignes = env.appuis
    .map(
      (a, i) =>
        `<tr><td>A${i + 1}</td><td class="valeur">${cote(a.appui.x)}</td>` +
        cellule(a.R_max, env, zones) +
        cellule(a.R_min, env, zones) +
        cellule(a.M_min, env, zones) +
        `</tr>`
    )
    .join('');
  return (
    `<div class="defilement"><table class="tableau"><thead><tr><th>appui</th><th>x (m)</th><th>R<sub>max</sub> (kN) &uarr;+</th>` +
    `<th>R<sub>min</sub> (kN)</th><th>M<sub>min</sub> sur appui (kN·m)</th></tr></thead><tbody>${lignes}</tbody></table></div>`
  );
}

export function resumeEnveloppe(env: Enveloppe): string {
  const v = env.combinaison.variantes.map((x) => `<li>${echapper(x.nom)}</li>`).join('');
  return `<p class="note">${echapper(env.combinaison.nom)}, variantes de coefficients combinees a Q placee travee par travee :</p><ul class="variantes">${v}</ul>`;
}

/** Soulevement : reaction minimale negative. */
export function avertissementsEnveloppe(env: Enveloppe): string[] {
  return env.appuis
    .map((a, i) =>
      a.R_min.valeur < -1e-6
        ? `Appui A${i + 1} : reaction minimale ${nombreFr(a.R_min.valeur, 2)} kN, soulevement possible (${env.combinaison.nom}) ; l outil suppose l appui bilateral.`
        : null
    )
    .filter((t): t is string => t !== null);
}

export function blocsEnveloppe(env: Enveloppe, zones: Zone[]): BlocResultat[] {
  const l = (s: string, lib: string, d: Determinant, u: string): { symbole: string; libelle: string; valeur: string } => ({
    symbole: s,
    libelle: `${lib}, x = ${cote(d.x)} m ; ${libelleDisposition(env, zones, d)}`,
    valeur: `${nombreFr(d.valeur, 2)} ${u}`,
  });
  return [
    ...env.travees.map((t) => ({
      titre: `${env.combinaison.nom} — ${t.nom}`,
      lignes: [
        l('M_max', 'moment maximal', t.M_max, 'kN.m'),
        l('M_min', 'moment minimal', t.M_min, 'kN.m'),
        l('V_max', 'effort tranchant maximal', t.V_max, 'kN'),
        l('V_min', 'effort tranchant minimal', t.V_min, 'kN'),
      ],
      note: null,
    })),
    {
      titre: `${env.combinaison.nom} — appuis`,
      lignes: env.appuis.flatMap((a, i) => [
        l(`R_max A${i + 1}`, 'reaction maximale', a.R_max, 'kN'),
        l(`R_min A${i + 1}`, 'reaction minimale', a.R_min, 'kN'),
        l(`M_min A${i + 1}`, 'moment sur appui minimal', a.M_min, 'kN.m'),
      ]),
      note: null,
    },
  ];
}

// --- Beton arme ------------------------------------------------------------------------

const mm2 = (v: number | null): string => (v === null ? '—' : nombreFr(v, 0));

function ligneFlexion(nom: string, f: Flexion | null, lit: string): string {
  if (f === null) return `<tr><td>${echapper(nom)}</td><td class="valeur" colspan="8">pas de moment de ce signe</td></tr>`;
  const taux = f.M_Rd === null ? '—' : tauxFr(f.M_Ed / f.M_Rd);
  const classe = f.M_Rd === null ? '' : f.M_Ed <= f.M_Rd ? ' ok' : ' refus';
  const As = f.As2_req > 0 ? `${mm2(f.As_req)} + ${mm2(f.As2_req)} comp.` : mm2(f.As_req);
  return (
    `<tr><td>${echapper(nom)}</td><td class="valeur">${nombreFr(f.M_Ed, 2)}</td><td class="valeur">${As}</td>` +
    `<td class="valeur">${mm2(f.As_min)}</td><td class="valeur">${nombreFr(f.xu_d_req, 3)} &le; ${nombreFr(f.xu_d_limite, 3)}</td>` +
    `<td>${echapper(lit)}</td><td class="valeur">${mm2(f.As_prov)}</td><td class="valeur">${f.M_Rd === null ? '—' : nombreFr(f.M_Rd, 2)}</td>` +
    `<td class="valeur${classe}">${taux}</td></tr>`
  );
}

export function tableauBAFlexion(ba: ResultatBA, aciers: AciersChoisis): string {
  const zones = ba.zones
    .map((z, j) => ligneFlexion(z.zone.nom, z.flexion, `${libelleLit(aciers.zones[j].filants)} + ${libelleLit(aciers.zones[j].renforts)}`))
    .join('');
  const appuis = ba.appuis
    .map((a, i) =>
      ligneFlexion(
        `appui A${i + 1}${a.delta === 1 ? '' : `, δ = ${nombreFr(a.delta, 2)}`}`,
        a.flexion,
        `${libelleLit(aciers.montage)} + ${libelleLit(aciers.appuis[i].chapeaux)}`
      )
    )
    .join('');
  const tete =
    `<thead><tr><th>section</th><th>M<sub>Ed</sub> (kN·m)</th><th>A<sub>s,req</sub> (mm²)</th><th>A<sub>s,min</sub> (mm²)</th>` +
    `<th>x<sub>u</sub>/d</th><th>aciers choisis</th><th>A<sub>s</sub> (mm²)</th><th>M<sub>Rd</sub> (kN·m)</th><th>taux</th></tr></thead>`;
  return (
    `<h3>Flexion, aciers inferieurs (moment positif)</h3><div class="defilement"><table class="tableau">${tete}<tbody>${zones}</tbody></table></div>` +
    `<h3>Flexion, aciers superieurs sur appui (moment negatif)</h3><div class="defilement"><table class="tableau">${tete}<tbody>${appuis}</tbody></table></div>` +
    `<p class="note">d<sub>inf</sub> = ${nombreFr(ba.d_inf, 0)} mm, d<sub>sup</sub> = ${nombreFr(ba.d_sup, 0)} mm. Au-dela de la limite de x<sub>u</sub>/d, aciers comprimes ajoutes (limite du §5.5(4), &delta; = 1 hors redistribution). M<sub>Rd</sub> : aciers tendus seuls, diagramme parabole-rectangle (section-uls).</p>`
  );
}

export function tableauBAArrets(ba: ResultatBA): string {
  const lignes: string[] = [];
  for (const z of ba.zones) {
    const r = z.renforts;
    lignes.push(
      `<tr><td>${echapper(z.zone.nom)} &middot; renforts bas</td>` +
        (r === null
          ? `<td colspan="4">non necessaires : les filants couvrent l'epure (M<sub>Rd</sub> = ${nombreFr(z.M_Rd_filants, 2)} kN·m)</td>`
          : `<td class="valeur">${cote(r.necessaire[0])} – ${cote(r.necessaire[1])}</td><td class="valeur">${cote(r.de)}</td><td class="valeur">${cote(r.a)}</td><td class="valeur">${cote(r.a - r.de)}</td>`) +
        `</tr>`
    );
  }
  ba.appuis.forEach((a, i) => {
    const c = a.chapeaux;
    if (c === null) return;
    lignes.push(
      `<tr><td>appui A${i + 1} &middot; chapeaux</td><td class="valeur">${cote(c.necessaire[0])} – ${cote(c.necessaire[1])}</td>` +
        `<td class="valeur">${cote(c.de)}</td><td class="valeur">${cote(c.a)}</td><td class="valeur">${cote(c.a - c.de)} <span class="clause">(${cote(a.x - c.de)} + ${cote(c.a - a.x)})</span></td></tr>`
    );
  });
  return (
    `<h3>Arret des barres</h3><div class="defilement"><table class="tableau"><thead><tr><th>barres</th><th>necessaires de – a (m)</th>` +
    `<th>debut (m)</th><th>fin (m)</th><th>longueur (m)</th></tr></thead><tbody>${lignes.join('')}</tbody></table></div>` +
    `<p class="note">Courbe enveloppe decalee de a<sub>l</sub> = ${nombreFr(ba.a_l, 3)} m (§9.2.1.3(2)) ; barres prolongees de l<sub>bd</sub> = ${nombreFr(ba.l_bd_inf, 0)} mm en bas et ${nombreFr(ba.l_bd_sup, 0)} mm en haut au-dela du point ou elles ne sont plus necessaires (§9.2.1.3(3) ; &alpha; = 1, &sigma;<sub>sd</sub> = f<sub>yd</sub>, adherence selon la position de coulage, §8.4).</p>`
  );
}

export function tableauBATranchant(ba: ResultatBA): string {
  const lignes = ba.zones
    .flatMap((z) =>
      z.tranchant.map((t) => {
        const taux = t.V_Ed_reduit / t.V_Rd_s;
        const okBielles = t.V_Ed <= t.V_Rd_max;
        return (
          `<tr><td>${echapper(z.zone.nom)}</td><td class="valeur">${cote(t.x)}</td><td class="valeur">${nombreFr(t.V_Ed, 1)}</td><td class="valeur">${nombreFr(t.V_Ed_reduit, 1)}</td>` +
          `<td class="valeur">${nombreFr(t.V_Rd_c, 1)}</td><td class="valeur${okBielles ? '' : ' refus'}">${nombreFr(t.V_Rd_max, 1)}</td>` +
          `<td class="valeur">${nombreFr(t.Asw_s_req, 3)}</td><td class="valeur">${nombreFr(t.Asw_s_prov, 3)}</td>` +
          `<td class="valeur">${nombreFr(t.V_Rd_s, 1)}</td><td class="valeur${taux <= 1 ? ' ok' : ' refus'}">${tauxFr(taux)}</td><td class="valeur">${nombreFr(t.s_max, 0)}</td></tr>`
        );
      })
    )
    .join('');
  return (
    `<h3>Effort tranchant</h3><div class="defilement"><table class="tableau"><thead><tr><th>zone</th><th>appui x (m)</th><th>V<sub>Ed</sub> axe (kN)</th>` +
    `<th>V<sub>Ed</sub> a d du nu</th><th>V<sub>Rd,c</sub></th><th>V<sub>Rd,max</sub></th><th>A<sub>sw</sub>/s req (mm²/mm)</th><th>A<sub>sw</sub>/s choisi</th>` +
    `<th>V<sub>Rd,s</sub></th><th>taux</th><th>s<sub>max</sub> (mm)</th></tr></thead><tbody>${lignes}</tbody></table></div>` +
    `<p class="note">§6.2.2 et §6.2.3, cadres droits, z = 0,9 d. V<sub>Ed</sub> reduit a d du nu de l'appui (§6.2.1(8)) pour les cadres ; V<sub>Rd,max</sub> compare a V<sub>Ed</sub> a l'axe. A<sub>sw</sub>/s requis : minimum &rho;<sub>w,min</sub> compris (§9.2.2(5)).</p>`
  );
}

export function tableauBAExtremites(ba: ResultatBA): string {
  const lignes: string[] = [];
  ba.appuis.forEach((a, i) => {
    if (a.ancrage !== null) {
      const ok = a.ancrage.As_prov >= a.ancrage.As_req;
      lignes.push(
        `<tr><td>A${i + 1}</td><td>ancrage des aciers inferieurs, F<sub>E</sub> = ${nombreFr(a.ancrage.F_E, 1)} kN (§9.2.1.4(2))</td>` +
          `<td class="valeur">${mm2(a.ancrage.As_req)} mm²</td><td class="valeur${ok ? ' ok' : ' refus'}">${mm2(a.ancrage.As_prov)} mm²</td>` +
          `<td class="valeur">${Number.isFinite(a.ancrage.l_requise) ? `l<sub>bd</sub> ${nombreFr(a.ancrage.l_requise, 0)} mm au-dela du nu` : '—'}</td></tr>`
      );
    }
    if (a.monolithique !== null) {
      const ok = a.monolithique.As_prov >= a.monolithique.As_req;
      lignes.push(
        `<tr><td>A${i + 1}</td><td>aciers superieurs pour &beta;<sub>1</sub> M<sub>travee</sub> = ${nombreFr(a.monolithique.M, 1)} kN·m (§9.2.1.2(1))</td>` +
          `<td class="valeur">${mm2(a.monolithique.As_req)} mm²</td><td class="valeur${ok ? ' ok' : ' refus'}">${mm2(a.monolithique.As_prov)} mm²</td><td></td></tr>`
      );
    }
  });
  for (const z of ba.zones) {
    if (!z.zone.nom.startsWith('travee') || z.part_filants === null) continue;
    lignes.push(
      `<tr><td>${echapper(z.zone.nom)}</td><td>aciers inferieurs prolonges sur appuis (§9.2.1.4(1), §9.2.1.5(1))</td>` +
        `<td class="valeur">25 %</td><td class="valeur${z.part_filants >= 0.25 ? ' ok' : ' refus'}">${nombreFr(z.part_filants * 100, 0)} %</td><td></td></tr>`
    );
  }
  if (lignes.length === 0) return '';
  return (
    `<h3>Appuis d'extremite et dispositions</h3><div class="defilement"><table class="tableau"><thead><tr><th></th><th>constat</th><th>requis</th><th>en place</th><th></th></tr></thead>` +
    `<tbody>${lignes.join('')}</tbody></table></div>`
  );
}

export function blocsBA(ba: ResultatBA, aciers: AciersChoisis): BlocResultat[] {
  const fl = (titre: string, f: Flexion | null, lit: string): BlocResultat => ({
    titre,
    lignes:
      f === null
        ? []
        : [
            { symbole: 'M_Ed', libelle: 'moment de calcul', valeur: `${nombreFr(f.M_Ed, 2)} kN.m` },
            { symbole: 'A_s,req', libelle: 'aciers tendus necessaires', valeur: `${mm2(f.As_req)} mm2` },
            { symbole: 'A_s2,req', libelle: 'aciers comprimes necessaires', valeur: `${mm2(f.As2_req)} mm2` },
            { symbole: 'A_s,min', libelle: 'minimum §9.2.1.1', valeur: `${mm2(f.As_min)} mm2` },
            { symbole: 'x_u/d', libelle: `axe neutre, limite ${nombreFr(f.xu_d_limite, 3)}`, valeur: nombreFr(f.xu_d_req, 3) },
            { symbole: 'aciers', libelle: 'aciers choisis', valeur: lit },
            { symbole: 'M_Rd', libelle: 'moment resistant des aciers choisis', valeur: f.M_Rd === null ? '—' : `${nombreFr(f.M_Rd, 2)} kN.m` },
            { symbole: 'taux', libelle: 'M_Ed / M_Rd', valeur: f.M_Rd === null ? '—' : tauxFr(f.M_Ed / f.M_Rd) },
          ],
    note: f === null ? 'Pas de moment de ce signe.' : null,
  });
  return [
    ...ba.zones.map((z, j) =>
      fl(`Beton arme — ${z.zone.nom}, aciers inferieurs`, z.flexion, `${libelleLit(aciers.zones[j].filants)} + ${libelleLit(aciers.zones[j].renforts)}`)
    ),
    ...ba.appuis.map((a, i) =>
      fl(`Beton arme — appui A${i + 1}, aciers superieurs`, a.flexion, `${libelleLit(aciers.montage)} + ${libelleLit(aciers.appuis[i].chapeaux)}`)
    ),
    {
      titre: 'Beton arme — arret des barres',
      lignes: [
        ...ba.zones.map((z) => ({
          symbole: z.zone.nom,
          libelle: 'renforts inferieurs',
          valeur: z.renforts === null ? 'non necessaires' : `de ${cote(z.renforts.de)} a ${cote(z.renforts.a)} m`,
        })),
        ...ba.appuis.flatMap((a) =>
          a.chapeaux === null ? [] : [{ symbole: `A${a.indice + 1}`, libelle: 'chapeaux', valeur: `de ${cote(a.chapeaux.de)} a ${cote(a.chapeaux.a)} m` }]
        ),
      ],
      note: `a_l = ${nombreFr(ba.a_l, 3)} m ; l_bd = ${nombreFr(ba.l_bd_inf, 0)} mm (bas), ${nombreFr(ba.l_bd_sup, 0)} mm (haut).`,
    },
    {
      titre: 'Beton arme — effort tranchant',
      lignes: ba.zones.flatMap((z) =>
        z.tranchant.map((t) => ({
          symbole: `${z.zone.nom}, x = ${cote(t.x)}`,
          libelle: `V_Ed ${nombreFr(t.V_Ed, 1)} kN (axe), ${nombreFr(t.V_Ed_reduit, 1)} kN a d du nu ; V_Rd,max ${nombreFr(t.V_Rd_max, 1)} kN ; V_Rd,s ${nombreFr(t.V_Rd_s, 1)} kN`,
          valeur: `A_sw/s req ${nombreFr(t.Asw_s_req, 3)} mm2/mm`,
        }))
      ),
      note: null,
    },
  ];
}

// --- Acier --------------------------------------------------------------------------

const VERDICTS_ACIER = { conforme: 'Conforme', 'non-conforme': 'Non conforme', incomplet: 'Verification incomplete' } as const;

function celluleTaux(t: number | null): string {
  if (t === null) return '<td class="valeur">—</td>';
  return `<td class="valeur${t <= 1 ? ' ok' : ' refus'}">${tauxFr(t)}</td>`;
}

/**
 * Tableau de la poutre en acier, zone par zone. L'ecran et la note le
 * rendent tel quel ; le CSV lit `blocsAcier`, les memes grandeurs.
 */
export function tableauAcier(r: ResultatAcier): string {
  const c = r.profil;
  const lignes = r.zones
    .map(
      (z) =>
        `<tr><td>${echapper(z.zone.nom)}</td><td class="valeur">${nombreFr(z.M_Ed, 1)}</td><td class="valeur">${nombreFr(z.V_Ed, 1)}</td>` +
        `<td class="valeur">${z.element === null ? '—' : z.element.classification.classe}</td>` +
        celluleTaux(z.tauxSection) +
        celluleTaux(z.tauxCisaillement) +
        `<td class="valeur">${nombreFr(z.L_LT, 2)}</td>` +
        celluleTaux(z.tauxDeversement) +
        `<td class="valeur">${nombreFr(z.w, 1)} / ${nombreFr(z.w_lim, 1)}</td>` +
        celluleTaux(z.tauxFleche) +
        '</tr>' +
        (z.erreur === null ? '' : `<tr><td></td><td colspan="9" class="refus">${echapper(z.erreur)}</td></tr>`)
    )
    .join('');
  return (
    `<p class="verdict verdict-${r.verdict}">${VERDICTS_ACIER[r.verdict]}</p>` +
    `<p class="note">${echapper(c.nom)} : A = ${nombreFr(c.A / 100, 1)} cm², I<sub>y</sub> = ${nombreFr(c.Iy / 1e4, 0)} cm⁴, ` +
    `poids propre ${nombreFr(c.poids, 3)} kN/m, EI = ${nombreFr(c.EI, 0)} kN·m².</p>` +
    '<div class="defilement"><table class="tableau"><thead><tr><th>zone</th><th>M<sub>Ed</sub> (kN.m)</th><th>V<sub>Ed</sub> (kN)</th><th>classe</th>' +
    '<th>M<sub>Ed</sub> / M<sub>y,V,Rd</sub></th><th>V<sub>Ed</sub> / V<sub>pl,Rd</sub></th><th>L<sub>LT</sub> (m)</th><th>M<sub>Ed</sub> / M<sub>b,Rd</sub></th>' +
    `<th>w / w<sub>lim</sub> (mm)</th><th>fleche</th></tr></thead><tbody>${lignes}</tbody></table></div>` +
    '<p class="note">ELU : EN 1993-1-1 §6.2 (section, interaction M-V) et §6.3.2 (deversement), par sections-ec3. ' +
    'ELS : fleche de l enveloppe caracteristique, limite L / n saisie. Taux lineaires sollicitation / resistance.</p>'
  );
}

/** Blocs du CSV et de la note : une ligne par grandeur et par zone. */
export function blocsAcier(r: ResultatAcier): BlocResultat[] {
  const t = (x: number | null) => (x === null ? '—' : tauxFr(x));
  return [
    ...r.zones.map((z) => ({
      titre: `Acier — ${z.zone.nom}`,
      lignes: [
        { symbole: 'M_Ed', libelle: 'moment maximal en valeur absolue, ELU', valeur: `${nombreFr(z.M_Ed, 2)} kN.m` },
        { symbole: 'V_Ed', libelle: 'effort tranchant maximal, ELU', valeur: `${nombreFr(z.V_Ed, 2)} kN` },
        { symbole: 'classe', libelle: 'classe de section', valeur: z.element === null ? '—' : String(z.element.classification.classe) },
        { symbole: 'M_Ed / M_y,V,Rd', libelle: 'section, §6.2.5 et §6.2.8', valeur: t(z.tauxSection) },
        { symbole: 'V_Ed / V_pl,Rd', libelle: 'cisaillement, §6.2.6', valeur: t(z.tauxCisaillement) },
        { symbole: 'L_LT', libelle: 'longueur entre maintiens', valeur: `${nombreFr(z.L_LT, 2)} m` },
        { symbole: 'M_Ed / M_b,Rd', libelle: 'deversement, §6.3.2', valeur: t(z.tauxDeversement) },
        { symbole: 'w / w_lim', libelle: 'fleche caracteristique', valeur: `${nombreFr(z.w, 1)} / ${nombreFr(z.w_lim, 1)} mm` },
        { symbole: 'taux fleche', libelle: 'w / w_lim', valeur: t(z.tauxFleche) },
      ],
      note: z.erreur,
    })),
    {
      titre: 'Acier — verdict',
      lignes: [{ symbole: 'constat', libelle: 'verdict', valeur: VERDICTS_ACIER[r.verdict] }],
      note: r.avertissements.join(' '),
    },
  ];
}
