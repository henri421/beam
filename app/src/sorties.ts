/**
 * Sorties pures de l'application : calcul complet, blocs de la note et du CSV,
 * dessins exportables, hypotheses et avertissements.
 *
 * Tout ici est PUR — aucun `document`. Le cablage vit dans `main.ts`.
 */

import { nombreFr, type BlocResultat } from 'aedificium-ui';
import {
  LIBELLES_APPUI,
  LIBELLES_CHARGE,
  calculerAcier,
  calculerBetonArme,
  calculerCombinaisons,
  calculerPoutre,
  profilRecommande,
  type DonneesAcier,
  type DonneesBA,
  type Poutre,
  type ResultatAcier,
  type ResultatBA,
  type ResultatCombinaisons,
  type ResultatPoutre,
} from '../../src/index';
import { donneesDepuisModele, type ModeleSaisie } from './form';
import { cote, dessinDiagramme, dessinEnveloppe, dessinEpure, dessinSchema } from './dessin';
import {
  avertissementsEnveloppe,
  blocsAcier,
  blocsBA,
  blocsEnveloppe,
  blocsResultats,
  messageDErreur,
} from './vue';

export const PROFIL = profilRecommande();

export interface Calcul {
  poutre: Poutre;
  /** Toutes les charges a leur valeur caracteristique, toutes travees chargees. */
  direct: ResultatPoutre;
  comb: ResultatCombinaisons;
  ba: { donnees: DonneesBA; resultat: ResultatBA } | null;
  acier: { donnees: DonneesAcier; resultat: ResultatAcier } | null;
  modele: ModeleSaisie;
}

export type ResultatCalcul = { ok: true; calcul: Calcul } | { ok: false; message: string };

/** Lecture de la saisie puis calcul complet ; toute erreur devient un message. */
export function calculerTout(m: ModeleSaisie): ResultatCalcul {
  const lecture = donneesDepuisModele(m);
  if (!lecture.ok) return { ok: false, message: lecture.message };
  try {
    const direct = calculerPoutre(lecture.poutre);
    const comb = calculerCombinaisons(lecture.poutre, lecture.combinaisons, PROFIL, lecture.ba?.classeAcier ?? 'B');
    const ba =
      lecture.ba === null
        ? null
        : { donnees: lecture.ba, resultat: calculerBetonArme(comb.casELU, comb.elu, lecture.ba, PROFIL, lecture.combinaisons.redistribution) };
    const acier =
      lecture.acier === null
        ? null
        : { donnees: lecture.acier, resultat: calculerAcier(comb.cas.zones, comb.elu, comb.caracteristique, lecture.acier) };
    return { ok: true, calcul: { poutre: lecture.poutre, direct, comb, ba, acier, modele: structuredClone(m) } };
  } catch (e) {
    return { ok: false, message: messageDErreur(e) };
  }
}

/** Avertissements du calcul, sans le message de calcul perime, ajoute par l'ecran. */
export function avertissementsDuCalcul(c: Calcul): string[] {
  return [
    ...c.comb.avertissements,
    ...avertissementsEnveloppe(c.comb.elu),
    ...(c.ba === null ? [] : c.ba.resultat.avertissements),
    ...(c.acier === null ? [] : c.acier.resultat.avertissements),
  ];
}

