/**
 * Sorties pures de l'application : calcul complet, blocs de la note et du CSV,
 * dessins exportables, hypotheses et avertissements.
 *
 * Tout ici est PUR — aucun `document`. Le cablage vit dans `main.ts`.
 */

import {
  lireNombre,
  nombreAffiche,
  type BlocResultat,
  type ElementNote,
  type NoteDeCalcul,
  type VerificationNote,
} from 'aedificium-ui';
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

/** Nombre saisi, affiche a la francaise : 3 decimales au plus, sans zeros inutiles. */
const affiche = (texte: string): string => {
  const v = lireNombre(texte);
  return v === null ? texte : nombreAffiche(v);
};

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
  "Calcul élastique linéaire au premier ordre, petits déplacements ; poutre d'Euler-Bernoulli de rigidité EI constante.",
  'Méthode des déplacements ; solution exacte entre nœuds pour des charges au plus linéaires.',
  "Enveloppes exactes par superposition : G sur toute la poutre avec un seul coefficient ; Q placée zone par zone là où elle est défavorable ; tassements pris ou non.",
  "Une seule action variable Q ; appuis bilatéraux, un soulèvement est signalé et rendu tel quel.",
  "Béton armé : flexion simple (section-uls, parabole-rectangle) ; x_u/d limite par le §5.5(4), delta = 1 hors redistribution ; effort tranchant §6.2 cadres droits, z = 0,9 d ; épure décalée de a_l (§9.2.1.3) ; l_bd avec alpha = 1 et sigma_sd = f_yd (dispositions-constructives).",
  "Signes : charges vers le bas positives ; M positif fibre inférieure tendue ; V = dM/dx ; flèche positive vers le bas ; moments appliqués et de réaction positifs dans le sens trigonométrique.",
  "Les données d'entrée sont celles du modèle enregistré.",
  "Acier (si retenu) : EN 1993-1-1 par sections-ec3 ; par zone, M_Ed et V_Ed maximaux pris ensemble ; déversement avec C1 = 1 ou M_cr saisi ; flèche de l'enveloppe caractéristique comparée à L / n ; EI du profil, E = 210 000 MPa.",
];

