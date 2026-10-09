# Validation — poutre à trois travées égales et poutre à deux consoles

Deux cas résolus à la main, repris dans `tests/calcul.test.ts`. Les valeurs de
l'outil sont celles de l'exemple « Trois travées égales » de la page.

## 1. Trois travées de 5 m, q = 10 kN/m, appuis simples

Données : L = 15 m, appuis en 0, 5, 10, 15 m, q = 10 kN/m sur toute la
longueur, E = 30 000 MPa, I = 312 500 cm⁴ (section 30 × 50 cm), soit
EI = 30 000 × 312 500 × 10⁻⁵ = 93 750 kN·m².

Degré d'hyperstaticité : 4 liaisons − 2 = 2.

### Équation des trois moments (Clapeyron)

Pour deux travées consécutives de même portée l et de même rigidité, sous
charge uniforme :

M_{i-1} + 4 M_i + M_{i+1} = − q l² / 2 … (forme réduite, l égales)

Par symétrie M_B = M_C = M et M_A = M_D = 0 :

0 + 4M + M = −10 × 25 / 2 = −125, d'où **M = −25 kN·m** (= −0,1 q l²).

### Réactions

Travée AB, isolée : R_A = q l / 2 + (M_B − M_A) / l = 25 − 5 = **20 kN**.
Effort tranchant à gauche de B : 20 − 50 = −30 kN ; à droite de B, par
symétrie de la travée centrale : +25 kN. R_B = 30 + 25 = **55 kN**.
Contrôle : 2 × 20 + 2 × 55 = 150 kN = 10 × 15.

### Moments en travée

Travée de rive : M(x) = 20 x − 5 x², maximal pour V = 0 en x = 2 m :
**M = 20 kN·m**.
Travée centrale : M = −25 + q l² / 8 = −25 + 31,25 = **6,25 kN·m** à 7,5 m.

### Flèche de la travée de rive

Valeur tabulée 0,0069 q l⁴ / EI = 0,0069 × 10 × 625 / 93 750 = 0,46 mm,
vers x = 0,446 l = 2,23 m. L'outil rend **0,46 mm à x = 2,23 m**.

| Grandeur | Main | Outil |
|---|---|---|
| R_A = R_D | 20,00 kN | 20,00 kN |
| R_B = R_C | 55,00 kN | 55,00 kN |
| M_B = M_C | −25,00 kN·m | −25,00 kN·m |
| M travée de rive | 20,00 kN·m à 2 m | 20,00 kN·m à 2 m |
| M travée centrale | 6,25 kN·m à 7,5 m | 6,25 kN·m à 7,5 m |
| V à gauche / droite de B | −30 / +25 kN | −30,00 / 25,00 kN |
| w max travée de rive | 0,46 mm | 0,46 mm |

## 2. Poutre biappuyée à deux consoles

Données : L = 10 m, appuis simples en 2 et 8 m (travée l = 6 m, consoles
a = 2 m), q = 10 kN/m partout, EI = 50 000 kN·m². Isostatique.

- Réactions par symétrie : R = 100 / 2 = **50 kN**.
- Moment sur appui (console) : −q a² / 2 = **−20 kN·m**.
- Moment à mi-travée : 50 × 3 − 10 × 5² / 2 = **25 kN·m**.
- Rotation sur appui : q l³ / 24EI − (q a² / 2) l / 2EI = 1,8·10⁻³ − 1,2·10⁻³ = 6·10⁻⁴ rad.
- Bout de console : −6·10⁻⁴ × 2 + q a⁴ / 8EI = −1,2 + 0,4 = **−0,8 mm** (la console remonte).
- Mi-travée : 5 q l⁴ / 384EI − (q a² / 2) l² / 8EI = 3,375 − 1,8 = **1,575 mm**.

L'outil rend exactement ces valeurs (test « poutre biappuyée à deux consoles »).
