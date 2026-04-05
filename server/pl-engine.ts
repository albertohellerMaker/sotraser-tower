import { pool } from "./db";

interface Parametros {
  precio_diesel: number;
  cvm_km: number;
  costo_conductor_dia: number;
  costo_fijo_dia: number;
}

async function getParametros(): Promise<Parametros> {
  const r = await pool.query(`SELECT clave, valor FROM cencosud_parametros WHERE clave IN ('precio_diesel','cvm_km','costo_conductor_dia','costo_fijo_dia')`);
  const map: Record<string, number> = {};
  r.rows.forEach((row: any) => { map[row.clave] = parseFloat(row.valor); });
  return {
    precio_diesel: map.precio_diesel || 1110,
    cvm_km: map.cvm_km || 450,
    costo_conductor_dia: map.costo_conductor_dia || 45000,
    costo_fijo_dia: map.costo_fijo_dia || 35000,
  };
}

export async function calcularPLViajes(filtroFecha?: string): Promise<{ procesados: number; conTarifa: number; sinTarifa: number }> {
  const params = await getParametros();

  const queryParams: string[] = [];
  let whereDate = "";
  if (filtroFecha) {
    queryParams.push(filtroFecha);
    whereDate = `AND DATE(va.fecha_inicio) = $1`;
  }

  const viajes = await pool.query(`
    SELECT va.id, va.km_ecu::float as km, va.litros_consumidos_ecu::float as litros,
      va.origen_nombre, va.destino_nombre, va.duracion_minutos::int as dur,
      va.camion_id, va.paradas,
      COALESCE(gao.nombre_contrato, va.origen_nombre) as origen_c,
      COALESCE(gad.nombre_contrato, va.destino_nombre) as destino_c
    FROM viajes_aprendizaje va
    LEFT JOIN geocerca_alias_contrato gao ON gao.geocerca_nombre = va.origen_nombre AND gao.contrato = 'CENCOSUD'
    LEFT JOIN geocerca_alias_contrato gad ON gad.geocerca_nombre = va.destino_nombre AND gad.contrato = 'CENCOSUD'
    WHERE va.contrato = 'CENCOSUD'
      AND va.km_ecu > 0
      ${whereDate}
  `, queryParams);

  const tarifas = await pool.query(`
    SELECT id, origen, destino, tarifa::int as tarifa, clase, lote
    FROM contrato_rutas_tarifas
    WHERE contrato = 'CENCOSUD' AND activo = true
  `);

  const tarifaMap = new Map<string, { id: number; tarifa: number; clase: string }>();
  for (const t of tarifas.rows) {
    const key = `${t.origen}|${t.destino}`;
    const existing = tarifaMap.get(key);
    if (!existing || t.clase === 'FLF') {
      tarifaMap.set(key, { id: t.id, tarifa: t.tarifa, clase: t.clase });
    }
  }

  const EQUIVALENCIAS: Record<string, string[]> = {
    "Chillán": ["CD Chillán", "CD LTS CHILLAN camino Nahueltoro 230"],
    "CD Chillán": ["Chillán"],
    "CD LTS CHILLAN camino Nahueltoro 230": ["CD Chillán", "Chillán"],
    "CT Concepción": ["Concepción"],
    "Concepción": ["CT Concepción"],
    "Coquimbo": ["CT Coquimbo"],
    "CT Coquimbo": ["Coquimbo"],
    "CD Noviciado": ["Noviciado"],
    "Noviciado": ["CD Noviciado"],
    "CD Vespucio": ["Vespucio"],
    "Vespucio": ["CD Vespucio"],
    "CD Lo Aguirre": ["Lo Aguirre"],
    "Lo Aguirre": ["CD Lo Aguirre"],
  };

  function buscarTarifaFlex(origen: string, destino: string): { id: number; tarifa: number; clase: string } | null {
    const direct = tarifaMap.get(`${origen}|${destino}`);
    if (direct) return direct;
    const reverse = tarifaMap.get(`${destino}|${origen}`);
    if (reverse) return reverse;
    const origenAlts = [origen, ...(EQUIVALENCIAS[origen] || [])];
    const destinoAlts = [destino, ...(EQUIVALENCIAS[destino] || [])];
    for (const o of origenAlts) {
      for (const d of destinoAlts) {
        const t = tarifaMap.get(`${o}|${d}`) || tarifaMap.get(`${d}|${o}`);
        if (t) return t;
      }
    }
    return null;
  }

  let procesados = 0;
  let conTarifa = 0;
  let sinTarifa = 0;

  for (const v of viajes.rows) {
    const km = v.km || 0;
    const litros = v.litros || 0;

    const costoDiesel = Math.round(litros * params.precio_diesel);
    const costoCvm = Math.round(km * params.cvm_km);
    const horas = (v.dur || 0) / 60;
    const costoConductor = Math.round(params.costo_conductor_dia * (horas / 24));
    const costoFijo = Math.round(params.costo_fijo_dia * (horas / 24));
    const costoTotal = costoDiesel + costoCvm + costoConductor + costoFijo;

    const origenC = v.origen_c || v.origen_nombre;
    const destinoC = v.destino_c || v.destino_nombre;

    let ingresoTarifa = 0;
    let tarifaId: number | null = null;
    let tarifaClase: string | null = null;

    let paradas: any = null;
    try { paradas = typeof v.paradas === 'string' ? JSON.parse(v.paradas) : v.paradas; } catch {}
    const tarifaT1 = paradas?.tarifa_encontrada;

    if (tarifaT1 && tarifaT1 > 0) {
      ingresoTarifa = tarifaT1;
      tarifaClase = paradas?.tipo || 'T1';
      conTarifa++;
    } else if (origenC && destinoC) {
      const t = buscarTarifaFlex(origenC, destinoC);
      if (t) {
        ingresoTarifa = t.tarifa;
        tarifaId = t.id;
        tarifaClase = t.clase;
        conTarifa++;
      } else {
        sinTarifa++;
      }
    } else {
      sinTarifa++;
    }

    const margenBruto = ingresoTarifa - costoTotal;

    await pool.query(`
      UPDATE viajes_aprendizaje SET
        costo_diesel = $1::numeric, costo_cvm = $2::numeric, costo_total = $3::numeric,
        ingreso_tarifa = $4::numeric, margen_bruto = $5::numeric,
        tarifa_id = $6, tarifa_clase = $7,
        origen_contrato = $8, destino_contrato = $9,
        estado = CASE WHEN $4::numeric > 0 THEN 'FACTURADO' ELSE estado END
      WHERE id = $10
    `, [costoDiesel, costoCvm, costoTotal, ingresoTarifa, margenBruto, tarifaId, tarifaClase, origenC, destinoC, v.id]);

    procesados++;
  }

  return { procesados, conTarifa, sinTarifa };
}

