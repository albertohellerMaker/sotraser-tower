import { Router, Request, Response } from "express";
import { pool } from "./db";

const router = Router();

router.get("/novedades", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM novedades_conductor
       ORDER BY resuelta ASC, creado_at DESC
       LIMIT 50`
    );
    return res.json({ novedades: result.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/novedad/:id/resolver", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE novedades_conductor SET resuelta = true WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Novedad no encontrada" });
    }
    return res.json({ ok: true, novedad: result.rows[0] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/paradas-recientes", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT vp.id, vp.viaje_id, vp.nombre, vp.estado, vp.hora_real,
              v.conductor, c.patente, v.cliente
       FROM viaje_paradas vp
       JOIN viajes v ON vp.viaje_id = v.id
       LEFT JOIN camiones c ON v.camion_id = c.id
       WHERE vp.hora_real >= NOW() - INTERVAL '24 hours'
          OR (vp.estado != 'PENDIENTE' AND vp.created_at >= NOW() - INTERVAL '24 hours')
       ORDER BY COALESCE(vp.hora_real, vp.created_at) DESC
       LIMIT 30`
    );
    return res.json({ paradas: result.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/activos", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `WITH conductor_camion AS (
         SELECT cp.nombre, c.id as camion_id, c.patente, cp.contrato
         FROM conductores_perfil cp
         LEFT JOIN camiones c ON c.conductor = cp.nombre
         WHERE c.id IS NOT NULL
       ),
       ultimo_gps AS (
         SELECT DISTINCT ON (camion_id)
           camion_id, lat, lng, timestamp_punto, velocidad_kmh
         FROM geo_puntos
         WHERE timestamp_punto >= NOW() - INTERVAL '4 hours'
         ORDER BY camion_id, timestamp_punto DESC
       ),
       viajes_hoy AS (
         SELECT conductor, COUNT(*) as viajes_hoy
         FROM viajes
         WHERE fecha_salida::date = CURRENT_DATE
         GROUP BY conductor
       )
       SELECT cc.nombre, cc.patente, cc.contrato,
              ug.timestamp_punto as ultimo_punto, ug.lat, ug.lng,
              ug.velocidad_kmh as velocidad,
              COALESCE(vh.viajes_hoy, 0) as viajes_hoy,
              0 as paradas_completadas, 0 as paradas_total
       FROM conductor_camion cc
       LEFT JOIN ultimo_gps ug ON ug.camion_id = cc.camion_id
       LEFT JOIN viajes_hoy vh ON vh.conductor = cc.nombre
       WHERE ug.timestamp_punto IS NOT NULL OR vh.viajes_hoy > 0
       ORDER BY ug.timestamp_punto DESC NULLS LAST
       LIMIT 50`
    );
    return res.json({ conductores: result.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
