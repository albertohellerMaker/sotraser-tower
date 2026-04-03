/** Constantes globales del sistema */
export { CONTRATOS_VOLVO_ACTIVOS } from "../faena-filter";
export const VELOCIDAD_MAX = 105;

/** SQL: camión válido (VIN registrado) */
export const SQL_CAMION_VALIDO = `
  c.vin IS NOT NULL AND c.vin != ''
`;

/** SQL: sin filtro de contrato (todos) */
export const SQL_CONTRATO_CENCOSUD = `TRUE`;