export async function calcularPLResumenDiario(fecha: string) {
  const r = await pool.query(`
    SELECT 
      count(*)::int as total_viajes,
      count(*) FILTER(WHERE ingreso_tarifa > 0)::int as viajes_facturables,
      count(*) FILTER(WHERE ingreso_tarifa = 0 OR ingreso_tarifa IS NULL)::int as viajes_sin_tarifa,
      ROUND(SUM(km_ecu)::numeric)::int as km_total,
      ROUND(AVG(rendimiento_real) FILTER(WHERE rendimiento_real > 0 AND rendimiento_real < 10)::numeric, 2) as rend_promedio,
      ROUND(SUM(costo_diesel)::numeric)::int as costo_diesel_total,
      ROUND(SUM(costo_cvm)::numeric)::int as costo_cvm_total,
      ROUND(SUM(costo_total)::numeric)::int as costo_total,
      ROUND(SUM(ingreso_tarifa)::numeric)::int as ingreso_total,
      ROUND(SUM(margen_bruto)::numeric)::int as margen_total,
      CASE WHEN SUM(ingreso_tarifa) > 0 
        THEN ROUND((SUM(margen_bruto) / SUM(ingreso_tarifa) * 100)::numeric, 1)
        ELSE 0 END as margen_pct,
      count(DISTINCT camion_id)::int as camiones_activos
    FROM viajes_aprendizaje
    WHERE contrato = 'CENCOSUD' AND DATE(fecha_inicio) = $1 AND km_ecu > 0
  `, [fecha]);

  return r.rows[0];
}

export async function calcularPLResumenMes(anioMes: string) {
  const r = await pool.query(`
    SELECT 
      count(*)::int as total_viajes,
      count(*) FILTER(WHERE ingreso_tarifa > 0)::int as viajes_facturables,
      ROUND(SUM(km_ecu)::numeric)::int as km_total,
      ROUND(SUM(litros_consumidos_ecu)::numeric)::int as litros_total,
      ROUND(AVG(rendimiento_real) FILTER(WHERE rendimiento_real > 0 AND rendimiento_real < 10)::numeric, 2) as rend_promedio,
      ROUND(SUM(costo_diesel)::numeric)::int as costo_diesel_total,
      ROUND(SUM(costo_cvm)::numeric)::int as costo_cvm_total,
      ROUND(SUM(costo_total)::numeric)::int as costo_total,
      ROUND(SUM(ingreso_tarifa)::numeric)::int as ingreso_total,
      ROUND(SUM(margen_bruto)::numeric)::int as margen_total,
      CASE WHEN SUM(ingreso_tarifa) > 0 
        THEN ROUND((SUM(margen_bruto) / SUM(ingreso_tarifa) * 100)::numeric, 1)
        ELSE 0 END as margen_pct,
      count(DISTINCT camion_id)::int as camiones_activos
    FROM viajes_aprendizaje
    WHERE contrato = 'CENCOSUD' AND TO_CHAR(fecha_inicio, 'YYYY-MM') = $1 AND km_ecu > 0
  `, [anioMes]);

  return r.rows[0];
}
