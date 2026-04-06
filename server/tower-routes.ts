import { Router, type Request, type Response } from "express";
import { pool } from "./db";

const router = Router();

router.get("/combustible", async (_req: Request, res: Response) => {
  try {
    const fuelR = await pool.query(`
      WITH deltas AS (
        SELECT patente, fecha,
          kms_total, consumo_litros, nivel_estanque,
          kms_total - LAG(kms_total) OVER (PARTITION BY patente ORDER BY fecha) as delta_km,
          consumo_litros - LAG(consumo_litros) OVER (PARTITION BY patente ORDER BY fecha) as delta_litros,
          nivel_estanque - LAG(nivel_estanque) OVER (PARTITION BY patente ORDER BY fecha) as delta_tank
        FROM wisetrack_posiciones
        WHERE fecha >= NOW() - INTERVAL '7 days'
          AND kms_total > 0 AND consumo_litros > 0
      )
      SELECT patente,
        ROUND(SUM(GREATEST(delta_km, 0))::numeric) as km_total,
        ROUND(SUM(GREATEST(delta_litros, 0))::numeric, 1) as litros_total,
        ROUND(AVG(nivel_estanque)::numeric) as tank_promedio,
        MIN(nivel_estanque) as tank_min,
        MAX(nivel_estanque) as tank_max,
        COUNT(DISTINCT DATE(fecha)) as dias_datos,
        MAX(fecha) as ultima_posicion
      FROM deltas
      WHERE delta_km >= 0 AND delta_km < 500
        AND delta_litros >= 0 AND delta_litros < 200
      GROUP BY patente
      HAVING SUM(GREATEST(delta_km, 0)) > 10
      ORDER BY litros_total DESC
    `);

    const camiones = fuelR.rows.map((r: any) => {
      const km = parseFloat(r.km_total || "0");
      const litros = parseFloat(r.litros_total || "0");
      const rend = litros > 0 ? +(km / litros).toFixed(2) : 0;
      return {
        patente: r.patente,
        km_total: Math.round(km),
        litros_total: +parseFloat(r.litros_total || "0").toFixed(1),
        rendimiento: rend,
        tank_promedio: parseInt(r.tank_promedio || "0"),
        tank_min: parseInt(r.tank_min || "0"),
        tank_max: parseInt(r.tank_max || "0"),
        dias_datos: parseInt(r.dias_datos || "0"),
        ultima_posicion: r.ultima_posicion,
      };
    });

    const rendimientos = camiones.filter(c => c.rendimiento > 0).map(c => c.rendimiento).sort((a, b) => a - b);
    const p25 = rendimientos.length > 0 ? rendimientos[Math.floor(rendimientos.length * 0.25)] : 0;
    const p50 = rendimientos.length > 0 ? rendimientos[Math.floor(rendimientos.length * 0.5)] : 0;
    const p75 = rendimientos.length > 0 ? rendimientos[Math.floor(rendimientos.length * 0.75)] : 0;
    const p90 = rendimientos.length > 0 ? rendimientos[Math.floor(rendimientos.length * 0.9)] : 0;
    const avg = rendimientos.length > 0 ? +(rendimientos.reduce((a, b) => a + b, 0) / rendimientos.length).toFixed(2) : 0;

    const worst = camiones.filter(c => c.rendimiento > 0).sort((a, b) => a.rendimiento - b.rendimiento).slice(0, 5);
    const best = camiones.filter(c => c.rendimiento > 0).sort((a, b) => b.rendimiento - a.rendimiento).slice(0, 5);

    res.json({
      camiones: camiones.sort((a, b) => a.rendimiento - b.rendimiento),
      resumen: {
        total_camiones: camiones.length,
        rendimiento_promedio: avg,
        percentiles: { p25, p50, p75, p90 },
        km_total_flota: camiones.reduce((s, c) => s + c.km_total, 0),
        litros_total_flota: +camiones.reduce((s, c) => s + c.litros_total, 0).toFixed(1),
      },
      worst_5: worst,
      best_5: best,
      fuente: "wisetrack_posiciones",
      periodo: "7 dias",
    });
  } catch (e: any) {
    console.error("[TOWER] Error combustible:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get("/paradas", async (_req: Request, res: Response) => {
  try {
    const paradasR = await pool.query(`
      SELECT patente, etiqueta, fecha, lat, lng, velocidad,
        LAG(fecha) OVER (PARTITION BY patente ORDER BY fecha) as fecha_anterior,
        LAG(velocidad) OVER (PARTITION BY patente ORDER BY fecha) as vel_anterior
      FROM wisetrack_posiciones
      WHERE fecha >= NOW() - INTERVAL '48 hours'
        AND lat IS NOT NULL AND lng IS NOT NULL
      ORDER BY patente, fecha
    `);

    const paradas: any[] = [];
    let currentStop: any = null;

    for (const row of paradasR.rows) {
      const isStop = row.velocidad < 3;
      const wasMoving = row.vel_anterior && row.vel_anterior >= 3;

      if (isStop && (wasMoving || !currentStop || currentStop.patente !== row.patente)) {
        if (currentStop && currentStop.patente === row.patente && !wasMoving) {
          currentStop.fin = row.fecha;
          currentStop.duracion_min = Math.round((new Date(row.fecha).getTime() - new Date(currentStop.inicio).getTime()) / 60000);
          continue;
        }
        if (currentStop && currentStop.duracion_min >= 10) {
          paradas.push(currentStop);
        }
        currentStop = {
          patente: row.patente,
          etiqueta: row.etiqueta,
          lat: row.lat,
          lng: row.lng,
          inicio: row.fecha,
          fin: row.fecha,
          duracion_min: 0,
        };
      } else if (isStop && currentStop && currentStop.patente === row.patente) {
        currentStop.fin = row.fecha;
        currentStop.duracion_min = Math.round((new Date(row.fecha).getTime() - new Date(currentStop.inicio).getTime()) / 60000);
      } else if (!isStop) {
        if (currentStop && currentStop.duracion_min >= 10) {
          paradas.push(currentStop);
        }
        currentStop = null;
      }
    }
    if (currentStop && currentStop.duracion_min >= 10) {
      paradas.push(currentStop);
    }

    const significativas = paradas.filter(p => p.duracion_min >= 30);
    const largas = paradas.filter(p => p.duracion_min >= 120);

    const porCamion: Record<string, { patente: string; etiqueta: string; paradas: number; tiempo_total: number }> = {};
    for (const p of paradas) {
      if (!porCamion[p.patente]) {
        porCamion[p.patente] = { patente: p.patente, etiqueta: p.etiqueta, paradas: 0, tiempo_total: 0 };
      }
      porCamion[p.patente].paradas++;
      porCamion[p.patente].tiempo_total += p.duracion_min;
    }

    res.json({
      total_paradas: paradas.length,
      significativas: significativas.length,
      largas: largas.length,
      por_camion: Object.values(porCamion).sort((a, b) => b.tiempo_total - a.tiempo_total).slice(0, 20),
      ultimas_paradas: paradas.sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime()).slice(0, 30),
      periodo: "48 horas",
    });
  } catch (e: any) {
    console.error("[TOWER] Error paradas:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get("/resumen-flota", async (_req: Request, res: Response) => {
  try {
    const [statusR, viajesR, fuelR] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(DISTINCT patente) as total,
          COUNT(DISTINCT patente) FILTER (WHERE fecha >= NOW() - INTERVAL '30 minutes' AND velocidad > 3) as en_ruta,
          COUNT(DISTINCT patente) FILTER (WHERE fecha >= NOW() - INTERVAL '30 minutes' AND velocidad <= 3) as detenidos,
          COUNT(DISTINCT patente) FILTER (WHERE fecha < NOW() - INTERVAL '2 hours') as sin_senal
        FROM wisetrack_posiciones
        WHERE fecha >= NOW() - INTERVAL '24 hours'
      `),
      pool.query(`
        SELECT COUNT(*) as total,
          COUNT(*) FILTER (WHERE score_anomalia >= 20) as con_anomalia,
          ROUND(AVG(km_ecu::float) FILTER (WHERE km_ecu::float > 5)::numeric) as km_prom,
          ROUND(AVG(rendimiento_real::float) FILTER (WHERE rendimiento_real::float > 0.5)::numeric, 2) as rend_prom
        FROM viajes_aprendizaje
        WHERE fecha_inicio >= NOW() - INTERVAL '7 days'
      `),
      pool.query(`
        SELECT COUNT(DISTINCT patente) as bajo_estanque
        FROM wisetrack_posiciones
        WHERE fecha >= NOW() - INTERVAL '30 minutes' AND nivel_estanque > 0 AND nivel_estanque < 20
      `),
    ]);

    const s = statusR.rows[0] || {};
    const v = viajesR.rows[0] || {};
    res.json({
      flota: {
        total: parseInt(s.total || "0"),
        en_ruta: parseInt(s.en_ruta || "0"),
        detenidos: parseInt(s.detenidos || "0"),
        sin_senal: parseInt(s.sin_senal || "0"),
      },
      viajes_7d: {
        total: parseInt(v.total || "0"),
        con_anomalia: parseInt(v.con_anomalia || "0"),
        km_promedio: parseInt(v.km_prom || "0"),
        rendimiento_promedio: parseFloat(v.rend_prom || "0"),
      },
      alertas: {
        bajo_estanque: parseInt(fuelR.rows[0]?.bajo_estanque || "0"),
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export const towerRoutes = router;
