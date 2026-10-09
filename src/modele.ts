/**
 * Donnees d'une poutre droite : longueur, rigidite, appuis, rotules, charges.
 *
 * Unites du noyau : longueurs en m, forces en kN, charges reparties en kN/m,
 * moments en kN.m, rigidite de flexion EI en kN.m2, raideurs en kN/m et
 * kN.m/rad, tassements et fleches en mm. Ecart declare a la convention
 * commune (longueurs en mm) : une poutre se decrit en metres, et des charges
 * en kN/mm n'auraient de sens pour personne.
 *
 * Conventions de signe :
 * - abscisse x de gauche a droite, origine a l'extremite gauche ;
 * - charges ponctuelles et reparties positives VERS LE BAS (gravitaires) ;
 * - moment ponctuel applique positif dans le sens TRIGONOMETRIQUE (anti-horaire) ;
 * - tassement d'appui positif vers le bas.
 */

/** Conversion d'un module en MPa et d'une inertie en cm4 vers EI en kN.m2. */
export const KN_M2_PAR_MPA_CM4 = 1e-5;

/** Conversion des metres en millimetres (fleches, tassements). */
export const MM_PAR_M = 1000;

/** Tolerance de position, en m : deux abscisses plus proches sont confondues. */
export const TOLERANCE_X = 1e-6;

export type Appui =
  /** Appui simple (articulation ou rouleau) : deplacement vertical bloque. */
  | { type: 'appui-simple'; x: number; tassement: number }
  /** Encastrement : deplacement vertical et rotation bloques. */
  | { type: 'encastrement'; x: number; tassement: number }
  /** Encastrement glissant (glissiere) : rotation bloquee, deplacement vertical libre. */
  | { type: 'glissiere'; x: number }
  /** Encastrement elastique : deplacement vertical bloque, ressort en rotation (kN.m/rad). */
  | { type: 'encastrement-elastique'; x: number; tassement: number; k_rotation: number }
  /** Appui elastique : ressort vertical (kN/m) et/ou ressort en rotation (kN.m/rad). */
  | { type: 'ressort'; x: number; k_vertical: number; k_rotation: number };

export type TypeAppui = Appui['type'];

export type Charge =
  /** Force ponctuelle P (kN), positive vers le bas. */
  | { type: 'ponctuelle'; x: number; P: number }
  /** Couple ponctuel M (kN.m), positif dans le sens trigonometrique. */
  | { type: 'moment'; x: number; M: number }
  /** Charge uniformement repartie q (kN/m) entre a et b, positive vers le bas. */
  | { type: 'repartie'; a: number; b: number; q: number }
  /** Charge lineairement variable de q_a en a a q_b en b (triangulaire ou trapezoidale). */
  | { type: 'lineaire'; a: number; b: number; q_a: number; q_b: number };

export type TypeCharge = Charge['type'];

export interface Poutre {
  /** Longueur totale (m). */
  longueur: number;
  /** Rigidite de flexion EI (kN.m2), constante sur toute la longueur. */
  EI: number;
  appuis: Appui[];
  /** Abscisses des rotules internes (m), strictement a l'interieur de la poutre. */
  rotules: number[];
  charges: Charge[];
}

/** Rigidite de flexion EI (kN.m2) depuis E (MPa) et I (cm4). */
export function rigiditeFlexion(E: number, I: number): number {
  positif(E, 'Le module d elasticite E', 'MPa');
  positif(I, 'L inertie I', 'cm4');
  return E * I * KN_M2_PAR_MPA_CM4;
}

export const LIBELLES_APPUI: Record<TypeAppui, string> = {
  'appui-simple': 'appui simple',
  encastrement: 'encastrement',
  glissiere: 'encastrement glissant',
  'encastrement-elastique': 'encastrement elastique',
  ressort: 'appui elastique (ressorts)',
};

export const LIBELLES_CHARGE: Record<TypeCharge, string> = {
  ponctuelle: 'force ponctuelle',
  moment: 'moment ponctuel',
  repartie: 'charge repartie uniforme',
  lineaire: 'charge triangulaire ou trapezoidale',
};

/**
 * Nombre de liaisons d'un appui, au sens du decompte d'hyperstaticite : un
 * ressort compte comme une liaison (il transmet un effort), un ressort de
 * raideur nulle n'en est pas une.
 */
export function liaisonsDeLAppui(appui: Appui): number {
  switch (appui.type) {
    case 'appui-simple':
    case 'glissiere':
      return 1;
    case 'encastrement':
    case 'encastrement-elastique':
      return 2;
    case 'ressort':
      return (appui.k_vertical > 0 ? 1 : 0) + (appui.k_rotation > 0 ? 1 : 0);
  }
}

/** L'appui bloque-t-il ou retient-il la rotation ? */
export function retientLaRotation(appui: Appui): boolean {
  return (
    appui.type === 'encastrement' ||
    appui.type === 'glissiere' ||
    appui.type === 'encastrement-elastique' ||
    (appui.type === 'ressort' && appui.k_rotation > 0)
  );
}

/**
 * Degre d'hyperstaticite d'une poutre droite sans effort normal : liaisons
 * moins deux equations d'equilibre (forces verticales, moments), moins une
 * equation par rotule interne (moment nul).
 */
