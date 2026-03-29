/**
 * Filtro global: un camión es válido si tiene VIN registrado.
 * Acepta cualquier formato de patente (numérica, alfanumérica, etc.)
 * Usar en todas las queries que involucren la tabla camiones.
 */

/** Para queries raw SQL con alias configurable */
export function filtroCamionSQL(alias = "camiones"): string {
  return `${alias}.vin IS NOT NULL AND ${alias}.vin != ''`;
}

/** Alias por defecto */
export const FILTRO_CAMION = filtroCamionSQL("camiones");

/** Para alias "c" */
export const FILTRO_CAMION_C = filtroCamionSQL("c");

/** Para alias "cam" */
export const FILTRO_CAMION_CAM = filtroCamionSQL("cam");