export function blocsDEntree(c: Calcul): BlocResultat[] {
  const p = c.poutre;
  const m = c.modele;
  const blocs: BlocResultat[] = [
    {
      titre: 'Poutre',
      lignes: [
        { symbole: 'L', libelle: 'longueur totale', valeur: `${cote(p.longueur)} m` },
        { symbole: 'E', libelle: "module d'élasticité", valeur: `${affiche(m.E)} MPa` },
        { symbole: 'I', libelle: 'inertie', valeur: `${affiche(m.I)} cm4` },
        { symbole: 'EI', libelle: 'rigidité de flexion', valeur: `${nombreAffiche(p.EI, 0)} kN.m2` },
        { symbole: 'rotules', libelle: 'rotules internes', valeur: p.rotules.length === 0 ? 'aucune' : p.rotules.map((x) => `${cote(x)} m`).join(', ') },
      ],
      note: null,
    },
    {
      titre: 'Appuis',
      lignes: p.appuis.map((a, i) => {
        const details: string[] = [`x = ${cote(a.x)} m`];
        if ('tassement' in a && a.tassement !== 0) details.push(`tassement ${nombreAffiche(a.tassement, 2)} mm`);
        if (a.type === 'ressort' && a.k_vertical > 0) details.push(`k_v = ${nombreAffiche(a.k_vertical, 0)} kN/m`);
        if ((a.type === 'ressort' || a.type === 'encastrement-elastique') && a.k_rotation > 0) details.push(`k_theta = ${nombreAffiche(a.k_rotation, 0)} kN.m/rad`);
        return { symbole: `A${i + 1}`, libelle: LIBELLES_APPUI[a.type], valeur: details.join(', ') };
      }),
      note: null,
    },
    {
      titre: 'Charges',
      lignes: p.charges.map((ch, i) => {
        const valeur =
          ch.type === 'ponctuelle'
            ? `P = ${nombreAffiche(ch.P, 2)} kN à x = ${cote(ch.x)} m`
            : ch.type === 'moment'
              ? `M = ${nombreAffiche(ch.M, 2)} kN.m à x = ${cote(ch.x)} m`
              : ch.type === 'repartie'
                ? `q = ${nombreAffiche(ch.q, 2)} kN/m de ${cote(ch.a)} à ${cote(ch.b)} m`
                : `q = ${nombreAffiche(ch.q_a, 2)} à ${nombreAffiche(ch.q_b, 2)} kN/m de ${cote(ch.a)} à ${cote(ch.b)} m`;
        return { symbole: `C${i + 1} (${ch.cas ?? 'G'})`, libelle: LIBELLES_CHARGE[ch.type], valeur };
      }),
      note: p.charges.length === 0 ? 'Aucune charge.' : null,
    },
    {
      titre: 'Combinaisons',
      lignes: [
        { symbole: 'ELU', libelle: 'expression', valeur: m.combinaisons.formule === '6.10' ? '(6.10)' : '(6.10a) et (6.10b)' },
        { symbole: 'psi_0, psi_1, psi_2', libelle: 'coefficients de Q', valeur: `${affiche(m.combinaisons.psi0)} ; ${affiche(m.combinaisons.psi1)} ; ${affiche(m.combinaisons.psi2)}` },
        { symbole: 'gamma_T', libelle: "coefficient des tassements à l'ELU", valeur: affiche(m.combinaisons.gamma_T) },
        ...Object.entries(PROFIL)
          .filter(([, v]) => typeof v === 'object')
          .map(([k, v]) => ({ symbole: k, libelle: (v as { source: string }).source, valeur: nombreAffiche((v as { valeur: number }).valeur) })),
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
        { symbole: 'profil', libelle: 'profil en I laminé, catalogue de sections-ec3', valeur: `${p.nom}, ${a.nuance}` },
        { symbole: 'EI', libelle: 'E = 210 000 MPa, I_y du profil (remplace E et I saisis)', valeur: `${nombreAffiche(p.EI, 0)} kN.m2` },
        { symbole: 'g', libelle: 'poids propre du profil', valeur: c.modele.acier.poidsPropre ? `${nombreAffiche(p.poids, 3)} kN/m, ajouté aux charges G` : 'non ajouté' },
        { symbole: 'déversement', libelle: 'maintien de la membrure comprimée', valeur: a.deversementEmpeche ? 'empêché' : 'longueurs entre maintiens par zone' },
        { symbole: 'L / n', libelle: 'flèche limite', valeur: `L / ${nombreAffiche(a.flecheLimite)}` },
      ],
      note: null,
    });
  }
  if (c.ba !== null) {
    const s = c.ba.donnees.section;
    blocs.push({
      titre: 'Béton armé',
      lignes: [
        { symbole: 'section', libelle: s.forme === 'te' ? 'en T' : 'rectangulaire', valeur: s.forme === 'te' ? `b_w ${nombreAffiche(s.b_w)}, h ${nombreAffiche(s.h)}, b_eff ${nombreAffiche(s.b_eff)}, h_f ${nombreAffiche(s.h_f)} mm` : `${nombreAffiche(s.b_w)} x ${nombreAffiche(s.h)} mm` },
        { symbole: 'f_ck / f_yk', libelle: 'matériaux', valeur: `${nombreAffiche(c.ba.donnees.fck)} / ${nombreAffiche(c.ba.donnees.fyk)} MPa, classe ${c.ba.donnees.classeAcier}` },
        { symbole: 'a_inf / a_sup', libelle: 'distances des fibres aux axes des aciers', valeur: `${nombreAffiche(c.ba.donnees.a_inf)} / ${nombreAffiche(c.ba.donnees.a_sup)} mm` },
        { symbole: 'cot theta', libelle: 'inclinaison des bielles', valeur: nombreAffiche(c.ba.donnees.cotTheta) },
      ],
      note: null,
    });
  }
  return blocs;
}

