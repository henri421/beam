/**
 * Profil normatif : les coefficients de combinaison (EN 1990:2002, annexe A1)
 * et les parametres de l'EN 1992-1-1:2004 que l'annexe nationale peut fixer.
 *
 * Aucune valeur nationale n'est codee dans le noyau : le profil par defaut
 * porte les valeurs RECOMMANDEES, chacune avec sa source. Une valeur sans
 * source bloque le calcul. Les psi dependent de la categorie d'usage : ils se
 * saisissent avec les combinaisons, ils ne sont pas dans le profil.
 *
 * Sans dimension, sauf mention.
 */

export interface ValeurSourcee {
  valeur: number;
  /** Reference : norme, clause, annexe nationale. Jamais vide. */
  source: string;
}

export interface ProfilPoutre {
  nom: string;
  /** Date de consultation des sources, AAAA-MM-JJ. */
  date: string;
  /** Actions permanentes defavorables, ELU STR (6.10) et (6.10a). */
  gamma_G_sup: ValeurSourcee;
  /** Actions permanentes favorables. */
  gamma_G_inf: ValeurSourcee;
  /** Action variable defavorable (0 si favorable). */
  gamma_Q: ValeurSourcee;
  /** Facteur de reduction des actions permanentes defavorables, (6.10b). */
  xi: ValeurSourcee;
  gamma_C: ValeurSourcee;
  gamma_S: ValeurSourcee;
  alpha_cc: ValeurSourcee;
  alpha_ct: ValeurSourcee;
  /** Redistribution, §5.5(4) : delta >= k1 + k2 x_u/d (f_ck <= 50 MPa). */
  k1: ValeurSourcee;
  /** Facteur de k2 = facteur_k2 (0,6 + 1,4 × 10⁻³ / eps_cu2). */
  facteur_k2: ValeurSourcee;
  /** delta >= k3 + k4 x_u/d (f_ck > 50 MPa). */
  k3: ValeurSourcee;
  facteur_k4: ValeurSourcee;
  /** delta minimal, aciers de classe B ou C. */
  k5: ValeurSourcee;
  /** delta minimal, aciers de classe A. */
  k6: ValeurSourcee;
  /** Aciers superieurs sur appui d'extremite monolithique : beta_1 M_travee, §9.2.1.2(1). */
  beta_1: ValeurSourcee;
  /** Espacement longitudinal maximal des cadres : facteur de d, §9.2.2(6). */
  s_l_max: ValeurSourcee;
}

const EN1990 = 'EN 1990:2002, annexe A1, valeur recommandee';
const EC2 = 'EN 1992-1-1:2004, valeur recommandee';

export function profilRecommande(): ProfilPoutre {
  return {
    nom: 'EN 1990:2002 et EN 1992-1-1:2004, valeurs recommandees',
    date: '2026-10-09',
    gamma_G_sup: { valeur: 1.35, source: `${EN1990}, tableau A1.2(B)` },
    gamma_G_inf: { valeur: 1.0, source: `${EN1990}, tableau A1.2(B)` },
    gamma_Q: { valeur: 1.5, source: `${EN1990}, tableau A1.2(B)` },
    xi: { valeur: 0.85, source: `${EN1990}, tableau A1.2(B), expression (6.10b)` },
    gamma_C: { valeur: 1.5, source: `${EC2}, tableau 2.1N` },
    gamma_S: { valeur: 1.15, source: `${EC2}, tableau 2.1N` },
    alpha_cc: { valeur: 1.0, source: `${EC2}, §3.1.6(1)P` },
    alpha_ct: { valeur: 1.0, source: `${EC2}, §3.1.6(2)P` },
    k1: { valeur: 0.44, source: `${EC2}, §5.5(4)` },
    facteur_k2: { valeur: 1.25, source: `${EC2}, §5.5(4), k2 = 1,25 (0,6 + 1,4 × 10⁻³ / eps_cu2)` },
    k3: { valeur: 0.54, source: `${EC2}, §5.5(4)` },
    facteur_k4: { valeur: 1.25, source: `${EC2}, §5.5(4), k4 = 1,25 (0,6 + 1,4 × 10⁻³ / eps_cu2)` },
    k5: { valeur: 0.7, source: `${EC2}, §5.5(4)` },
    k6: { valeur: 0.8, source: `${EC2}, §5.5(4)` },
    beta_1: { valeur: 0.15, source: `${EC2}, §9.2.1.2(1)` },
    s_l_max: { valeur: 0.75, source: `${EC2}, §9.2.2(6), s_l,max = 0,75 d (1 + cot alpha)` },
  };
}

/** Controle qu'aucune valeur du profil n'est sans source ni hors domaine. */
export function verifierProfil(p: ProfilPoutre): void {
  for (const [cle, v] of Object.entries(p)) {
    if (typeof v !== 'object' || v === null) continue;
    const vs = v as ValeurSourcee;
    if (vs.source.trim() === '') throw new Error(`Profil normatif : la valeur ${cle} n'a pas de source ; le calcul est bloqué.`);
    if (!Number.isFinite(vs.valeur) || vs.valeur < 0) throw new Error(`Profil normatif : la valeur ${cle} doit être un nombre positif.`);
  }
}
