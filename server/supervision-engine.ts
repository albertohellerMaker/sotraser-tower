import type { Express, Request, Response } from "express";
import { pool } from "./db";
import { CONTRATOS_VOLVO_ACTIVOS } from "./faena-filter";

/**
 * Nivel de confianza basado en semanas de historial:
 *   >= 8 semanas → ALTA
 *   4-7 semanas  → MEDIA
 *   2-3 semanas  → BAJA
 *   < 2 semanas  → NO_PREDECIR
 */
function calcularConfianza(semanas: number): string {
  if (semanas >= 8) return "ALTA";
  if (semanas >= 4) return "MEDIA";
  if (semanas >= 2) return "BAJA";
  return "NO_PREDECIR";
}

/**
 * Calcular expectativas diarias para cada camión.
 * Usa cargas Sigetra como fuente primaria (cobertura 100%).
 *
 * VALIDACIÓN 1: No predecir con menos de 2 semanas de historial.
 * VALIDACIÓN 3: Guardar nivel de confianza por predicción.
 */
export async function calcularExpectativasDiarias() {
  try {
    const hoy = new Date().toISOString().split("T")[0];
    const diaSemana = new Date().getDay();

    const camiones = await pool.query(`
      SELECT DISTINCT c.patente, c.vin, car.faena as contrato
      FROM camiones c
      JOIN cargas car ON car.patente = c.patente
      WHERE c.vin IS NOT NULL AND c.vin != ''
        AND car.faena = ANY($1)
        AND car.fecha::text >= (NOW() - INTERVAL '30 days')::date::text
    `, [CONTRATOS_VOLVO_ACTIVOS]);

    let procesados = 0;
    let omitidosBajaConfianza = 0;

    for (const cam of camiones.rows) {
      const hist = await pool.query(`
        SELECT
          COUNT(DISTINCT DATE(fecha::timestamp)) as semanas_total,
          COUNT(DISTINCT DATE(fecha::timestamp)) FILTER (
            WHERE km_actual IS NOT NULL AND km_anterior IS NOT NULL
              AND (km_actual::float - km_anterior::float) > 10
          ) as semanas_activo,
          AVG(CASE WHEN km_actual > km_anterior AND (km_actual::float - km_anterior::float) < 3000
            THEN km_actual::float - km_anterior::float END) as km_promedio,
          AVG(rend_real::float) FILTER (WHERE rend_real::float > 0.5 AND rend_real::float < 8) as rend_promedio
        FROM cargas
        WHERE patente = $1
          AND EXTRACT(DOW FROM fecha::timestamp) = $2
          AND fecha::text >= (NOW() - INTERVAL '60 days')::date::text
      `, [cam.patente, diaSemana]);

      const h = hist.rows[0];
      const semanasTotal = parseInt(h?.semanas_total || "0");

      // VALIDACIÓN 1+3: Calcular confianza, omitir si NO_PREDECIR
      const confianza = calcularConfianza(semanasTotal);
      if (confianza === "NO_PREDECIR") {
        omitidosBajaConfianza++;
        continue;
      }

      const semanasActivo = parseInt(h.semanas_activo || "0");
      const probActivo = semanasActivo / Math.max(1, semanasTotal);

      const probCarga = await pool.query(`
        SELECT COUNT(*)::float / GREATEST(1, $3::float) as prob
        FROM cargas WHERE patente = $1
          AND EXTRACT(DOW FROM fecha::timestamp) = $2
          AND fecha::text >= (NOW() - INTERVAL '60 days')::date::text
      `, [cam.patente, diaSemana, semanasTotal]);

      const corredor = await pool.query(`
        SELECT lugar_consumo as corredor, COUNT(*) as veces
        FROM cargas WHERE patente = $1
          AND EXTRACT(DOW FROM fecha::timestamp) = $2
          AND fecha::text >= (NOW() - INTERVAL '60 days')::date::text
          AND lugar_consumo IS NOT NULL
        GROUP BY lugar_consumo ORDER BY veces DESC LIMIT 1
      `, [cam.patente, diaSemana]);

      await pool.query(`
        INSERT INTO estado_camion_esperado (
          patente, vin, contrato, fecha,
          debe_estar_activo, km_esperado_dia, rendimiento_esperado,
          probabilidad_carga, corredor_probable,
          confianza_prediccion, semanas_historial
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (patente, fecha) DO UPDATE SET
          debe_estar_activo = EXCLUDED.debe_estar_activo,
          km_esperado_dia = EXCLUDED.km_esperado_dia,
          rendimiento_esperado = EXCLUDED.rendimiento_esperado,
          probabilidad_carga = EXCLUDED.probabilidad_carga,
          corredor_probable = EXCLUDED.corredor_probable,
          confianza_prediccion = EXCLUDED.confianza_prediccion,
          semanas_historial = EXCLUDED.semanas_historial
      `, [
        cam.patente, cam.vin, cam.contrato, hoy,
        probActivo >= 0.5,
        parseFloat(h.km_promedio || "0"),
        parseFloat(h.rend_promedio || "0"),
        parseFloat(probCarga.rows[0]?.prob || "0"),
        corredor.rows[0]?.corredor || null,
        confianza,
        semanasTotal,
      ]);
      procesados++;
    }

    console.log(`[SUPERVISION] Expectativas: ${procesados} calculadas, ${omitidosBajaConfianza} omitidas (< 2 semanas historial)`);
    return procesados;
  } catch (err: any) {
    console.error("[SUPERVISION] Error expectativas:", err.message);
    return 0;
  }
}

