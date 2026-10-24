/**
 * Traces SVG : schema mecanique de la poutre, diagrammes M et V, deformee.
 *
 * Tout ici est PUR — aucun `document`. Les quatre traces partagent la meme
 * echelle horizontale : places l'un sous l'autre, un appui tombe au meme
 * endroit dans chacun.
 */

import { echapper, nombreAffiche, notationSvg } from 'aedificium-ui';
import {
  libelleLit,
  type AciersChoisis,
  type Appui,
  type Charge,
  type Enveloppe,
  type Point,
  type PointEnveloppe,
  type PointEpure,
  type Poutre,
  type ResultatBA,
  type ResultatPoutre,
} from '../../src/index';

export const LARGEUR = 760;
const MARGE_G = 56;
const MARGE_D = 28;

function echelleX(L: number): (x: number) => number {
  return (x) => MARGE_G + (x / L) * (LARGEUR - MARGE_G - MARGE_D);
}

function f(v: number): string {
  return v.toFixed(1);
}

/** Abscisse en m, a la francaise, sans zeros inutiles. */
export function cote(x: number): string {
  return nombreAffiche(x, 3);
}

/**
 * Texte de valeur centre sur x, ramene dans le cadre pres des bords : une
 * charge en extremite ne doit pas voir son intensite coupee.
 */
function texteBorne(x: number, y: number, texte: string, classe = 'valeur'): string {
  const demi = texte.length * 3.4;
  const xc = Math.min(Math.max(x, demi + 2), LARGEUR - demi - 2);
  return `<text class="${classe}" x="${f(xc)}" y="${f(y)}" text-anchor="middle">${notationSvg(texte)}</text>`;
}

// --- Schema mecanique ----------------------------------------------------------------

const Y_POUTRE = 150;

function hachures(x0: number, y: number, largeur: number): string {
  let s = `<line class="sol" x1="${f(x0)}" y1="${f(y)}" x2="${f(x0 + largeur)}" y2="${f(y)}"/>`;
  for (let x = x0 + 4; x <= x0 + largeur; x += 6) s += `<line class="hachure" x1="${f(x)}" y1="${f(y)}" x2="${f(x - 6)}" y2="${f(y + 6)}"/>`;
  return s;
}

function hachuresVerticales(x: number, y0: number, hauteur: number, cote: -1 | 1): string {
  let s = `<line class="sol" x1="${f(x)}" y1="${f(y0)}" x2="${f(x)}" y2="${f(y0 + hauteur)}"/>`;
  for (let y = y0 + 4; y <= y0 + hauteur; y += 6) s += `<line class="hachure" x1="${f(x)}" y1="${f(y)}" x2="${f(x + 6 * cote)}" y2="${f(y - 6)}"/>`;
  return s;
}

/** Ressort de rotation : spirale autour du noeud. */
function spirale(x: number, y: number): string {
  let d = '';
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * 3.2 * Math.PI;
    const r = 3 + i * 0.28;
    d += `${i === 0 ? 'M' : 'L'} ${f(x + r * Math.cos(a))} ${f(y - r * Math.sin(a))} `;
  }
  return `<path class="ressort" d="${d}"/>`;
}

function zigzag(x: number, y0: number, y1: number): string {
  const n = 6;
  const h = (y1 - y0 - 8) / n;
  let d = `M ${f(x)} ${f(y0)} L ${f(x)} ${f(y0 + 4)}`;
  for (let i = 0; i < n; i++) d += ` L ${f(x + (i % 2 === 0 ? 7 : -7))} ${f(y0 + 4 + h * (i + 0.5))}`;
  d += ` L ${f(x)} ${f(y1 - 4)} L ${f(x)} ${f(y1)}`;
  return `<path class="ressort" d="${d}"/>`;
}