export function blocsDeSortie(c: Calcul): BlocResultat[] {
  const z = c.comb.cas.zones;
  return [
    ...blocsResultats(c.direct).map((b) => ({ ...b, titre: `Caractéristique G + Q — ${b.titre}` })),
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
    { nom: 'schema', titre: 'Schéma statique', svg: dessinSchema(c.poutre) },
    { nom: 'elu-moment', titre: 'ELU — moment fléchissant', svg: dessinEnveloppe(c.comb.elu, L, 'M', `${c.comb.elu.combinaison.nom} — moment fléchissant`) },
    { nom: 'elu-effort-tranchant', titre: 'ELU — effort tranchant', svg: dessinEnveloppe(c.comb.elu, L, 'V', `${c.comb.elu.combinaison.nom} — effort tranchant`) },
    { nom: 'els-fleche', titre: 'ELS caractéristique — flèche', svg: dessinEnveloppe(c.comb.caracteristique, L, 'w', `${c.comb.caracteristique.combinaison.nom} — flèche`) },
    { nom: 'caracteristique-deformee', titre: 'G + Q — déformée', svg: dessinDiagramme(c.direct, 'w') },
  ];
  if (c.ba !== null) liste.push({ nom: 'epure', titre: "Épure d'arrêt des barres", svg: dessinEpure(c.ba.resultat, L, c.ba.donnees.aciers) });
  return liste;
}

/**
 * Note de calcul au format commun d'aedificium-ui : contenu range par sections
 * et verifications listees par zone. Fonction pure, comme le reste du module.
 */
