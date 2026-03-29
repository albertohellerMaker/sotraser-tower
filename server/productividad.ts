import { pool } from "./db";
import type { Express, Request, Response } from "express";
import { CONTRATOS_VOLVO_ACTIVOS } from "./faena-filter";

export async function procesarProductividadDiaria(): Promise<number> {
  try {
    const diasR = await pool.query(`
      SELECT DISTINCT c.patente, c.vin, va.contrato, DATE(va.fecha_inicio) as fecha
      FROM viajes_aprendizaje va
      JOIN camiones c ON va.camion_id = c.id
      WHERE c.vin IS NOT NULL AND c.vin != ''
        AND va.contrato = ANY($1)
        AND va.fecha_inicio >= '2026-03-01'
        AND DATE(va.fecha_inicio) < CURRENT_DATE
        AND va.km_ecu::float > 0
      EXCEPT
      SELECT patente, vin, contrato, fecha FROM productividad_diaria
    `, [CONTRATOS_VOLVO_ACTIVOS]);

    let procesados = 0;
    for (const d of diasR.rows) {
      try {
        const fechaStr = new Date(d.fecha).toISOString().slice(0, 10);

        const viajesR = await pool.query(`
          SELECT va.km_ecu::float as km, va.litros_consumidos_ecu::float as litros,
            va.rendimiento_real::float as rend, va.duracion_minutos::float as dur_min,
            va.conductor, va.velocidad_maxima::float as vel_max
          FROM viajes_aprendizaje va
          JOIN camiones c ON va.camion_id = c.id
          WHERE c.patente = $1 AND va.contrato = $2 AND DATE(va.fecha_inicio) = $3 AND va.km_ecu::float > 0
        `, [d.patente, d.contrato, fechaStr]);

        const kmDia = viajesR.rows.reduce((s: number, v: any) => s + (v.km || 0), 0);
        const litDia = viajesR.rows.reduce((s: number, v: any) => s + (v.litros || 0), 0);
        const rendDia = litDia > 0 ? Math.round(kmDia / litDia * 100) / 100 : null;
        const horasRuta = viajesR.rows.reduce((s: number, v: any) => s + ((v.dur_min || 0) / 60), 0);
        const velMax = Math.max(0, ...viajesR.rows.map((v: any) => v.vel_max || 0));
        const excesos = viajesR.rows.filter((v: any) => (v.vel_max || 0) > 105).length;
        const conductores = [...new Set(viajesR.rows.map((v: any) => v.conductor).filter(Boolean))];

        await pool.query(`
          INSERT INTO productividad_diaria (patente, vin, fecha, contrato, km_dia, litros_dia, rendimiento_dia,
            horas_ruta, horas_total, viajes_completados, velocidad_max, excesos_velocidad,
            estuvo_activo, conductores_json, snap_count)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          ON CONFLICT (patente, fecha, contrato) DO UPDATE SET
            km_dia=EXCLUDED.km_dia, litros_dia=EXCLUDED.litros_dia, rendimiento_dia=EXCLUDED.rendimiento_dia,
            horas_ruta=EXCLUDED.horas_ruta, viajes_completados=EXCLUDED.viajes_completados,
            velocidad_max=EXCLUDED.velocidad_max, excesos_velocidad=EXCLUDED.excesos_velocidad,
            estuvo_activo=EXCLUDED.estuvo_activo, conductores_json=EXCLUDED.conductores_json
        `, [d.patente, d.vin, fechaStr, d.contrato,
          Math.round(kmDia * 10) / 10, Math.round(litDia * 10) / 10, rendDia,
          Math.round(horasRuta * 10) / 10, Math.round(horasRuta * 10) / 10,
          viajesR.rows.length, Math.round(velMax), excesos,
          kmDia > 10, JSON.stringify(conductores), 0]);

        procesados++;
      } catch (e: any) { /* skip */ }
    }

    if (procesados > 0) console.log(`[PRODUCTIVIDAD] ${procesados} días procesados`);
    return procesados;
  } catch (e: any) {
    console.error("[PRODUCTIVIDAD] Error:", e.message);
    return 0;
  }
}