function symboleAppui(a: Appui, X: number, L: number): string {
  const y = Y_POUTRE;
  const extremite = a.x <= 1e-9 ? -1 : a.x >= L - 1e-9 ? 1 : 0;
  const triangle = `<path class="appui" d="M ${f(X)} ${y + 3} L ${f(X - 9)} ${y + 19} L ${f(X + 9)} ${y + 19} Z"/>` + hachures(X - 14, y + 19, 28);
  switch (a.type) {
    case 'appui-simple':
      return triangle;
    case 'encastrement':
      return extremite !== 0
        ? hachuresVerticales(X + extremite * 2, y - 18, 36, extremite)
        : `<rect class="appui" x="${f(X - 9)}" y="${y + 3}" width="18" height="16"/>` + hachures(X - 14, y + 19, 28);
    case 'glissiere': {
      if (extremite !== 0) {
        const xm = X + extremite * 12;
        return (
          `<line class="appui-trait" x1="${f(X)}" y1="${y - 10}" x2="${f(X)}" y2="${y + 10}"/>` +
          `<circle class="appui" cx="${f(X + extremite * 6)}" cy="${y - 6}" r="4"/><circle class="appui" cx="${f(X + extremite * 6)}" cy="${y + 6}" r="4"/>` +
          hachuresVerticales(xm, y - 18, 36, extremite)
        );
      }
      return (
        `<rect class="appui" x="${f(X - 9)}" y="${y + 3}" width="18" height="10"/>` +
        `<circle class="appui" cx="${f(X - 5)}" cy="${y + 17}" r="3.5"/><circle class="appui" cx="${f(X + 5)}" cy="${y + 17}" r="3.5"/>` +
        `<line class="appui-trait" x1="${f(X - 12)}" y1="${y + 14}" x2="${f(X - 12)}" y2="${y + 22}"/>` +
        hachures(X - 14, y + 21, 28)
      );
    }
    case 'encastrement-elastique':
      return triangle + spirale(X, y);
    case 'ressort': {
      let s = '';
      if (a.k_vertical > 0) s += zigzag(X, y + 3, y + 33) + hachures(X - 14, y + 33, 28);
      if (a.k_rotation > 0) s += spirale(X, y);
      return s;
    }
  }
}

function fleche(x: number, y0: number, y1: number, classe: string): string {
  const sens = y1 > y0 ? 1 : -1;
  return (
    `<line class="${classe}" x1="${f(x)}" y1="${f(y0)}" x2="${f(x)}" y2="${f(y1 - sens * 6)}"/>` +
    `<path class="${classe}-tete" d="M ${f(x)} ${f(y1)} L ${f(x - 4)} ${f(y1 - sens * 8)} L ${f(x + 4)} ${f(y1 - sens * 8)} Z"/>`
  );
}