export function noteDuCalcul(
  c: Calcul,
  cartouche: { projet: string; element: string; date: string },
  avertissements: string[] = []
): NoteDeCalcul {
  const blocs = blocsDEntree(c);
  const bloc = (titre: string): BlocResultat => blocs.find((x) => x.titre === titre)!;
  const enBloc = (b: BlocResultat): ElementNote => ({ type: 'bloc', bloc: b });
  const figure = (nom: string): ElementNote => {
    const d = dessins(c).find((x) => x.nom === nom)!;
    return { type: 'figure', svg: d.svg, legende: d.titre };
  };

  // Geometrie : poutre sans les rigidites, appuis, schema statique.
  const poutre = bloc('Poutre');
  const geometrie: ElementNote[] = [
    enBloc({ ...poutre, lignes: poutre.lignes.filter((l) => !['E', 'I', 'EI'].includes(l.symbole)) }),
    enBloc(bloc('Appuis')),
    figure('schema'),
  ];

  // Materiaux : rigidites seules, puis le bloc beton arme ou acier s'il existe.
  const materiaux: ElementNote[] = [
    enBloc({ titre: 'Rigidité', lignes: poutre.lignes.filter((l) => ['E', 'I', 'EI'].includes(l.symbole)), note: null }),
  ];
  const beton = blocs.find((x) => x.titre === 'Béton armé');
  if (beton) {
    geometrie.push(
      enBloc({ titre: 'Section', lignes: beton.lignes.filter((l) => ['section', 'a_inf / a_sup'].includes(l.symbole)), note: null })
    );
    materiaux.push(
      enBloc({
        titre: 'Béton armé',
        lignes: beton.lignes.filter((l) => !['section', 'a_inf / a_sup'].includes(l.symbole)),
        note: null,
      })
    );
  }
  const acierEntree = blocs.find((x) => x.titre === 'Acier');
  if (acierEntree) materiaux.push(enBloc(acierEntree));

  // Hypotheses : liste commune, puis les lignes du profil normatif.
  const combinaisons = bloc('Combinaisons');
  const clesProfil = Object.keys(PROFIL);
  const hypotheses: ElementNote[] = [
    { type: 'liste', items: HYPOTHESES },
    enBloc({
      titre: 'Paramètres',
      lignes: combinaisons.lignes.filter((l) => clesProfil.includes(l.symbole)),
      note: combinaisons.note,
    }),
  ];

  // Une etape (6.8) par jeu de valeurs distinct : des cadres identiques donnent
  // la meme ligne partout, la repeter n'apprend rien. La clause dit ou elle vaut.
  const etapes: ElementNote[] = [];
  if (c.ba !== null) {
    const parValeurs = new Map<string, { substituee: string; resultat: string; lieux: string[] }>();
    let total = 0;
    for (const zone of c.ba.resultat.zones) {
      for (const t of zone.tranchant) {
        const substituee = `${nombreAffiche(t.Asw_s_prov)} · ${nombreAffiche(t.z, 1)} · ${nombreAffiche(t.f_ywd, 1)} · ${nombreAffiche(c.ba.donnees.cotTheta)} / 1000`;
        const resultat = `${nombreAffiche(t.V_Rd_s, 1)} kN`;
        const cle = `${substituee}|${resultat}`;
        const deja = parValeurs.get(cle) ?? { substituee, resultat, lieux: [] };
        deja.lieux.push(`${zone.zone.nom}, x = ${cote(t.x)} m`);
        parValeurs.set(cle, deja);
        total++;
      }
    }
    for (const v of parValeurs.values()) {
      const ou = v.lieux.length === total ? 'toutes les extrémités de zone' : v.lieux.join(' ; ');
      etapes.push({ type: 'etape', formule: 'V_Rd,s = A_sw / s · z · f_ywd · cot theta', substituee: v.substituee, resultat: v.resultat, clause: `§6.2.3 (6.8) — ${ou}` });
    }
  }

  const calculs: ElementNote[] = [];
  for (const b of blocsDeSortie(c)) {
    calculs.push(enBloc(b));
    if (b.titre === 'Béton armé — effort tranchant') calculs.push(...etapes);
  }
  for (const d of dessins(c)) if (d.nom !== 'schema') calculs.push(figure(d.nom));

  // Verifications : beton arme puis acier, toujours avec un taux (NaN si incalculable).
  const verifications: VerificationNote[] = [];
  if (c.ba !== null) {
    for (const zone of c.ba.resultat.zones) {
      if (zone.flexion && zone.flexion.M_Rd !== null) {
        const taux = zone.flexion.M_Ed / zone.flexion.M_Rd;
        verifications.push({ nom: `Flexion, ${zone.zone.nom}`, taux, ok: Number.isFinite(taux) && taux <= 1, clause: '§6.1' });
      }
    }
    for (const appui of c.ba.resultat.appuis) {
      if (appui.flexion && appui.flexion.M_Rd !== null) {
        const taux = appui.flexion.M_Ed / appui.flexion.M_Rd;
        verifications.push({
          nom: `Flexion, appui x = ${cote(appui.x)} m`,
          taux,
          ok: Number.isFinite(taux) && taux <= 1,
          clause: '§6.1',
        });
      }
    }
    for (const zone of c.ba.resultat.zones) {
      for (const t of zone.tranchant) {
        const taux = t.V_Ed_reduit / Math.min(t.V_Rd_s, t.V_Rd_max);
        verifications.push({
          nom: `Effort tranchant, ${zone.zone.nom}, x = ${cote(t.x)} m`,
          taux,
          ok: Number.isFinite(taux) && taux <= 1,
          clause: '§6.2.3',
        });
      }
    }
  }
  if (c.acier !== null) {
    for (const zone of c.acier.resultat.zones) {
      const ajouter = (nom: string, taux: number | null, clause: string): void => {
        verifications.push({
          nom: `${nom}, ${zone.zone.nom}`,
          taux: taux ?? NaN,
          ok: taux !== null && taux <= 1,
          clause,
        });
      };
      ajouter('Section', zone.tauxSection, '§6.2');
      ajouter('Cisaillement', zone.tauxCisaillement, '§6.2.6');
      if (zone.tauxDeversement !== null) ajouter('Déversement', zone.tauxDeversement, '§6.3.2');
      ajouter('Flèche', zone.tauxFleche, 'L / n');
    }
  }

  const element =
    cartouche.element.trim() || `Poutre de ${cote(c.poutre.longueur)} m, ${c.poutre.appuis.length} appuis`;
  const norme =
    c.acier !== null ? 'EN 1990:2002, EN 1993-1-1:2005' : c.ba !== null ? 'EN 1990:2002, EN 1992-1-1:2004' : 'EN 1990:2002';
  return {
    cartouche: { projet: cartouche.projet, element, date: cartouche.date, norme, outil: 'poutres-continues' },
    sections: {
      geometrie,
      materiaux,
      hypotheses,
      charges: [enBloc(bloc('Charges'))],
      combinaisons: [
        enBloc({
          ...combinaisons,
          lignes: combinaisons.lignes.filter((l) => !clesProfil.includes(l.symbole)),
          note: null,
        }),
      ],
      calculs,
    },
    verifications,
    avertissements,
  };
}
