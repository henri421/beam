/**
 * Version anglaise (lot 8.8) : traduction A LA SORTIE. PUR.
 *
 * Les modules de l'app et le noyau ecrivent en francais ; en anglais, tout ce
 * qui sort (HTML de l'ecran, SVG, blocs du CSV, note de calcul, messages)
 * passe par `tr` (une phrase), `trHtml` (les noeuds de texte et les
 * attributs lisibles d'un fragment HTML ou SVG) ou `trBlocs`. Trois etages :
 * phrases exactes, regles a motif (ordre des mots), puis un glossaire de
 * morceaux applique en une seule passe, du plus long au plus court.
 *
 * En francais, tout sort intact : les tests francais ne voient aucune
 * difference.
 */

import { langueCourante, pointDecimal, type BlocResultat } from 'aedificium-ui';

const EXACTES: Record<string, string> = {
  structure: 'structure',
  ecart: 'gap',
  taux: 'ratio',
  constat: 'finding',
  requis: 'required',
  'en place': 'provided',
  barres: 'bars',
  classe: 'class',
  flèche: 'deflection',
  aciers: 'bars',
  profil: 'section',
  déversement: 'lateral-torsional buckling',
  rotules: 'hinges',
  filants: 'continuous',
  renforts: 'additional',
  chapeaux: 'top bars',
  section: 'section',
  'taux flèche': 'deflection ratio',
  verdict: 'verdict',
  expression: 'expression',
  aucune: 'none',
  'non ajouté': 'not added',
  empêché: 'prevented',
  'non nécessaires': 'not needed',
  rectangulaire: 'rectangular',
  'en T': 'T-section',
  matériaux: 'materials',
  inertie: 'second moment of area',
  'longueur totale': 'total length',
  "module d'élasticité": 'modulus of elasticity',
  'rotules internes': 'internal hinges',
  'rotule interne': 'internal hinge',
  'Aucune charge.': 'No load.',
  'Pas de moment de ce signe.': 'No moment of this sign.',
  'pas de moment de ce signe': 'no moment of this sign',
};