/** Couple : arc de cercle de 270 degres et fleche dans le sens du moment. */
function arcDeMoment(X: number, M: number): string {
  const r = 15;
  const y = Y_POUTRE;
  // Trigonometrique : de -135 a +135 degres en tournant a gauche (vers le haut a l'ecran).
  const a0 = (-135 * Math.PI) / 180;
  const a1 = (135 * Math.PI) / 180;
  const p = (a: number): [number, number] => [X + r * Math.cos(a), y - r * Math.sin(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const trigo = M >= 0;
  // A l'ecran (y vers le bas), le sens trigonometrique est le balayage 0.
  const arc = `<path class="moment" d="M ${f(x0)} ${f(y0)} A ${r} ${r} 0 1 0 ${f(x1)} ${f(y1)}"/>`;
  const [xb, yb, a] = trigo ? [x1, y1, a1] : [x0, y0, a0];
  // Tangente au point d'arrivee, orientee dans le sens de parcours.
  const t = trigo ? a + Math.PI / 2 : a - Math.PI / 2;
  const tx = Math.cos(t);
  const ty = -Math.sin(t);
  const nx = -ty;
  const ny = tx;
  const tete = `<path class="moment-tete" d="M ${f(xb + tx * 7)} ${f(yb + ty * 7)} L ${f(xb + nx * 4)} ${f(yb + ny * 4)} L ${f(xb - nx * 4)} ${f(yb - ny * 4)} Z"/>`;
  return arc + tete + texteBorne(X, y - r - 6, `${nombreAffiche(Math.abs(M), 2)} kN·m`);
}

function chargesReparties(charges: Charge[], X: (x: number) => number): { svg: string; niveaux: number } {
  const reparties = charges.filter((c): c is Extract<Charge, { type: 'repartie' | 'lineaire' }> => c.type === 'repartie' || c.type === 'lineaire');
  if (reparties.length === 0) return { svg: '', niveaux: 0 };
  const qmax = Math.max(...reparties.flatMap((c) => (c.type === 'repartie' ? [Math.abs(c.q)] : [Math.abs(c.q_a), Math.abs(c.q_b)])), 1e-9);
  const H = 34;
  // Les charges qui se recouvrent s'empilent : chacune prend le premier niveau libre.
  const niveaux: [number, number][][] = [];
  let s = '';
  for (const c of reparties) {
    let n = niveaux.findIndex((occ) => occ.every(([a, b]) => c.b <= a + 1e-9 || c.a >= b - 1e-9));
    if (n === -1) {
      niveaux.push([]);
      n = niveaux.length - 1;
    }
    niveaux[n].push([c.a, c.b]);
    const base = Y_POUTRE - 6 - n * (H + 14);
    const qa = c.type === 'repartie' ? c.q : c.q_a;
    const qb = c.type === 'repartie' ? c.q : c.q_b;
    const ha = (Math.abs(qa) / qmax) * H;
    const hb = (Math.abs(qb) / qmax) * H;
    const xa = X(c.a);
    const xb = X(c.b);
    s += `<path class="charge" d="M ${f(xa)} ${f(base)} L ${f(xa)} ${f(base - ha)} L ${f(xb)} ${f(base - hb)} L ${f(xb)} ${f(base)} Z"/>`;
    const nb = Math.max(2, Math.round((xb - xa) / 28));
    for (let i = 0; i <= nb; i++) {
      const x = xa + ((xb - xa) * i) / nb;
      const q = qa + ((qb - qa) * i) / nb;
      const h = (Math.abs(q) / qmax) * H;
      if (h < 5) continue;
      s += q >= 0 ? fleche(x, base - h, base, 'charge-fleche') : fleche(x, base, base - h, 'charge-fleche');
    }
    const libelle = c.type === 'repartie' || qa === qb ? `q = ${nombreAffiche(qa, 2)}` : `${nombreAffiche(qa, 2)} → ${nombreAffiche(qb, 2)}`;
    s += texteBorne((xa + xb) / 2, base - Math.max(ha, hb) - 4, `${libelle} kN/m`);
  }
  return { svg: s, niveaux: niveaux.length };
}

/** Schema mecanique : poutre, appuis, rotules, charges et cotes. */
export function dessinSchema(p: Poutre): string {
  const X = echelleX(p.longueur);
  const reparties = chargesReparties(p.charges, X);
  // Haut du trace : au-dessus de la plus haute charge dessinee, texte compris.
  let haut = Y_POUTRE - 26;
  if (reparties.niveaux > 0) haut = Math.min(haut, Y_POUTRE - 6 - (reparties.niveaux - 1) * 48 - 34 - 18);
  if (p.charges.some((c) => c.type === 'ponctuelle')) haut = Math.min(haut, Y_POUTRE - 76);
  if (p.charges.some((c) => c.type === 'moment')) haut = Math.min(haut, Y_POUTRE - 40);
  let corps = reparties.svg;
  for (const c of p.charges) {
    if (c.type === 'ponctuelle') {
      const x = X(c.x);
      corps += c.P >= 0 ? fleche(x, Y_POUTRE - 58, Y_POUTRE - 2, 'force') : fleche(x, Y_POUTRE - 2, Y_POUTRE - 58, 'force');
      corps += texteBorne(x, Y_POUTRE - 62, `${nombreAffiche(Math.abs(c.P), 2)} kN`);
    }
    if (c.type === 'moment') corps += arcDeMoment(X(c.x), c.M);
  }
  corps += `<line class="poutre" x1="${f(X(0))}" y1="${Y_POUTRE}" x2="${f(X(p.longueur))}" y2="${Y_POUTRE}"/>`;
  for (const a of p.appuis) corps += symboleAppui(a, X(a.x), p.longueur);
  for (const r of p.rotules) corps += `<circle class="rotule" cx="${f(X(r))}" cy="${Y_POUTRE}" r="4.5"/>`;

  // Cotes : extremites et appuis, distances entre reperes successifs.
  const yc = Y_POUTRE + 58;
  const reperes = [...new Set([0, p.longueur, ...p.appuis.map((a) => a.x), ...p.rotules])].sort((a, b) => a - b);
  corps += `<line class="cote" x1="${f(X(0))}" y1="${yc}" x2="${f(X(p.longueur))}" y2="${yc}"/>`;
  reperes.forEach((x, i) => {
    corps += `<line class="cote" x1="${f(X(x))}" y1="${yc - 5}" x2="${f(X(x))}" y2="${yc + 5}"/>`;
    if (i > 0) {
      const d = x - reperes[i - 1];
      if (X(x) - X(reperes[i - 1]) > 22) {
        corps += `<text class="cote-texte" x="${f((X(x) + X(reperes[i - 1])) / 2)}" y="${yc - 4}" text-anchor="middle">${notationSvg(cote(d))}</text>`;
      }
    }
  });
  corps += `<text class="legende" x="${MARGE_G}" y="${yc + 20}">${notationSvg(`cotes en m · L = ${cote(p.longueur)} m`)}</text>`;

  const vb = `0 ${haut} ${LARGEUR} ${yc + 28 - haut}`;
  return `<svg class="trace" xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="schema mecanique de la poutre"><title>${notationSvg('Schema mecanique')}</title>${corps}</svg>`;
}

// --- Diagrammes -------------------------------------------------------------------

export type Grandeur = 'M' | 'V' | 'w';

const DIAGRAMMES: Record<Grandeur, { titre: string; unite: string; versLeBas: boolean; decimales: number }> = {
  // Moment trace du cote de la fibre tendue : positif vers le bas.
  M: { titre: 'Moment flechissant M', unite: 'kN·m', versLeBas: true, decimales: 2 },
  V: { titre: 'Effort tranchant V', unite: 'kN', versLeBas: false, decimales: 2 },
  w: { titre: 'Deformee w', unite: 'mm', versLeBas: true, decimales: 2 },
};

interface Etiquette {
  x: number;
  valeur: number;
}

/** Valeurs a annoter : extremums par travee et valeurs sur appuis, sans doublon proche. */
function etiquettes(r: ResultatPoutre, g: Grandeur): Etiquette[] {
  const brutes: Etiquette[] = [];
  for (const t of r.travees) {
    if (g === 'M') brutes.push(t.M_max, t.M_min);
    if (g === 'V') brutes.push(t.V_max);
    if (g === 'w') brutes.push(t.w_max);
  }
  for (const re of r.reactions) {
    if (g === 'M') {
      if (re.M_gauche !== null) brutes.push({ x: re.appui.x, valeur: re.M_gauche });
      if (re.M_droite !== null) brutes.push({ x: re.appui.x, valeur: re.M_droite });
    }
    if (g === 'V') {
      if (re.V_gauche !== null) brutes.push({ x: re.appui.x, valeur: re.V_gauche });
      if (re.V_droite !== null) brutes.push({ x: re.appui.x, valeur: re.V_droite });
    }
    if (g === 'w' && Math.abs(re.w) > 0) brutes.push({ x: re.appui.x, valeur: re.w });
  }
  const echelle = Math.max(...brutes.map((e) => Math.abs(e.valeur)), 1e-12);
  const retenues: Etiquette[] = [];
  for (const e of brutes.sort((a, b) => Math.abs(b.valeur) - Math.abs(a.valeur))) {
    if (Math.abs(e.valeur) < 1e-3 * echelle) continue;
    const voisine = retenues.some(
      (o) => Math.sign(o.valeur) === Math.sign(e.valeur) && Math.abs(o.x - e.x) < r.poutre.longueur * 0.07
    );
    if (!voisine) retenues.push(e);
  }
  return retenues;
}

/** Diagramme d'une grandeur sur toute la poutre, extremums et valeurs sur appuis annotes. */
export function dessinDiagramme(r: ResultatPoutre, g: Grandeur): string {
  const d = DIAGRAMMES[g];
  const L = r.poutre.longueur;
  const X = echelleX(L);
  const valeur = (p: Point): number => (g === 'M' ? p.M : g === 'V' ? p.V : p.w);
  const toutes = r.courbes.flat().map(valeur);
  const max = Math.max(...toutes.map(Math.abs));
  const H = 62;
  const y0 = 34 + H;
  const echelle = max > 1e-12 ? H / max : 0;
  const Y = (v: number): number => y0 + (d.versLeBas ? 1 : -1) * v * echelle;

  let corps = `<text class="titre" x="8" y="16">${notationSvg(`${d.titre} (${d.unite})`)}</text>`;
  for (const a of r.poutre.appuis) {
    corps += `<line class="repere" x1="${f(X(a.x))}" y1="24" x2="${f(X(a.x))}" y2="${f(y0 + H + 8)}"/>`;
  }
  if (g === 'w') {
    // Deformee : ligne continue, sans aplat ; la poutre au repos en tirets.
    corps += `<line class="axe-repos" x1="${f(X(0))}" y1="${y0}" x2="${f(X(L))}" y2="${y0}"/>`;
    const pts = r.courbes.flat().map((p) => `${f(X(p.x))},${f(Y(p.w))}`);
    corps += `<polyline class="deformee" points="${pts.join(' ')}"/>`;
  } else {
    corps += `<clipPath id="cp-${g}-pos"><rect x="0" y="${d.versLeBas ? y0 : 0}" width="${LARGEUR}" height="${d.versLeBas ? 400 : y0}"/></clipPath>`;
    corps += `<clipPath id="cp-${g}-neg"><rect x="0" y="${d.versLeBas ? 0 : y0}" width="${LARGEUR}" height="${d.versLeBas ? y0 : 400}"/></clipPath>`;
    for (const c of r.courbes) {
      // Aplats separes par signe, pour la couleur ; contour d'un seul tenant.
      const pts = c.map((p) => [X(p.x), Y(valeur(p))] as const);
      const poly = `${f(pts[0][0])},${y0} ${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')} ${f(pts[pts.length - 1][0])},${y0}`;
      corps += `<polygon class="aplat-positif" clip-path="url(#cp-${g}-pos)" points="${poly}"/>`;
      corps += `<polygon class="aplat-negatif" clip-path="url(#cp-${g}-neg)" points="${poly}"/>`;
      corps += `<polyline class="courbe" points="${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}"/>`;
    }
    // Sauts aux noeuds (force ou couple ponctuels) : segments verticaux.
    for (let i = 1; i < r.courbes.length; i++) {
      const a = r.courbes[i - 1][r.courbes[i - 1].length - 1];
      const b = r.courbes[i][0];
      corps += `<line class="courbe" x1="${f(X(a.x))}" y1="${f(Y(valeur(a)))}" x2="${f(X(b.x))}" y2="${f(Y(valeur(b)))}"/>`;
    }
    const premier = r.courbes[0][0];
    const dernier = r.courbes[r.courbes.length - 1][r.courbes[r.courbes.length - 1].length - 1];
    corps += `<line class="courbe" x1="${f(X(0))}" y1="${y0}" x2="${f(X(0))}" y2="${f(Y(valeur(premier)))}"/>`;
    corps += `<line class="courbe" x1="${f(X(L))}" y1="${y0}" x2="${f(X(L))}" y2="${f(Y(valeur(dernier)))}"/>`;
    corps += `<line class="axe" x1="${f(X(0))}" y1="${y0}" x2="${f(X(L))}" y2="${y0}"/>`;
  }
  for (const e of etiquettes(r, g)) {
    const y = Y(e.valeur);
    const dessous = y >= y0;
    const x = Math.min(Math.max(X(e.x), MARGE_G - 20), LARGEUR - 20);
    corps += `<circle class="point" cx="${f(X(e.x))}" cy="${f(y)}" r="2.2"/>`;
    corps += `<text class="valeur" x="${f(x)}" y="${f(dessous ? y + 13 : y - 5)}" text-anchor="middle">${notationSvg(nombreAffiche(e.valeur, d.decimales))}</text>`;
  }
  const hauteur = y0 + H + 22;
  const legende =
    g === 'M' ? 'M > 0 : fibre inferieure tendue, trace vers le bas' : g === 'V' ? 'V = dM/dx, positif vers le haut' : 'fleche positive vers le bas, echelle amplifiee';
  corps += `<text class="legende" x="${LARGEUR - MARGE_D}" y="16" text-anchor="end">${notationSvg(legende)}</text>`;
  return `<svg class="trace" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LARGEUR} ${hauteur}" role="img" aria-label="${d.titre}"><title>${notationSvg(d.titre)}</title>${corps}</svg>`;
}

// --- Enveloppes et epure ------------------------------------------------------------

/** Enveloppe d'une grandeur : courbes max et min, aplat entre les deux, extremums annotes. */
export function dessinEnveloppe(env: Enveloppe, L: number, g: Grandeur, titre: string): string {
  const d = DIAGRAMMES[g];
  const X = echelleX(L);
  const pts = env.courbes.flat();
  const lire = (p: PointEnveloppe): [number, number] => (g === 'M' ? p.M : g === 'V' ? p.V : p.w);
  const max = Math.max(...pts.flatMap((p) => lire(p).map(Math.abs)), 1e-12);
  const H = 62;
  const y0 = 34 + H;
  const Y = (v: number): number => y0 + (d.versLeBas ? 1 : -1) * (v * H) / max;
  let corps = `<text class="titre" x="8" y="16">${notationSvg(`${titre} (${d.unite})`)}</text>`;
  for (const a of env.appuis) corps += `<line class="repere" x1="${f(X(a.appui.x))}" y1="24" x2="${f(X(a.appui.x))}" y2="${f(y0 + H + 8)}"/>`;
  const haut = pts.map((p) => `${f(X(p.x))},${f(Y(lire(p)[1]))}`);
  const bas = pts.map((p) => `${f(X(p.x))},${f(Y(lire(p)[0]))}`).reverse();
  corps += `<polygon class="aplat-enveloppe" points="${[...haut, ...bas].join(' ')}"/>`;
  corps += `<line class="axe" x1="${f(X(0))}" y1="${y0}" x2="${f(X(L))}" y2="${y0}"/>`;
  corps += `<polyline class="courbe-max" points="${haut.join(' ')}"/>`;
  corps += `<polyline class="courbe-min" points="${[...bas].reverse().join(' ')}"/>`;
  const etiq: { x: number; valeur: number }[] = [];
  for (const t of env.travees) {
    if (g === 'M') etiq.push(t.M_max, t.M_min);
    if (g === 'V') etiq.push(t.V_max, t.V_min);
    if (g === 'w') etiq.push(t.w_max);
  }
  if (g === 'M') for (const a of env.appuis) etiq.push(a.M_min);
  const vues: { x: number; valeur: number }[] = [];
  for (const e of etiq.sort((a, b) => Math.abs(b.valeur) - Math.abs(a.valeur))) {
    if (Math.abs(e.valeur) < 1e-3 * max) continue;
    if (vues.some((o) => Math.sign(o.valeur) === Math.sign(e.valeur) && Math.abs(o.x - e.x) < L * 0.07)) continue;
    vues.push(e);
    const y = Y(e.valeur);
    const x = Math.min(Math.max(X(e.x), MARGE_G - 20), LARGEUR - 20);
    corps += `<circle class="point" cx="${f(X(e.x))}" cy="${f(y)}" r="2.2"/>`;
    corps += `<text class="valeur" x="${f(x)}" y="${f(y >= y0 ? y + 13 : y - 5)}" text-anchor="middle">${notationSvg(nombreAffiche(e.valeur, d.decimales))}</text>`;
  }
  const hauteur = y0 + H + 22;
  corps += `<text class="legende" x="${LARGEUR - MARGE_D}" y="16" text-anchor="end">${notationSvg('enveloppe : maximum en trait plein, minimum en tirets')}</text>`;
  return `<svg class="trace" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LARGEUR} ${hauteur}" role="img" aria-label="${echapper(titre)}"><title>${notationSvg(titre)}</title>${corps}</svg>`;
}

/**
 * Epure d'arret des barres : enveloppe ELU, enveloppe decalee de a_l, moments
 * resistants des aciers inferieurs et superieurs, puis les barres en elevation.
 */
export function dessinEpure(ba: ResultatBA, L: number, aciers: AciersChoisis): string {
  const X = echelleX(L);
  const pts = ba.epure;
  const max = Math.max(...pts.flatMap((p) => [p.M_max, p.M_min, p.Mdec_max, p.Mdec_min, p.MRd_inf, p.MRd_sup].map(Math.abs)), 1e-9);
  const H = 80;
  const y0 = 40 + H;
  const Y = (v: number): number => y0 + (v * H) / max;
  const ligne = (classe: string, lire: (p: PointEpure) => number): string =>
    `<polyline class="${classe}" points="${pts.map((p) => `${f(X(p.x))},${f(Y(lire(p)))}`).join(' ')}"/>`;
  let corps = `<text class="titre" x="8" y="16">${notationSvg("Epure d'arret des barres (kN·m)")}</text>`;
  corps += `<text class="legende" x="${LARGEUR - MARGE_D}" y="16" text-anchor="end">${notationSvg('M_Ed en trait fin, decale de a_l en tirets, M_Rd en trait fort')}</text>`;
  corps += `<line class="axe" x1="${f(X(0))}" y1="${y0}" x2="${f(X(L))}" y2="${y0}"/>`;
  corps += ligne('courbe', (p) => p.M_max) + ligne('courbe', (p) => p.M_min);
  corps += ligne('courbe-decalee', (p) => p.Mdec_max) + ligne('courbe-decalee', (p) => p.Mdec_min);
  corps += ligne('resistant', (p) => p.MRd_inf) + ligne('resistant', (p) => p.MRd_sup);

  // Barres en elevation, sous l'epure.
  const yb = y0 + H + 30;
  const barre = (x0: number, x1: number, y: number, texte: string, classe: string): string =>
    `<line class="${classe}" x1="${f(X(x0))}" y1="${f(y)}" x2="${f(X(x1))}" y2="${f(y)}"/>` +
    `<text class="cote-texte" x="${f((X(x0) + X(x1)) / 2)}" y="${f(y - 3)}" text-anchor="middle">${notationSvg(texte)}</text>`;
  corps += `<rect class="coffrage" x="${f(X(0))}" y="${yb}" width="${f(X(L) - X(0))}" height="64"/>`;
  if (aciers.montage !== null) corps += barre(0, L, yb + 10, `${libelleLit(aciers.montage)} filants`, 'barre');
  ba.appuis.forEach((a, i) => {
    const lit = aciers.appuis[i].chapeaux;
    if (a.chapeaux !== null && lit !== null) {
      corps += barre(a.chapeaux.de, a.chapeaux.a, yb + 22, `${libelleLit(lit)} ${cote(a.chapeaux.a - a.chapeaux.de)} m`, 'barre');
    }
  });
  ba.zones.forEach((z, j) => {
    const choix = aciers.zones[j];
    if (choix.filants !== null) corps += barre(z.zone.x0, z.zone.x1, yb + 56, libelleLit(choix.filants), 'barre');
    if (z.renforts !== null && choix.renforts !== null) {
      corps += barre(z.renforts.de, z.renforts.a, yb + 44, `${libelleLit(choix.renforts)} ${cote(z.renforts.a - z.renforts.de)} m`, 'barre');
    }
  });
  const hauteur = yb + 80;
  corps += `<text class="legende" x="${MARGE_G}" y="${hauteur - 4}">${notationSvg(`longueurs d'ancrage comprises : l_bd = ${nombreAffiche(ba.l_bd_inf, 0)} mm (bas), ${nombreAffiche(ba.l_bd_sup, 0)} mm (haut) ; a_l = ${nombreAffiche(ba.a_l, 3)} m`)}</text>`;
  return `<svg class="trace" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LARGEUR} ${hauteur}" role="img" aria-label="epure d arret des barres"><title>${notationSvg("Epure d'arret des barres")}</title>${corps}</svg>`;
}
