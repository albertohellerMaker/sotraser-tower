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
      `SELECT
         cp.nombre,
         c.patente,
         cp.contrato,
         gp.timestamp_punto as ultimo_punto,
         gp.lat, gp.lng,
         gp.velocidad_kmh as velocidad,
         COALESCE(vj.viajes_hoy, 0) as viajes_hoy,
         COALESCE(vj.paradas_completadas, 0) as paradas_completadas,
         COALESCE(vj.paradas_total, 0) as paradas_total
       FROM conductores_perfil cp
       LEFT JOIN camiones c ON c.conductor = cp.nombre
       LEFT JOIN LATERAL (
         SELECT lat, lng, timestamp_punto, velocidad_kmh
         FROM geo_puntos WHERE camion_id = c.id
         ORDER BY timestamp_punto DESC LIMIT 1
       ) gp ON true
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) as viajes_hoy,
           COALESCE(SUM(CASE WHEN vps.completadas IS NOT NULL THEN vps.completadas ELSE 0 END), 0) as paradas_completadas,
           COALESCE(SUM(CASE WHEN vps.total IS NOT NULL THEN vps.total ELSE 0 END), 0) as paradas_total
         FROM viajes v2
         LEFT JOIN LATERAL (
           SELECT
             COUNT(*) FILTER (WHERE vp2.estado = 'COMPLETADA') as completadas,
             COUNT(*) as total
           FROM viaje_paradas vp2 WHERE vp2.viaje_id = v2.id
         ) vps ON true
         WHERE v2.conductor = cp.nombre
           AND v2.fecha_salida::date = CURRENT_DATE
       ) vj ON true
       WHERE gp.timestamp_punto >= NOW() - INTERVAL '4 hours'
          OR vj.viajes_hoy > 0
       ORDER BY gp.timestamp_punto DESC NULLS LAST
       LIMIT 50`
    );
    return res.json({ conductores: result.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
