# beam — poutres continues et hyperstatiques

Réactions, moments fléchissants, efforts tranchants et déformée d'une poutre
droite **continue ou hyperstatique** ; **enveloppes des combinaisons EN 1990**
avec charges variables alternées ; et, en béton armé, **aciers nécessaires,
épure d'arrêt des barres, effort tranchant et ancrages** (EN 1992-1-1:2004).

Fait partie de la suite [Aedificium web](https://henri421.github.io/WebAedificium/).
Page publiée : <https://henri421.github.io/beam/>.

> **Aide au calcul. Cet outil constate, il ne prescrit pas.** Calcul élastique
> linéaire au premier ordre, valeurs recommandées des Eurocodes (aucune annexe
> nationale codée, chaque coefficient porte sa source). L'outil rend les aciers
> nécessaires, la résistance des barres que l'ingénieur choisit et les longueurs
> minimales qui couvrent l'épure ; le ferraillage reste à concevoir et à vérifier.

## Saisie

- **Poutre** : longueur totale L (m), module E (MPa) et inertie I (cm⁴) ; EI constant.
- **Appuis**, en nombre quelconque, à n'importe quelle abscisse (consoles comprises) :
  - appui simple (articulation ou rouleau), avec tassement imposé ;
  - encastrement, avec tassement imposé ;
  - encastrement glissant (rotation bloquée, déplacement libre) ;
  - encastrement élastique : appui simple + ressort de rotation k_θ (kN·m/rad) ;
  - appui élastique : ressort vertical k_v (kN/m) et/ou ressort de rotation.
- **Rotules internes** (poutres Gerber).
- **Charges** : force ponctuelle, charge répartie uniforme partielle ou totale,
  charge triangulaire ou trapézoïdale, moment ponctuel.

Le schéma mécanique suit la saisie en direct ; le bouton **Calculer** lance le
calcul. Le modèle se conserve dans le navigateur et s'enregistre en JSON.

## Combinaisons et enveloppes

Chaque charge est **permanente (G)** ou **variable (Q)**. L'outil calcule une
fois G, puis Q **travée par travée** (une charge Q qui couvre plusieurs travées
est coupée aux appuis), puis les tassements, et superpose :

- **ELU fondamental** (6.10), ou le plus défavorable de (6.10a) et (6.10b) :
  γ_G = 1,35 ou 1,00 sur toute la poutre, γ_Q = 1,5 là où Q est défavorable ;
- **ELS** caractéristique, fréquent (ψ₁) et quasi permanent (ψ₂) ;
- tassements pris ou non (γ saisi à l'ELU).

**Enveloppe exacte** : en chaque point, chaque travée est chargée là où elle
aggrave l'effet ; c'est la pire des 2ⁿ dispositions sans les énumérer, ce qui
couvre et dépasse les dispositions simplifiées du §5.1.3. Pour chaque
extremum, l'outil donne la disposition qui le produit, et on peut la rejouer
avec ses diagrammes. Un soulèvement d'appui est signalé.

## Béton armé

Section rectangulaire ou en T, f_ck, f_yk, classe de ductilité, positions des
aciers, cadres, largeur des appuis ; aciers choisis par travée (filants et
renforts), par appui (chapeaux) et filants hauts (montage).

- **Flexion** (via [section-uls](https://github.com/henri421/section-uls),
  parabole-rectangle) : A_s nécessaire en travée et sur appui, aciers comprimés
  au-delà de x_u/d limite (§5.5(4)), A_s,min et A_s,max (§9.2.1.1), M_Rd et
  taux des aciers choisis.
- **Redistribution** (§5.5) : δ par appui intermédiaire, appliqué cas par cas
  avant enveloppe ; contrôles δ ≥ k₅ (ou k₆), portées voisines dans [0,5 ; 2],
  x_u/d ≤ (δ − k₁)/k₂.
- **Effort tranchant** (§6.2) : V_Rd,c, V_Rd,max, A_sw/s nécessaire avec
  V_Ed réduit à d du nu, ρ_w,min, s_max ; taux des cadres choisis.
- **Épure d'arrêt des barres** : enveloppe décalée de a_l = z cot θ / 2
  (§9.2.1.3), moment résistant des filants, renforts et chapeaux avec rampes
  d'ancrage, longueurs minimales des renforts et chapeaux, l_bd via
  [dispositions-constructives](https://github.com/henri421/dispositions-constructives)
  (§8.4, α = 1, σ_sd = f_yd, adhérence selon la position de coulage).
- **Appuis** : ancrage de F_E = V_Ed a_l / z aux appuis d'extrémité
  (§9.2.1.4(2)), 25 % des aciers de travée prolongés (§9.2.1.4(1),
  §9.2.1.5(1)), aciers supérieurs β₁ M_travée sur appui monolithique
  (§9.2.1.2(1)).

## Ce que l'outil rend aussi

- degré d'hyperstaticité et contrôle d'équilibre ΣR = ΣF ;
- par appui : réaction, moment de réaction, moment sur appui, efforts
  tranchants à gauche et à droite, déplacement, rotation ;
- diagrammes M, V et déformée, enveloppes, épure ;
- sorties : SVG, CSV des résultats, CSV des valeurs le long de la poutre, note
  de calcul HTML imprimable, modèle JSON.

## Méthode

Méthode des déplacements : la poutre est découpée aux appuis, rotules, points
d'application et bornes des charges ; chaque tronçon est un élément
d'Euler-Bernoulli chargé par ses forces nodales équivalentes cohérentes.
Entre deux nœuds, la charge est au plus linéaire : efforts et déformée y
sont obtenus par intégration analytique, les valeurs rendues sont **exactes**
pour la théorie des poutres, sans discrétisation. Une poutre hypostatique ou
un mécanisme local (rotules mal placées) est refusé avec son motif.

Signes : charges vers le bas positives ; M positif fibre inférieure tendue
(tracé vers le bas) ; V = dM/dx ; flèche positive vers le bas ; moments
appliqués et de réaction positifs dans le sens trigonométrique. Unités : m, kN,
kN/m, kN·m, mm pour les flèches (écart déclaré à la convention commune en mm).

## Hors périmètre

Inertie variable, déformation d'effort tranchant, effort normal et second
ordre, appuis unilatéraux (un soulèvement est signalé et rendu tel quel),
plusieurs actions variables, flèche fissurée (§7.4.3), torsion, charges
mobiles, précontrainte.

## Validation

`docs/validation/trois-travees-et-consoles.md` : trois travées égales par
l'équation des trois moments, poutre à deux consoles.
`docs/validation/enveloppes-et-beton-arme.md` : enveloppes par énumération
des dispositions, sections de béton armé intégrées à part. Les tests reprennent les
formules fermées classiques (console, encastrée-appuyée, bi-encastrée sous
charge triangulaire, appui élastique, tassement, encastrement élastique et
glissant, Gerber) et contrôlent l'équilibre d'un cas mixte.

## Développement

```bash
npm ci
npm test
npm run dev
```

Licence MIT.
