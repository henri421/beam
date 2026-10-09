# Validation — enveloppes de combinaisons et béton armé

Valeurs reprises dans `tests/combinaisons.test.ts` et `tests/beton-arme.test.ts`.
Les attendus sont calculés **indépendamment** du noyau : équation des trois
moments avec les 2³ dispositions énumérées, et diagramme parabole-rectangle
intégré à part (scripts hors dépôt).

## 1. Enveloppes, trois travées de 5 m

g = 10 kN/m (G) et q = 5 kN/m (Q) sur toute la longueur, appuis simples.

Coefficients de q l² (l = 5 m) obtenus par énumération des dispositions :

| Effet | Disposition de Q | Coefficient q | Classique |
|---|---|---|---|
| M max travée de rive | travées 1 et 3 | 0,10125 | 0,101 |
| M sur appui B | travées 1 et 2 | −0,11667 | −0,117 |
| M max travée centrale | travée 2 | 0,075 | 0,075 |

### ELS caractéristique (G + Q)

- travée 1 : 0,08 × 10 × 25 + 0,10125 × 5 × 25 = **32,552 kN·m**, Q sur 1 et 3 ;
- appui B : −0,1 × 250 − 0,11667 × 125 = **−39,583 kN·m**, Q sur 1 et 2 ;
- travée 2 : 0,025 × 250 + 0,075 × 125 = **15,625 kN·m**, Q sur 2 ;
- R_B max = **85 kN** ; R_A entre **18,75** et **31,25 kN**.

### ELU (6.10), γ_G = 1,35 ou 1,00, γ_Q = 1,5

- travée 1 : **45,834 kN·m** ; appui B : **−55,625 kN·m** ; travée 2 : **22,5 kN·m** ;
- R_B max = **119,25 kN** ;
- R_A min = **18,125 kN**, avec G favorable (1,00) et Q sur la seule travée 2 :
  l'enveloppe trouve d'elle-même la variante γ_G,inf.

### (6.10a) et (6.10b), appui B, ψ₀ = 0,7

- (6.10a) : −(1,35 × 10 × 2,5 + 1,5 × 0,7 × 5 × 2,9167) = −49,0625 kN·m ;
- (6.10b) : −(0,85 × 1,35 × 10 × 2,5 + 1,5 × 5 × 2,9167) = **−50,5625 kN·m**, retenue.

### Redistribution δ = 0,8 sur l'appui B (cas G seul)

M_B = −25 → **−20 kN·m**, M_C inchangé ; R_A = 25 + (−20)/5 = **21 kN** ; somme des
réactions inchangée (150 kN). À l'ELU, M_B redistribué = 0,85 × (−55,625) pour
δ = 0,85, parce que l'opération est linéaire et appliquée cas par cas.

## 2. Flexion simple, section 300 × 500, C25/30, B500

f_cd = 16,667 MPa, f_yd = 434,78 MPa ; parabole-rectangle : α_R = 0,80952,
k_a = 0,41597 (ε_cu2 = 3,5 ‰, ε_c2 = 2 ‰).

| Cas | d | M_Ed | Attendu | Outil |
|---|---|---|---|---|
| rectangle | 450 | 150 kN·m | A_s = 836,1 mm², x/d = 0,1996 | idem |
| table 1000 × 120 comprimée | 450 | 200 kN·m | A_s = 1055,4 mm² | idem |
| âme 300 comprimée (moment négatif) | 455 | −150 kN·m | A_s = 825,1 mm² | idem |
| au-delà de x_u/d = 0,448 | 450 | 400 kN·m | A_s = 2458,9 + A_s2 = 605,3 mm² | idem |

Dernier cas : x = 0,448 × 450 = 201,6 mm, M_c = 298,77 kN·m ; l'acier comprimé
(50 mm) est plastifié et section-uls déduit le béton qu'il remplace :
A_s2 = 101,23·10⁶ / ((434,78 − 16,67) × 400) = 605,3 mm². Un premier calcul à la
main qui oubliait ce béton déplacé donnait 582 mm² ; c'est le test qui a
tranché.

A_s,min = max(0,26 × 2,565/500 ; 0,0013) × 300 × 450 = **180,1 mm²**.

## 3. Effort tranchant et ancrage, travée isostatique de 6 m

M_Ed = 150 kN·m, d'où V_Ed = 100 kN à l'axe. Appui de 200 mm :
V_Ed à 0,1 + 0,455 m de l'axe = 100 (1 − 2 × 0,555 / 6) = **81,5 kN**.
A_sw/s = 81 500 / (405 × 434,78 × 2,5) = 0,185 mm²/mm, inférieur au minimum
0,08 √25 / 500 × 300 = **0,24 mm²/mm**, qui gouverne. s_max = 0,75 × 450 = 337,5 mm.

Ancrage sur l'appui d'extrémité : F_E = V_Ed a_l / z = 100 × 2,5 / 2 = **125 kN**,
A_s requis = 125 000 / 434,78 = 287,5 mm².