export const HYPOTHESES = [
  'Calcul elastique lineaire au premier ordre, petits deplacements ; poutre d Euler-Bernoulli de rigidite EI constante.',
  'Methode des deplacements ; solution exacte entre noeuds pour des charges au plus lineaires.',
  'Enveloppes exactes par superposition : G sur toute la poutre avec un seul coefficient ; Q placee zone par zone la ou elle est defavorable ; tassements pris ou non.',
  'Une seule action variable Q ; appuis bilateraux, un soulevement est signale et rendu tel quel.',
  'Beton arme : flexion simple (section-uls, parabole-rectangle) ; x_u/d limite par le §5.5(4), delta = 1 hors redistribution ; effort tranchant §6.2 cadres droits, z = 0,9 d ; epure decalee de a_l (§9.2.1.3) ; l_bd avec alpha = 1 et sigma_sd = f_yd (dispositions-constructives).',
  'Signes : charges vers le bas positives ; M positif fibre inferieure tendue ; V = dM/dx ; fleche positive vers le bas ; moments appliques et de reaction positifs dans le sens trigonometrique.',
  'Acier (si retenu) : EN 1993-1-1 par sections-ec3 ; par zone, M_Ed et V_Ed maximaux pris ensemble ; deversement avec C1 = 1 ou M_cr saisi ; fleche de l enveloppe caracteristique comparee a L / n ; EI du profil, E = 210 000 MPa.',
];

export function blocsDEntree(c: Calcul): BlocResultat[] {
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
  if (c.acier !== null) {
    const a = c.acier.donnees;
    const p = c.acier.resultat.profil;
    blocs.push({
      titre: 'Acier',
      lignes: [
        { symbole: 'profil', libelle: 'profil en I lamine, catalogue de sections-ec3', valeur: `${p.nom}, ${a.nuance}` },
        { symbole: 'EI', libelle: 'E = 210 000 MPa, I_y du profil (remplace E et I saisis)', valeur: `${nombreFr(p.EI, 0)} kN.m2` },
        { symbole: 'g', libelle: 'poids propre du profil', valeur: c.modele.acier.poidsPropre ? `${nombreFr(p.poids, 3)} kN/m, ajoute aux charges G` : 'non ajoute' },
        { symbole: 'deversement', libelle: 'maintien de la membrure comprimee', valeur: a.deversementEmpeche ? 'empeche' : 'longueurs entre maintiens par zone' },
        { symbole: 'L / n', libelle: 'fleche limite', valeur: `L / ${a.flecheLimite}` },
      ],
      note: null,
    });
  }
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

export function blocsDeSortie(c: Calcul): BlocResultat[] {
  const z = c.comb.cas.zones;
  return [
    ...blocsResultats(c.direct).map((b) => ({ ...b, titre: `Caracteristique G + Q — ${b.titre}` })),
    ...blocsEnveloppe(c.comb.elu, z),
    ...blocsEnveloppe(c.comb.caracteristique, z),
    ...blocsEnveloppe(c.comb.quasiPermanente, z),
    ...(c.ba === null ? [] : blocsBA(c.ba.resultat, c.ba.donnees.aciers)),
    ...(c.acier === null ? [] : blocsAcier(c.acier.resultat)),
  ];
}

export function dessins(c: Calcul): { nom: string; titre: string; svg: string }[] {
  const L = c.poutre.longueur;
  const liste = [
    { nom: 'schema', titre: 'Schema statique', svg: dessinSchema(c.poutre) },
    { nom: 'elu-moment', titre: 'ELU — moment flechissant', svg: dessinEnveloppe(c.comb.elu, L, 'M', `${c.comb.elu.combinaison.nom} — moment flechissant`) },
    { nom: 'elu-effort-tranchant', titre: 'ELU — effort tranchant', svg: dessinEnveloppe(c.comb.elu, L, 'V', `${c.comb.elu.combinaison.nom} — effort tranchant`) },
    { nom: 'els-fleche', titre: 'ELS caracteristique — fleche', svg: dessinEnveloppe(c.comb.caracteristique, L, 'w', `${c.comb.caracteristique.combinaison.nom} — fleche`) },
    { nom: 'caracteristique-deformee', titre: 'G + Q — deformee', svg: dessinDiagramme(c.direct, 'w') },
  ];
  if (c.ba !== null) liste.push({ nom: 'epure', titre: 'Epure d arret des barres', svg: dessinEpure(c.ba.resultat, L, c.ba.donnees.aciers) });
  return liste;
}