/**
 * Comparar datos reales vs esperados.
 *
 * VALIDACIÓN 1: No generar alerta INACTIVO_INESPERADO con < 4 semanas historial.
 * VALIDACIÓN 2: No marcar INACTIVO_INESPERADO antes de las 14:00 hrs.
 * VALIDACIÓN 3: Estado se calcula considerando confianza.
 */
export async function compararRealVsEsperado() {
  try {
    const hoy = new Date().toISOString().split("T")[0];
    const horaActual = new Date().getHours();

    const reales = await pool.query(`
      SELECT patente,
        COUNT(*) as cargas_hoy,
        SUM(CASE WHEN km_actual > km_anterior AND (km_actual::float - km_anterior::float) < 3000
          THEN km_actual::float - km_anterior::float ELSE 0 END) as km_hoy,
        AVG(rend_real::float) FILTER (WHERE rend_real::float > 0.5 AND rend_real::float < 8) as rend_hoy
      FROM cargas
      WHERE DATE(fecha::timestamp) = $1::date
      GROUP BY patente
    `, [hoy]);

    const realesMap = new Map<string, any>();
    reales.rows.forEach((r: any) => realesMap.set(r.patente, r));

    const expectativas = await pool.query(`
      SELECT * FROM estado_camion_esperado
      WHERE fecha = $1 AND procesado = false
    `, [hoy]);

    let actualizados = 0;
    for (const exp of expectativas.rows) {
      const real = realesMap.get(exp.patente);
      const kmReal = real ? parseFloat(real.km_hoy || "0") : 0;
      const rendReal = real ? parseFloat(real.rend_hoy || "0") : 0;
      const estuvoActivo = kmReal > 10 || (real?.cargas_hoy || 0) > 0;
      const tuvoCarga = (real?.cargas_hoy || 0) > 0;

      const desvKm = exp.km_esperado_dia > 0
        ? ((kmReal - exp.km_esperado_dia) / exp.km_esperado_dia) * 100 : null;
      const desvRend = exp.rendimiento_esperado > 0 && rendReal > 0
        ? ((rendReal - exp.rendimiento_esperado) / exp.rendimiento_esperado) * 100 : null;

      const confianza = exp.confianza_prediccion || "BAJA";
      const semanas = exp.semanas_historial || 0;

      // Determinar estado con validaciones
      let estado = "SIN_DATOS";

      if (exp.debe_estar_activo && !estuvoActivo) {
        // VALIDACIÓN 1: No alertar inactividad con < 4 semanas
        // VALIDACIÓN 2: No alertar antes de las 14:00
        if (semanas >= 4 && horaActual >= 14) {
          estado = "INACTIVO_INESPERADO";
        } else if (horaActual < 14) {
          estado = "PENDIENTE"; // Aún es temprano, esperar
        } else {
          estado = "SIN_DATOS"; // Poca confianza, no alertar
        }
      } else if (!exp.debe_estar_activo && estuvoActivo && kmReal > 100) {
        estado = "ACTIVO_INESPERADO";
      } else if (desvRend !== null && desvRend < -20 && rendReal > 0) {
        estado = "RENDIMIENTO_BAJO";
      } else if (desvRend !== null && desvRend > 20) {
        estado = "RENDIMIENTO_ALTO";
      } else if (estuvoActivo) {
        estado = "NORMAL";
      }

      const marcarProcesado = estuvoActivo || horaActual >= 20;

      await pool.query(`
        UPDATE estado_camion_esperado SET
          km_real = $1, rendimiento_real = $2,
          estuvo_activo = $3, tuvo_carga = $4,
          desviacion_km_pct = $5, desviacion_rend_pct = $6,
          estado_supervision = $7, procesado = $8
        WHERE patente = $9 AND fecha = $10
      `, [kmReal, rendReal, estuvoActivo, tuvoCarga, desvKm, desvRend, estado, marcarProcesado, exp.patente, hoy]);
      actualizados++;
    }

    console.log(`[SUPERVISION] ${actualizados} camiones comparados (hora: ${horaActual})`);
    return actualizados;
  } catch (err: any) {
    console.error("[SUPERVISION] Error comparacion:", err.message);
    return 0;
  }
}

