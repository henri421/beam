/**
 * Annexe nationale (audit R4, lot E) : valeurs recommandees ou Luxembourg.
 *
 * Le noyau ne connait aucune annexe : il recoit un `ProfilPoutre`. L'outil le construit
 * depuis le profil recommande et la table commune d'aedificium-ui (`valeurLu`), puis
 * laisse l'utilisateur changer chaque coefficient ; une valeur changee est marquee
 * « valeur imposee par l'utilisateur ».
 */
import { valeurLu, type AnnexeNationale } from 'aedificium-ui';
import { profilRecommande, type ProfilPoutre, type ValeurSourcee } from '../../src/index';

export type CleProfil = Exclude<keyof ProfilPoutre, 'nom' | 'date'>;

export const CLES: readonly CleProfil[] = [
  'gamma_G_sup', 'gamma_G_inf', 'gamma_Q', 'xi',
  'gamma_C', 'gamma_S', 'alpha_cc', 'alpha_ct',
  'k1', 'facteur_k2', 'k3', 'facteur_k4', 'k5', 'k6', 'beta_1', 's_l_max',
];

const EN1990 = new Set<CleProfil>(['gamma_G_sup', 'gamma_G_inf', 'gamma_Q', 'xi']);

/** Partie d'Eurocode qui fixe le coefficient. */
export function partieDe(k: CleProfil): string {
  return EN1990.has(k) ? 'EN 1990' : 'EN 1992-1-1';
}

/** Clause citee par la source recommandee (« tableau A1.2(B) », « 3.1.6(1)P »). */
export function clauseDe(source: string): string {
  const t = /tableau [A-Z0-9.]+(\([A-Z]\))?/.exec(source);
  if (t !== null) return t[0];
  const s = /§\s?([0-9][0-9.]*(\(\d+\))?P?)/.exec(source);
  return s !== null ? s[1] : 'annexe A1';
}

export function profilDeLAnnexe(a: AnnexeNationale): ProfilPoutre {
  const rec = profilRecommande();
  if (a !== 'lu') return rec;
  const p = { ...rec, nom: 'Luxembourg, ILNAS-EN 1990 et ILNAS-EN 1992-1-1/AN-LU:2020 (valeurs présumées, à vérifier)', date: '2026-11-18' };
  for (const k of CLES) p[k] = valeurLu(partieDe(k), k, rec[k], clauseDe(rec[k].source));
  return p;
}

/** Valeurs preremplies des champs, en texte. */
export function coefsDeLAnnexe(a: AnnexeNationale): Record<CleProfil, string> {
  const p = profilDeLAnnexe(a);
  return Object.fromEntries(CLES.map((k) => [k, String(p[k].valeur)])) as Record<CleProfil, string>;
}

/** Profil du calcul : celui de l'annexe, chaque valeur changee marquee imposee. */
export function profilDeCalcul(a: AnnexeNationale, valeurs: Record<CleProfil, number>): ProfilPoutre {
  const p = { ...profilDeLAnnexe(a) };
  for (const k of CLES) {
    if (valeurs[k] !== p[k].valeur) p[k] = { valeur: valeurs[k], source: 'valeur imposée par l’utilisateur' } satisfies ValeurSourcee;
  }
  return p;
}
