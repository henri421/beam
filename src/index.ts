/**
 * poutres-continues — noyau de calcul des poutres continues et hyperstatiques.
 */

export * from './modele';
export {
  calculerPoutre,
  decouperEnTravees,
  deplacement,
  effortTranchant,
  momentFlechissant,
  rotation,
  type Extremum,
  type Point,
  type Reaction,
  type ResultatPoutre,
  type Travee,
  type Troncon,
} from './calcul';
export { resoudre, MatriceSinguliere } from './algebre';