export function registerProductividadRoutes(app: Express) {

  app.get("/api/contratos/productividad/:contrato", async (req: Request, res: Response) => {
    try {
      const { contrato } = req.params;
      const hoy = new Date();
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      const diaActual = hoy.getDate();
      const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();

      const mesR = await pool.query(`
        SELECT pd.patente,
          COUNT(DISTINCT pd.fecha)::int as dias_activos,
          SUM(pd.km_dia) as km_mes, SUM(pd.litros_dia) as litros_mes,
          AVG(pd.rendimiento_dia) FILTER (WHERE pd.rendimiento_dia > 0) as rend_promedio,
          MAX(pd.rendimiento_dia) as rend_mejor_dia,
          MIN(pd.rendimiento_dia) FILTER (WHERE pd.rendimiento_dia > 0) as rend_peor_dia,
          SUM(pd.viajes_completados)::int as viajes_mes,
          SUM(pd.horas_ruta) as horas_ruta_mes,
          SUM(pd.excesos_velocidad)::int as excesos_mes,
          MAX(pd.velocidad_max) as vel_max_mes
        FROM productividad_diaria pd
        WHERE pd.contrato = $1 AND pd.fecha >= $2 AND pd.fecha < $3 AND pd.estuvo_activo = true
        GROUP BY pd.patente ORDER BY km_mes DESC
      `, [contrato, inicioMes, hoy]);

      // Ranking Anglo completo
      const rankR = await pool.query(`
        SELECT patente, AVG(rendimiento_dia) FILTER (WHERE rendimiento_dia > 0) as rend
        FROM productividad_diaria
        WHERE contrato = ANY($1) AND fecha >= $2 AND estuvo_activo = true
        GROUP BY patente ORDER BY rend DESC
      `, [CONTRATOS_VOLVO_ACTIVOS, inicioMes]);

      const rankMap: Record<string, number> = {};
      rankR.rows.forEach((r: any, i: number) => { rankMap[r.patente] = i + 1; });

      const camiones = mesR.rows.map((c: any) => ({
        ...c,
        km_mes: parseFloat(c.km_mes || 0), litros_mes: parseFloat(c.litros_mes || 0),
        rend_promedio: c.rend_promedio ? Math.round(parseFloat(c.rend_promedio) * 100) / 100 : null,
        rend_mejor_dia: c.rend_mejor_dia ? Math.round(parseFloat(c.rend_mejor_dia) * 100) / 100 : null,
        horas_ruta_mes: parseFloat(c.horas_ruta_mes || 0),
        ranking_anglo: rankMap[c.patente] || null, ranking_total: rankR.rows.length,
        pct_dias_activo: Math.round(parseInt(c.dias_activos) / diaActual * 100),
      }));

      const totalKm = camiones.reduce((s: number, c: any) => s + c.km_mes, 0);
      const rendFlota = camiones.filter((c: any) => c.rend_promedio).length > 0
        ? camiones.filter((c: any) => c.rend_promedio).reduce((s: number, c: any) => s + c.rend_promedio, 0) / camiones.filter((c: any) => c.rend_promedio).length : 0;

      // Hoy
      const hoyR = await pool.query(`
        SELECT patente, km_dia, litros_dia, rendimiento_dia, horas_ruta, horas_detenido,
          viajes_completados, velocidad_max, excesos_velocidad, estuvo_activo, conductores_json
        FROM productividad_diaria WHERE contrato = $1 AND fecha = $2 ORDER BY km_dia DESC
      `, [contrato, hoy.toISOString().slice(0, 10)]);

      // Histórico 30d
      const histR = await pool.query(`
        SELECT fecha, SUM(km_dia) as km_flota,
          AVG(rendimiento_dia) FILTER (WHERE rendimiento_dia > 0) as rend_flota,
          COUNT(*) FILTER (WHERE estuvo_activo) as camiones_activos
        FROM productividad_diaria WHERE contrato = $1 AND fecha >= NOW() - INTERVAL '30 days' AND fecha < CURRENT_DATE
        GROUP BY fecha ORDER BY fecha
      `, [contrato]);

      res.json({
        contrato,
        periodo: { inicio: inicioMes.toISOString().slice(0, 10), hoy: hoy.toISOString().slice(0, 10), dia_actual: diaActual, dias_mes: diasMes },
        kpis: { total_camiones: camiones.length, km_flota_mes: Math.round(totalKm), rend_flota: Math.round(rendFlota * 100) / 100, camiones_activos_hoy: hoyR.rows.filter((c: any) => c.estuvo_activo).length },
        camiones, hoy: hoyR.rows, historico: histR.rows, ranking_completo_anglo: rankR.rows.length,
      });
    } catch (error: any) {
      console.error("[productividad] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/contratos/detalle-camion/:patente", async (req: Request, res: Response) => {
    try {
      const { patente } = req.params;
      const contrato = req.query.contrato as string;
      const histR = await pool.query(`
        SELECT fecha, km_dia, litros_dia, rendimiento_dia, horas_ruta, horas_detenido,
          viajes_completados, velocidad_max, excesos_velocidad, estuvo_activo, conductores_json
        FROM productividad_diaria WHERE patente = $1 AND contrato = $2 AND fecha >= NOW() - INTERVAL '30 days'
        ORDER BY fecha DESC
      `, [patente, contrato]);
      res.json({ patente, contrato, historico_diario: histR.rows });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}