/**
 * Register supervision routes
 */
export function registerSupervisionRoutes(app: Express) {
  app.get("/api/supervision/estado-hoy", async (_req: Request, res: Response) => {
    try {
      const hoy = new Date().toISOString().split("T")[0];

      const supervision = await pool.query(`
        SELECT patente, contrato, vin,
          debe_estar_activo, km_esperado_dia, rendimiento_esperado, corredor_probable, probabilidad_carga,
          km_real, rendimiento_real, estuvo_activo, tuvo_carga,
          desviacion_km_pct, desviacion_rend_pct, estado_supervision, procesado,
          confianza_prediccion, semanas_historial
        FROM estado_camion_esperado
        WHERE fecha = $1 AND contrato = ANY($2)
        ORDER BY
          CASE
            WHEN estado_supervision = 'INACTIVO_INESPERADO' THEN 1
            WHEN estado_supervision = 'RENDIMIENTO_BAJO' THEN 2
            WHEN estado_supervision = 'ACTIVO_INESPERADO' THEN 3
            WHEN estado_supervision = 'PENDIENTE' THEN 4
            WHEN estado_supervision = 'NORMAL' THEN 5
            ELSE 6
          END
      `, [hoy, CONTRATOS_VOLVO_ACTIVOS]);

      const rows = supervision.rows;
      const resumen = {
        total: rows.length,
        inactivos_inesperados: rows.filter((c: any) => c.estado_supervision === "INACTIVO_INESPERADO").length,
        rendimiento_bajo: rows.filter((c: any) => c.estado_supervision === "RENDIMIENTO_BAJO").length,
        activos_inesperados: rows.filter((c: any) => c.estado_supervision === "ACTIVO_INESPERADO").length,
        normales: rows.filter((c: any) => c.estado_supervision === "NORMAL").length,
        pendientes: rows.filter((c: any) => c.estado_supervision === "PENDIENTE").length,
        sin_datos: rows.filter((c: any) => !c.estado_supervision || c.estado_supervision === "SIN_DATOS").length,
        procesados: rows.filter((c: any) => c.procesado).length,
        confianza_alta: rows.filter((c: any) => c.confianza_prediccion === "ALTA").length,
        confianza_media: rows.filter((c: any) => c.confianza_prediccion === "MEDIA").length,
        confianza_baja: rows.filter((c: any) => c.confianza_prediccion === "BAJA").length,
      };

      res.json({ fecha: hoy, resumen, camiones: rows });
    } catch (err: any) {
      console.error("[SUPERVISION] Error estado-hoy:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/supervision/ejecutar", async (_req: Request, res: Response) => {
    try {
      const expectativas = await calcularExpectativasDiarias();
      const comparaciones = await compararRealVsEsperado();
      res.json({ ok: true, expectativas, comparaciones });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  console.log("[SUPERVISION] Supervision routes registered");
}
