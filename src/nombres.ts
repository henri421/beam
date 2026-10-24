/**
 * Mise en forme des nombres dans les messages du noyau.
 *
 * Le noyau n'importe pas `aedificium-ui` : ces quelques lignes reprennent
 * localement `nombreAffiche` — trois decimales au plus, sans zeros inutiles,
 * virgule decimale.
 */
export function nombreAffiche(valeur: number, decimalesMax = 3): string {
  if (!Number.isFinite(valeur)) return '—';
  const texte = valeur.toFixed(decimalesMax).replace('.', ',');
  const sansZeros = texte.includes(',') ? texte.replace(/,?0+$/, '') : texte;
  return sansZeros === '-0' ? '0' : sansZeros;
}