/** Regles a motif : une phrase entiere, ou l'ordre des mots change. */
const REGLES: ReadonlyArray<readonly [RegExp, string | ((...a: string[]) => string)]> = [
  [/^poutre isostatique$/, 'statically determinate beam'],
  [/^poutre hyperstatique de degré (\d+)$/, 'beam statically indeterminate to degree $1'],
  [/^Poutre de (.+) m, (\d+) appuis$/, '$1 m beam, $2 supports'],
  [
    /^Appui A(\d+) : réaction minimale (.+) kN, soulèvement possible \((.+)\) ; l'outil suppose l'appui bilatéral\.$/,
    (_t, n, r, c) => `Support A${n}: minimum reaction ${r} kN, uplift possible (${morceaux(c)}); the tool assumes a two-way support.`,
  ],
  [/^(.+) doit être un nombre strictement positif \((.+)\)\.$/, (_t, n, u) => `${morceaux(n)} must be a strictly positive number (${u}).`],
  [/^(.+) doit être un nombre positif ou nul \((.+)\)\.$/, (_t, n, u) => `${morceaux(n)} must be a positive number or zero (${u}).`],
  [/^(.+) doit être un nombre \((.+)\)\.$/, (_t, n, u) => `${morceaux(n)} must be a number (${u}).`],
  [/^(.+) : nombre à renseigner\.$/, (_t, n) => `${morceaux(n)}: number required.`],
  [
    /^(.+) \((.+) m\) doit se trouver sur la poutre, entre 0 et (.+) m\.$/,
    (_t, n, x, L) => `${morceaux(n)} (${x} m) must lie on the beam, between 0 and ${L} m.`,
  ],
  [/^Le coefficient (.+) doit être compris entre 0 et 1\.$/, 'The factor $1 must lie between 0 and 1.'],
  [/^Les appuis (\d+) et (\d+) sont à la même abscisse \((.+) m\) : les fusionner en un seul appui\.$/, 'Supports $1 and $2 are at the same abscissa ($3 m): merge them into a single support.'],
  [/^Les rotules (\d+) et (\d+) sont à la même abscisse\.$/, 'Hinges $1 and $2 are at the same abscissa.'],
  [
    /^La rotule (\d+) \((.+) m\) doit être strictement à l'intérieur de la poutre : une rotule d'extrémité ne change rien\.$/,
    'Hinge $1 ($2 m) must be strictly inside the beam: an end hinge changes nothing.',
  ],
  [
    /^La rotule (\d+) coïncide avec l'appui (\d+) \((.+)\) qui retient la rotation : on ne sait pas de quel côté il agit\.$/,
    (_t, r, a, t) => `Hinge ${r} coincides with support ${a} (${morceaux(t)}), which restrains rotation: it is not known on which side it acts.`,
  ],
  [/^Le moment (\d+) est appliqué sur une rotule : le déplacer d'un côté ou de l'autre\.$/, 'Moment $1 is applied at a hinge: move it to one side or the other.'],
  [/^La charge (\d+) doit avoir une fin strictement après son début\.$/, 'Load $1 must end strictly after its start.'],
  [
    /^Poutre hypostatique \(degré (-?\d+)\) : elle forme un mécanisme\. Ajouter un appui ou une liaison, ou retirer une rotule\.$/,
    'Hypostatic beam (degree $1): it forms a mechanism. Add a support or a restraint, or remove a hinge.',
  ],
  [/^Appui (\d+) : le coefficient de redistribution delta doit être au plus 1\.$/, 'Support $1: the redistribution factor delta must be at most 1.'],
  [
    /^Appui (\d+) : delta = (.+) est inférieur au minimum (.+) des aciers de classe (.+) \(§5\.5\(4\)\)\.$/,
    'Support $1: delta = $2 is below the minimum $3 for class $4 reinforcement (5.5(4)).',
  ],
  [/^Appui (\d+) : la redistribution est réservée aux appuis intermédiaires entre deux travées\.$/, 'Support $1: redistribution is reserved for intermediate supports between two spans.'],
  [/Lit de barres illisible : « (.*) » \(écrire par exemple 3HA16\)\./, 'Unreadable bar layer: “$1” (write for example 3HA16).'],
  [/Lit de barres « (.*) » : nombre et diamètre strictement positifs\./, 'Bar layer “$1”: number and diameter strictly positive.'],
  [
    /^(.+) : (\d+) % seulement des aciers inférieurs prolongés sur appui, moins des 25 % du §9\.2\.1\.4\(1\) et du §9\.2\.1\.5\(1\)\.$/,
    (_t, z, p) => `${morceaux(z)}: only ${p} % of the bottom bars continued to the support, less than the 25 % of 9.2.1.4(1) and 9.2.1.5(1).`,
  ],
  [
    /^Épure : à x = (.+) m, le moment décalé (.+) kN\.m dépasse le moment résistant des aciers (inférieurs|supérieurs) (.+) kN\.m\.$/,
    (_t, x, m, p, r) => `Curtailment: at x = ${x} m, the shifted moment ${m} kN.m exceeds the resisting moment of the ${p === 'inférieurs' ? 'bottom' : 'top'} bars ${r} kN.m.`,
  ],
  [
    /^(.+), x = (.+) m : V_Ed = (.+) kN depasse V_Rd,max = (.+) kN ; les bielles cèdent, agrandir la section\.$/,
    (_t, z, x, v, r) => `${morceaux(z)}, x = ${x} m: V_Ed = ${v} kN exceeds V_Rd,max = ${r} kN; the struts fail, enlarge the section.`,
  ],
  [
    /^Appui A(\d+) : les aciers de montage ne couvrent pas l'épure décalée ; des chapeaux sont nécessaires\.$/,
    'Support A$1: the assembly bars do not cover the shifted diagram; top bars are needed.',
  ],
  [
    /^Appui A(\d+) : les filants inférieurs \((.+) mm2\) n'ancrent pas F_E = (.+) kN \((.+) mm2 requis, §9\.2\.1\.4\(2\)\)\.$/,
    'Support A$1: the continuous bottom bars ($2 mm2) do not anchor F_E = $3 kN ($4 mm2 required, 9.2.1.4(2)).',
  ],
  [/^Zone (.+) : enveloppe absente\.$/, (_t, z) => `Zone ${morceaux(z)}: envelope missing.`],
  [/^Profil (.+) : (.+)$/, (_t, p, m) => `Section ${p}: ${tr(m)}`],
  [/^Type d'appui inconnu : (.*)\.$/, 'Unknown support type: $1.'],
  [/^Type de charge inconnu : (.*)\.$/, 'Unknown load type: $1.'],
  [/^element absent de la page : (.*)$/, 'element missing from the page: $1'],
];

/**
 * Glossaire de morceaux, applique en une passe (le plus long d'abord), sur
 * des mots entiers. Les renvois perdent leur « § » ensuite.
 */
const MORCEAUX: Record<string, string> = {
  // --- Phrases longues (ecran, note, dessins) ---
  "Calcul élastique linéaire au premier ordre, petits déplacements ; poutre d'Euler-Bernoulli de rigidité EI constante.":
    'First-order linear elastic analysis, small displacements; Euler-Bernoulli beam of constant stiffness EI.',
  'Méthode des déplacements ; solution exacte entre nœuds pour des charges au plus linéaires.': 'Displacement method; exact solution between nodes for loads at most linear.',
  'Enveloppes exactes par superposition : G sur toute la poutre avec un seul coefficient ; Q placée zone par zone là où elle est défavorable ; tassements pris ou non.':
    'Exact envelopes by superposition: G over the whole beam with a single factor; Q placed zone by zone where unfavourable; settlements included or not.',
  'Une seule action variable Q ; appuis bilatéraux, un soulèvement est signalé et rendu tel quel.':
    'A single variable action Q; two-way supports, an uplift is flagged and reported as is.',
  'Signes : charges vers le bas positives ; M positif fibre inférieure tendue ; V = dM/dx ; flèche positive vers le bas ; moments appliqués et de réaction positifs dans le sens trigonométrique.':
    'Signs: downward loads positive; M positive with the bottom fibre in tension; V = dM/dx; deflection positive downwards; applied and reaction moments positive anticlockwise.',
  "Les données d'entrée sont celles du modèle enregistré.": 'The input data are those of the saved model.',
  "Acier (si retenu) : EN 1993-1-1 par sections-ec3 ; par zone, M_Ed et V_Ed maximaux pris ensemble ; déversement avec C1 = 1 ou M_cr saisi ; flèche de l'enveloppe caractéristique comparée à L / n ; EI du profil, E = 210 000 MPa.":
    'Steel (if selected): EN 1993-1-1 by sections-ec3; per zone, maximum M_Ed and V_Ed taken together; lateral-torsional buckling with C1 = 1 or entered M_cr; deflection of the characteristic envelope compared with L / n; EI of the section, E = 210 000 MPa.',
  'Toutes les charges à leur valeur caractéristique (G + Q), sans coefficient, toutes travées chargées.':
    'All loads at their characteristic value (G + Q), without factors, all spans loaded.',
  'Les données saisies ont changé depuis ce calcul : la note décrit le dernier calcul lancé.':
    'The input has changed since this calculation: the note describes the last calculation run.',
  'Aucun calcul à exporter : lancer le calcul, puis réessayer.': 'No calculation to export: run the calculation, then try again.',
  'Choisir béton armé OU acier, pas les deux.': 'Choose reinforced concrete OR steel, not both.',
  "Fichier illisible : ce n'est pas du JSON.": 'Unreadable file: this is not JSON.',
  "Ce fichier n'est pas un modèle de poutres-continues.": 'This file is not a poutres-continues model.',
  'Une nouvelle version est disponible. Recharger maintenant ?': 'A new version is available. Reload now?',
  'enveloppe : maximum en trait plein, minimum en tirets': 'envelope: maximum as a solid line, minimum dashed',
  'M_Ed en trait fin, décalé de a_l en tirets, M_Rd en trait fort': 'M_Ed as a thin line, shifted by a_l dashed, M_Rd as a thick line',
  "Épure d'arrêt des barres": 'Bar curtailment diagram',
  'Schéma mécanique': 'Static diagram',
  'flèche positive vers le bas, échelle amplifiée': 'deflection positive downwards, exaggerated scale',
  'fibre inférieure tendue, trace vers le bas': 'bottom fibre in tension, plotted downwards',
  'positif vers le haut': 'positive upwards',
  'en trait fin, décalé de a': 'as a thin line, shifted by a',
  'en tirets, M': 'dashed, M',
  'en trait fort': 'as a thick line',
  flèche: 'deflection',
  déversement: 'lateral-torsional buckling',
  "M_Ed et V_Ed : maximums de la zone pris ensemble pour l'interaction M-V (sens de la sécurité).":
    'M_Ed and V_Ed: maximums of the zone taken together for the M-V interaction (safe side).',
  'E = 210 000 MPa, I_y du profil (remplace E et I saisis)': 'E = 210 000 MPa, I_y of the section (replaces the entered E and I)',
  'kN (axe)': 'kN (centreline)',
  'valeur recommandee': 'recommended value',
  'valeurs recommandees': 'recommended values',
  facteur: 'factor',
  classe: 'class',
  chapeaux: 'top bars',
  filants: 'continuous bars',
  renforts: 'additional bars',
  "les filants ne couvrent pas l'épure décalée ; des renforts sont nécessaires.": 'the continuous bars do not cover the shifted diagram; additional bars are needed.',
  "Le module d'élasticité E": 'The modulus of elasticity E',
  "L'inertie I": 'The second moment of area I',
  "L'épaisseur de table h_f doit être inférieure à h (mm).": 'The flange thickness h_f must be less than h (mm).',
  'M_cr (kN.m)': 'M<sub>cr</sub> (kN.m)',
  'Béton armé : flexion simple (section-uls, parabole-rectangle) ; x_u/d limite par le §5.5(4), delta = 1 hors redistribution ; effort tranchant §6.2 cadres droits, z = 0,9 d ; épure décalée de a_l (§9.2.1.3) ; l_bd avec alpha = 1 et sigma_sd = f_yd (dispositions-constructives).':
    'Reinforced concrete: simple bending (section-uls, parabola-rectangle); x_u/d limited by 5.5(4), delta = 1 without redistribution; shear force 6.2 vertical links, z = 0.9 d; diagram shifted by a_l (9.2.1.3); l_bd with alpha = 1 and sigma_sd = f_yd (dispositions-constructives).',
  "longueurs d'ancrage comprises": 'anchorage lengths included',
  'Poutre instable : la position des appuis et des rotules forme un mécanisme (par exemple deux rotules dans une même travée, ou une console terminée par une rotule). Ajouter un appui ou retirer une rotule.':
    'Unstable beam: the position of the supports and hinges forms a mechanism (for example two hinges in the same span, or a cantilever ending in a hinge). Add a support or remove a hinge.',
  'La poutre doit comporter au moins un appui.': 'The beam must have at least one support.',
  'La largeur de table b_eff doit être au moins égale à b_w (mm).': 'The flange width b_eff must be at least equal to b_w (mm).',
  'a_inf + a_sup doit rester inférieur à h (mm).': 'a_inf + a_sup must remain less than h (mm).',
  'cot theta doit être compris entre 1 et 2,5 (§6.2.3(2)).': 'cot theta must lie between 1 and 2.5 (6.2.3(2)).',
  'La largeur des appuis doit être positive ou nulle (mm).': 'The width of the supports must be positive or zero (mm).',
  'Un choix de chapeaux par appui est attendu.': 'One choice of top bars per support is expected.',
  'Un coefficient de redistribution par appui est attendu.': 'One redistribution factor per support is expected.',
  'Le coefficient des tassements gamma_T doit être un nombre positif ou nul.': 'The settlement factor gamma_T must be a positive number or zero.',
  'Aucune charge variable Q : les enveloppes se reduisent aux charges permanentes.': 'No variable load Q: the envelopes reduce to the permanent loads.',
  'La flèche limite L / n doit avoir un n strictement positif (-).': 'The deflection limit L / n must have a strictly positive n (-).',
  'Flexion : équilibre de la section introuvable (section-uls).': 'Bending: equilibrium of the section not found (section-uls).',
  'Déversement avec C1 = 1 (moment uniforme) sur la longueur entre maintiens saisie : du côté de la sécurité. ':
    'Lateral-torsional buckling with C1 = 1 (uniform moment) over the entered length between restraints: on the safe side. ',
  'Un M_cr calculé par ailleurs peut être saisi par zone.': 'An M_cr calculated elsewhere can be entered per zone.',
  'matrice de rigidite singuliere': 'singular stiffness matrix',
  ', variantes de coefficients combinées à Q placée travée par travée :': ', factor variants combined with Q placed span by span:',
  'Courbe enveloppe décalée de a': 'Envelope curve shifted by a',
  'Au-delà de la limite de x': 'Beyond the limit of x',
  'aciers comprimés ajoutés (limite du': 'compression bars added (limit of',
  'hors redistribution': 'without redistribution',
  'aciers tendus seuls, diagramme parabole-rectangle': 'tension bars only, parabola-rectangle diagram',
  'barres prolongées de l': 'bars extended by l',
  'mm en bas et': 'mm at the bottom and',
  'mm en haut au-delà du point où elles ne sont plus nécessaires': 'mm at the top beyond the point where they are no longer needed',
  'adhérence selon la position de coulage': 'bond according to the casting position',
  'cadres droits': 'vertical links',
  'réduit à d du nu de l\'appui': 'reduced at d from the face of the support',
  'pour les cadres': 'for the links',
  "comparé à V": 'compared with V',
  "à l'axe": 'at the centreline',
  'requis : minimum': 'required: minimum',
  'compris': 'included',
  'non nécessaires : les filants couvrent l\'épure': 'not needed: the continuous bars cover the diagram',
  "Appuis d'extrémité et dispositions": 'End supports and detailing',
  'ancrage des aciers inferieurs': 'anchorage of the bottom bars',
  'au-delà du nu': 'beyond the face',
  'aciers superieurs pour': 'top bars for',
  'aciers inférieurs prolongés sur appuis': 'bottom bars continued to the supports',
  'Flexion, aciers inférieurs (moment positif)': 'Bending, bottom bars (positive moment)',
  'Flexion, aciers supérieurs sur appui (moment négatif)': 'Bending, top bars over the support (negative moment)',
  'Arrêt des barres': 'Bar curtailment',
  'arrêt des barres': 'bar curtailment',
  'nécessaires de – à (m)': 'needed from – to (m)',
  'début (m)': 'start (m)',
  'fin (m)': 'end (m)',
  'longueur (m)': 'length (m)',
  'renforts bas': 'bottom additional bars',
  'renforts inférieurs': 'bottom additional bars',
  'appui x (m)': 'support x (m)',
  'axe (kN)': 'centreline (kN)',
  'à d du nu': 'at d from the face',
  'choisi': 'chosen',
  'req (mm²/mm)': 'req (mm²/mm)',
  'aciers choisis': 'chosen bars',
  'aciers tendus nécessaires': 'tension bars required',
  'aciers comprimés nécessaires': 'compression bars required',
  'axe neutre, limite': 'neutral axis, limit',
  'moment résistant des aciers choisis': 'resisting moment of the chosen bars',
  'moment de calcul': 'design moment',
  'aciers inférieurs': 'bottom bars',
  'aciers supérieurs': 'top bars',
  'Béton armé': 'Reinforced concrete',
  'béton armé': 'reinforced concrete',
  'effort tranchant': 'shear force',
  'Effort tranchant': 'Shear force',
  // --- Resultats ---
  'rigidité de flexion': 'flexural stiffness',
  'charges verticales (vers le bas)': 'vertical loads (downwards)',
  'réactions verticales (vers le haut)': 'vertical reactions (upwards)',
  "contrôle d'équilibre": 'equilibrium check',
  'somme des charges verticales (vers le bas)': 'sum of the vertical loads (downwards)',
  'somme des réactions verticales (vers le haut)': 'sum of the vertical reactions (upwards)',
  "degré d'hyperstaticité": 'degree of indeterminacy',
  'moment maximal': 'maximum moment',
  'moment minimal': 'minimum moment',
  'shear force maximal': 'maximum shear force',
  'shear force minimal': 'minimum shear force',
  'shear force extrême': 'extreme shear force',
  'effort tranchant maximal': 'maximum shear force',
  'effort tranchant minimal': 'minimum shear force',
  'effort tranchant extrême': 'extreme shear force',
  'flèche maximale': 'maximum deflection',
  'flèche extrême': 'extreme deflection',
  'flèche caractéristique': 'characteristic deflection',
  'flèche limite': 'deflection limit',
  'réaction verticale, positive vers le haut': 'vertical reaction, positive upwards',
  'moment de réaction, sens trigonométrique': 'reaction moment, anticlockwise',
  'moment fléchissant sur appui': 'bending moment at the support',
  'effort tranchant à gauche / à droite': 'shear force on the left / on the right',
  'deplacement vertical, positif vers le bas': 'vertical displacement, positive downwards',
  'rotation, sens trigonométrique': 'rotation, anticlockwise',
  'réaction maximale': 'maximum reaction',
  'réaction minimale': 'minimum reaction',
  'moment sur appui minimal': 'minimum moment at the support',
  'sur appui (kN·m)': 'at the support (kN·m)',
  'V extreme (kN)': 'extreme V (kN)',
  'w extreme (mm)': 'extreme w (mm)',
  'de – a (m)': 'from – to (m)',
  Synthèse: 'Summary',
  abscisse: 'abscissa',
  'disposition :': 'arrangement:',
  '— enveloppe —': '— envelope —',
  'Moment fléchissant M': 'Bending moment M',
  'moment fléchissant': 'bending moment',
  'Effort tranchant V': 'Shear force V',
  'Déformée w': 'Deflected shape w',
  déformée: 'deflected shape',
  'cotes en m': 'dimensions in m',
  'Schéma statique': 'Static diagram',
  'Enveloppe ELU': 'ULS envelope',
  'Enveloppe ELS caractéristique': 'Characteristic SLS envelope',
  'Enveloppe ELS fréquente': 'Frequent SLS envelope',
  'Enveloppe ELS quasi permanente': 'Quasi-permanent SLS envelope',
  'Charges caractéristiques G + Q, toutes travées chargées': 'Characteristic loads G + Q, all spans loaded',
  'Caractéristique G + Q': 'Characteristic G + Q',
  'ELU fondamental': 'ULS fundamental',
  'ELS caractéristique': 'characteristic SLS',
  'ELS fréquent': 'frequent SLS',
  'ELS quasi permanent': 'quasi-permanent SLS',
  'ELU et ELS': 'ULS and SLS',
  ELU: 'ULS',
  ELS: 'SLS',
  '(6.10a) et (6.10b)': '(6.10a) and (6.10b)',
  'sans tassement': 'without settlement',
  'avec tassement': 'with settlement',
  'sans Q': 'without Q',
  'Q sur': 'Q on',
  // --- Acier ---
  Conforme: 'Compliant',
  'Non conforme': 'Not compliant',
  'Vérification incomplète': 'Incomplete check',
  'poids propre du profil': 'self-weight of the section',
  'poids propre': 'self-weight',
  'ajouté aux charges G': 'added to the G loads',
  'maintien de la membrure comprimée': 'restraint of the compression flange',
  'longueurs entre maintiens par zone': 'lengths between restraints per zone',
  'longueur entre maintiens': 'length between restraints',
  'Longueur entre maintiens (m)': 'Length between restraints (m)',
  'profil en I laminé, catalogue de sections-ec3': 'rolled I-section, sections-ec3 catalogue',
  'remplace E et I saisis': 'replaces the entered E and I',
  'moment maximal en valeur absolue, ELU': 'maximum absolute moment, ULS',
  'effort tranchant maximal, ELU': 'maximum shear force, ULS',
  'classe de section': 'section class',
  cisaillement: 'shear',
  Cisaillement: 'Shear',
  Déversement: 'Lateral-torsional buckling',
  'section, interaction M-V': 'section, M-V interaction',
  "flèche de l'enveloppe caractéristique, limite L / n saisie": 'deflection of the characteristic envelope, entered limit L / n',
  'Taux linéaires sollicitation / résistance.': 'Linear ratios action effect / resistance.',
  'par sections-ec3': 'by sections-ec3',
  'enveloppe ELU fondamentale': 'fundamental ULS envelope',
  Acier: 'Steel',
  // --- Entrees, note ---
  Poutre: 'Beam',
  Appuis: 'Supports',
  appuis: 'supports',
  Appui: 'Support',
  appui: 'support',
  Charges: 'Loads',
  charges: 'loads',
  Charge: 'Load',
  Combinaisons: 'Combinations',
  Rigidité: 'Stiffness',
  Paramètres: 'Parameters',
  Section: 'Section',
  'Flexion, support x': 'Bending, support x',
  Flexion: 'Bending',
  Flèche: 'Deflection',
  'coefficients de Q': 'factors of Q',
  "coefficient des tassements à l'ULS": 'settlement factor at the ULS',
  "coefficient des tassements à l'ELU": 'settlement factor at the ULS',
  'inclinaison des bielles': 'inclination of the struts',
  'distances des fibres aux axes des aciers': 'distances from the fibres to the bar axes',
  'toutes les extrémités de zone': 'all zone ends',
  tassement: 'settlement',
  'force ponctuelle': 'point force',
  'moment ponctuel': 'point moment',
  'charge répartie uniforme': 'uniformly distributed load',
  'charge triangulaire ou trapézoïdale': 'triangular or trapezoidal load',
  'permanente G': 'permanent G',
  'variable Q': 'variable Q',
  'appui simple': 'simple support',
  'encastrement glissant': 'sliding fixed support',
  'encastrement élastique': 'elastic fixed support',
  'appui élastique (ressorts)': 'elastic support (springs)',
  encastrement: 'fixed support',
  'console gauche': 'left cantilever',
  'console droite': 'right cantilever',
  'Console gauche': 'Left cantilever',
  'Console droite': 'Right cantilever',
  travées: 'spans',
  travée: 'span',
  Travée: 'Span',
  travee: 'span',
  zone: 'zone',
  // --- Saisie ---
  'Longueur L': 'Length L',
  'Module E': 'Modulus E',
  'Inertie I': 'Second moment of area I',
  'abscisse x': 'abscissa x',
  'raideur en rotation': 'rotational stiffness',
  'raideur verticale': 'vertical stiffness',
  Rotule: 'Hinge',
  'force P': 'force P',
  'moment M': 'moment M',
  'début a': 'start a',
  'fin b': 'end b',
  'intensité q': 'intensity q',
  'gamma des tassements': 'gamma of the settlements',
  'Flèche limite L / n': 'Deflection limit L / n',
  "Largeur d'âme b_w": 'Web width b_w',
  'Hauteur h': 'Depth h',
  'Diamètre des cadres': 'Diameter of the links',
  'Nombre de brins': 'Number of legs',
  'Espacement des cadres': 'Spacing of the links',
  'Largeur des appuis': 'Width of the supports',
  'Aciers de montage': 'Assembly bars',
  'La longueur de la poutre L': 'The length of the beam L',
  'La rigidite de flexion EI': 'The flexural stiffness EI',
  "La largeur d ame b_w": 'The web width b_w',
  'La hauteur h': 'The depth h',
  'L epaisseur de table h_f': 'The flange thickness h_f',
  'La resistance du beton f_ck': 'The concrete strength f_ck',
  'La limite elastique f_yk': 'The yield strength f_yk',
  'La distance a_inf': 'The distance a_inf',
  'La distance a_sup': 'The distance a_sup',
  'Le diametre des cadres': 'The diameter of the links',
  'Le nombre de brins': 'The number of legs',
  "L espacement des cadres": 'The spacing of the links',
  "L'abscisse de la rotule": 'The abscissa of hinge',
  "L'abscisse de l'appui": 'The abscissa of support',
  "L'abscisse de la charge": 'The abscissa of load',
  'La force de la charge': 'The force of load',
  'Le moment de la charge': 'The moment of load',
  'Le début de la charge': 'The start of load',
  'La fin de la charge': 'The end of load',
  "L'intensité de début de la charge": 'The start intensity of load',
  "L'intensité de fin de la charge": 'The end intensity of load',
  "L'intensité de la charge": 'The intensity of load',
  'Le tassement de l\'appui': 'The settlement of support',
  'La raideur verticale de l\'appui': 'The vertical stiffness of support',
  'La raideur en rotation de l\'appui': 'The rotational stiffness of support',
  'aciers inférieurs prolongés': 'bottom bars continued',
  retirer: 'remove',
  'cas de charge': 'load case',
  'tassement (mm, &darr;+)': 'settlement (mm, &darr;+)',
  redistribution: 'redistribution',
  'de a (m)': 'from a (m)',
  'a b (m)': 'to b (m)',
  'vide : titre par défaut': 'empty: default title',
  // --- Exemples ---
  'Poutre BA trois travées, G + Q, ferraillage': 'RC beam, three spans, G + Q, reinforcement',
  'Trois travées égales, charge uniforme': 'Three equal spans, uniform load',
  'Biappuyée avec une console de chaque côté': 'Simply supported with a cantilever on each side',
  'Encastrée - appuyée, charge triangulaire et force': 'Fixed - pinned, triangular load and force',
  'Poutre Gerber (rotules), deux travées et console': 'Gerber beam (hinges), two spans and a cantilever',
  'Appui élastique et encastrement élastique': 'Elastic support and elastic fixed support',
  "Deux travées, tassement de l'appui central": 'Two spans, settlement of the central support',
  // --- Mots courts (en dernier par la longueur) ---
  'à x =': 'at x =',
  à: 'to',
  de: 'from',
  et: 'and',
  ou: 'or',
  sur: 'on',
  par: 'per',
  avec: 'with',
  sans: 'without',
  pour: 'for',
  'mm (bas)': 'mm (bottom)',
  'mm (haut)': 'mm (top)',
  'en haut': 'at the top',
  'en bas': 'at the bottom',
  seulement: 'only',
};

const CLES = Object.keys(MORCEAUX).sort((a, b) => b.length - a.length);
const echapperRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Bornes de mot seulement du cote ou la cle commence ou finit par une lettre. */
const LETTRE = /\p{L}/u;
const borne = (k: string): string =>
  `${LETTRE.test(k.charAt(0)) ? '(?<!\\p{L})' : ''}${echapperRegex(k)}${LETTRE.test(k.charAt(k.length - 1)) ? '(?!\\p{L})' : ''}`;
const MOTIF = new RegExp(CLES.map(borne).join('|'), 'gu');

/** Glossaire en une passe, puis les renvois sans « § » ni « tableau ». */
function morceaux(t: string): string {
  return t
    .replace(MOTIF, (m) => MORCEAUX[m] ?? m)
    .replace(/§\s?/g, '')
    .replace(/\btableau\b/g, 'Table')
    .replace(/\bannexe\b/g, 'Annex')
    // Typographie anglaise : pas d'espace avant « : » et « ; ».
    .replace(/ +([:;])(?=\s|$)/g, '$1');
}

/** Une phrase (espaces de bord conserves). */
export function tr(t: string): string {
  if (langueCourante() === 'fr') return t;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(t);
  if (m === null || m[2] === '') return t;
  const coeur = m[2];
  let sortie = EXACTES[coeur];
  if (sortie === undefined) {
    const r = REGLES.find(([motif]) => motif.test(coeur));
    // Apres une regle, le glossaire traite ce qui reste autour (prefixe « Zone 1 : »...).
    sortie = r === undefined ? morceaux(coeur) : morceaux(coeur.replace(r[0], r[1] as string));
  }
  // « M_Rd : ... » coupe par la notation : pas d'espace avant le deux-points.
  return (/^[:;]/.test(sortie) ? '' : m[1]) + pointDecimal(sortie) + m[3];
}

/** Fragment HTML ou SVG : noeuds de texte et attributs lisibles, hors <style>. */
export function trHtml(html: string): string {
  if (langueCourante() === 'fr') return html;
  return html
    .split(/(<style[\s\S]*?<\/style>)/)
    .map((morceau, i) =>
      i % 2 === 1
        ? morceau
        : morceau
            .replace(/>([^<>]+)</g, (_m, texte: string) => `>${tr(texte)}<`)
            .replace(/\s(title|aria-label|placeholder|label)="([^"]*)"/g, (_m, a: string, v: string) => ` ${a}="${tr(v)}"`)
    )
    .join('');
}

/**
 * Note de calcul (ou toute structure) : chaque chaine passe par `tr`, les SVG
 * des figures par `trHtml`. Traduire AVANT la mise en HTML garde les phrases
 * entieres (la notation les coupe en morceaux de texte).
 */
export function trNote<T>(x: T): T {
  if (langueCourante() === 'fr') return x;
  const parcourir = (v: unknown, cle: string): unknown => {
    if (typeof v === 'string') return cle === 'svg' ? trHtml(v) : tr(v);
    if (Array.isArray(v)) return v.map((e) => parcourir(e, cle));
    if (v !== null && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, e]) => [k, parcourir(e, k)]));
    return v;
  };
  return parcourir(x, '') as T;
}

/** Blocs du CSV et de la note. */
export function trBlocs(blocs: BlocResultat[]): BlocResultat[] {
  if (langueCourante() === 'fr') return blocs;
  return blocs.map((b) => ({
    titre: tr(b.titre),
    lignes: b.lignes.map((l) => ({ ...l, symbole: tr(l.symbole), libelle: tr(l.libelle), valeur: tr(l.valeur) })),
    note: b.note === null ? null : tr(b.note),
  }));
}
