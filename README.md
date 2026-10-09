# beam — poutres continues et hyperstatiques

Réactions, moments fléchissants, efforts tranchants et déformée d'une poutre
droite **continue ou hyperstatique**, avec diagrammes M, V et w.

Fait partie de la suite [Aedificium web](https://henri421.github.io/WebAedificium/).
Page publiée : <https://henri421.github.io/beam/>.

> **Aide au calcul. Cet outil constate, il ne prescrit pas.** Le calcul est
> élastique linéaire au premier ordre, sur les charges telles que saisies :
> combinaisons, coefficients partiels, charges alternées, redistribution et
> vérifications de section restent à la charge de l'ingénieur.

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

## Ce que l'outil rend

- degré d'hyperstaticité et contrôle d'équilibre ΣR = ΣF ;
- par appui : réaction R, moment de réaction, moment sur appui, effort
  tranchant à gauche et à droite, déplacement (tassement ou enfoncement du
  ressort), rotation ;
- par travée et par console : M max, M min, effort tranchant et flèche
  extrêmes, avec leur abscisse ;
- diagrammes M, V et déformée, valeurs annotées ;
- sorties : SVG, CSV des résultats, CSV des valeurs le long de la poutre, note
  de calcul HTML imprimable.

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
ordre, appuis unilatéraux (un soulèvement est rendu tel quel), enveloppes de
charges alternées et combinaisons EN 1990.

## Validation

`docs/validation/trois-travees-et-consoles.md` : trois travées égales par
l'équation des trois moments, poutre à deux consoles. Les tests reprennent les
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