export function degreHyperstatique(poutre: Poutre): number {
  const liaisons = poutre.appuis.reduce((s, a) => s + liaisonsDeLAppui(a), 0);
  return liaisons - 2 - poutre.rotules.length;
}

function positif(valeur: number, nom: string, unite: string): void {
  if (!Number.isFinite(valeur) || valeur <= 0) {
    throw new Error(`${nom} doit etre un nombre strictement positif (${unite}).`);
  }
}

function fini(valeur: number, nom: string, unite: string): void {
  if (!Number.isFinite(valeur)) throw new Error(`${nom} doit etre un nombre (${unite}).`);
}

function positifOuNul(valeur: number, nom: string, unite: string): void {
  if (!Number.isFinite(valeur) || valeur < 0) {
    throw new Error(`${nom} doit etre un nombre positif ou nul (${unite}).`);
  }
}

function surLaPoutre(x: number, L: number, nom: string): void {
  fini(x, nom, 'm');
  if (x < -TOLERANCE_X || x > L + TOLERANCE_X) {
    throw new Error(`${nom} (${x} m) doit se trouver sur la poutre, entre 0 et ${L} m.`);
  }
}

/**
 * Controle de coherence des donnees. Leve une Error nommant la grandeur
 * fautive ; ne corrige rien en silence.
 */
export function verifierDonnees(poutre: Poutre): void {
  const L = poutre.longueur;
  positif(L, 'La longueur de la poutre L', 'm');
  positif(poutre.EI, 'La rigidite de flexion EI', 'kN.m2');
  if (poutre.appuis.length === 0) throw new Error('La poutre doit comporter au moins un appui.');

  poutre.appuis.forEach((a, i) => {
    const nom = `L abscisse de l appui ${i + 1}`;
    surLaPoutre(a.x, L, nom);
    if (a.type === 'appui-simple' || a.type === 'encastrement' || a.type === 'encastrement-elastique') {
      fini(a.tassement, `Le tassement de l appui ${i + 1}`, 'mm');
    }
    if (a.type === 'encastrement-elastique') {
      positif(a.k_rotation, `La raideur en rotation de l appui ${i + 1}`, 'kN.m/rad');
    }
    if (a.type === 'ressort') {
      positifOuNul(a.k_vertical, `La raideur verticale de l appui ${i + 1}`, 'kN/m');
      positifOuNul(a.k_rotation, `La raideur en rotation de l appui ${i + 1}`, 'kN.m/rad');
      if (a.k_vertical === 0 && a.k_rotation === 0) {
        throw new Error(`L appui elastique ${i + 1} doit avoir une raideur verticale ou en rotation non nulle.`);
      }
    }
  });
  for (let i = 0; i < poutre.appuis.length; i++) {
    for (let j = i + 1; j < poutre.appuis.length; j++) {
      if (Math.abs(poutre.appuis[i].x - poutre.appuis[j].x) < TOLERANCE_X) {
        throw new Error(`Les appuis ${i + 1} et ${j + 1} sont a la meme abscisse (${poutre.appuis[i].x} m) : les fusionner en un seul appui.`);
      }
    }
  }

  poutre.rotules.forEach((x, i) => {
    fini(x, `L abscisse de la rotule ${i + 1}`, 'm');
    if (x <= TOLERANCE_X || x >= L - TOLERANCE_X) {
      throw new Error(`La rotule ${i + 1} (${x} m) doit etre strictement a l interieur de la poutre : une rotule d extremite ne change rien.`);
    }
    poutre.rotules.forEach((y, j) => {
      if (j > i && Math.abs(x - y) < TOLERANCE_X) throw new Error(`Les rotules ${i + 1} et ${j + 1} sont a la meme abscisse.`);
    });
    poutre.appuis.forEach((a, j) => {
      if (Math.abs(a.x - x) < TOLERANCE_X && retientLaRotation(a)) {
        throw new Error(
          `La rotule ${i + 1} coincide avec l appui ${j + 1} (${LIBELLES_APPUI[a.type]}) qui retient la rotation : on ne sait pas de quel cote il agit.`
        );
      }
    });
  });

  poutre.charges.forEach((c, i) => {
    const n = i + 1;
    switch (c.type) {
      case 'ponctuelle':
        surLaPoutre(c.x, L, `L abscisse de la charge ${n}`);
        fini(c.P, `La force de la charge ${n}`, 'kN');
        break;
      case 'moment':
        surLaPoutre(c.x, L, `L abscisse de la charge ${n}`);
        fini(c.M, `Le moment de la charge ${n}`, 'kN.m');
        if (poutre.rotules.some((x) => Math.abs(x - c.x) < TOLERANCE_X)) {
          throw new Error(`Le moment ${n} est applique sur une rotule : le deplacer d un cote ou de l autre.`);
        }
        break;
      case 'repartie':
      case 'lineaire':
        surLaPoutre(c.a, L, `Le debut de la charge ${n}`);
        surLaPoutre(c.b, L, `La fin de la charge ${n}`);
        if (c.b - c.a < TOLERANCE_X) throw new Error(`La charge ${n} doit avoir une fin strictement apres son debut.`);
        if (c.type === 'repartie') fini(c.q, `L intensite de la charge ${n}`, 'kN/m');
        else {
          fini(c.q_a, `L intensite de debut de la charge ${n}`, 'kN/m');
          fini(c.q_b, `L intensite de fin de la charge ${n}`, 'kN/m');
        }
        break;
    }
  });
}
