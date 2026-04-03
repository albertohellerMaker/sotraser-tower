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

router.get("/conductores", async (req: Request, res: Response) => {
  try {
    const search = (req.query.q as string) || "";
    const contrato = (req.query.contrato as string) || "";
    let query = `SELECT cp.id, cp.nombre, cp.contrato, cp.score_comportamiento,
                        cp.rendimiento_promedio, cp.total_jornadas, cp.ultima_jornada,
                        cp.tendencia, cp.km_total
                 FROM conductores_perfil cp WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;
    if (search) {
      query += ` AND cp.nombre ILIKE $${idx++}`;
      params.push(`%${search}%`);
    }
    if (contrato) {
      query += ` AND cp.contrato = $${idx++}`;
      params.push(contrato);
    }
    query += ` ORDER BY cp.nombre LIMIT 100`;
    const result = await pool.query(query, params);
    return res.json({ conductores: result.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/camiones-disponibles", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.patente, c.modelo, c.tipo_vehiculo
       FROM camiones c
       WHERE c.id NOT IN (
         SELECT camion_id FROM viajes WHERE estado IN ('EN_RUTA', 'PROGRAMADO') AND camion_id IS NOT NULL
       )
       ORDER BY c.patente
       LIMIT 200`
    );
    return res.json({ camiones: result.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/viaje", async (req: Request, res: Response) => {
  try {
    const { conductor, camionId, cliente, origenNombre, origenLat, origenLng,
            fechaSalida, fechaLlegadaEstimada, cargaDescripcion, notas, paradas } = req.body;

    if (!conductor || !camionId || !origenNombre) {
      return res.status(400).json({ error: "conductor, camionId y origenNombre son requeridos" });
    }

    const codigo = `V-${Date.now().toString(36).toUpperCase()}`;
    const patente = await pool.query(`SELECT patente FROM camiones WHERE id = $1`, [camionId]);

    const viajeResult = await pool.query(
      `INSERT INTO viajes (codigo, camion_id, conductor, cliente, origen_nombre, origen_lat, origen_lng,
                           fecha_salida, fecha_llegada_estimada, estado, carga_descripcion, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PROGRAMADO', $10, $11)
       RETURNING *`,
      [codigo, camionId, conductor, cliente || null,
       origenNombre, origenLat || null, origenLng || null,
       fechaSalida || new Date(), fechaLlegadaEstimada || null,
       cargaDescripcion || null, notas || null]
    );

    const viaje = viajeResult.rows[0];

    if (paradas && Array.isArray(paradas) && paradas.length > 0) {
      for (let i = 0; i < paradas.length; i++) {
        const p = paradas[i];
        await pool.query(
          `INSERT INTO viaje_paradas (viaje_id, orden, nombre, direccion, lat, lng, tipo, estado, hora_estimada)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDIENTE', $8)`,
          [viaje.id, i + 1, p.nombre, p.direccion || null,
           p.lat || null, p.lng || null, p.tipo || 'ENTREGA', p.horaEstimada || null]
        );
      }
    }

    return res.json({ ok: true, viaje });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/viaje/:id/estado", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    const validEstados = ["PROGRAMADO", "EN_RUTA", "COMPLETADO", "CANCELADO"];
    if (!validEstados.includes(estado)) {
      return res.status(400).json({ error: `Estado inválido. Usar: ${validEstados.join(", ")}` });
    }

    const sets = [`estado = $1`];
    const params: any[] = [estado];
    if (estado === "EN_RUTA") {
      sets.push(`fecha_salida = COALESCE(fecha_salida, NOW())`);
    }
    if (estado === "COMPLETADO" || estado === "CANCELADO") {
      sets.push(`fecha_cierre = NOW()`);
    }

    params.push(id);
    const result = await pool.query(
      `UPDATE viajes SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Viaje no encontrado" });
    }
    return res.json({ ok: true, viaje: result.rows[0] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/viajes-vivo", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT v.id, v.codigo, v.camion_id, v.conductor, v.cliente,
              v.origen_nombre, v.origen_lat, v.origen_lng,
              v.fecha_salida, v.fecha_llegada_estimada, v.estado,
              v.km_inicio, v.carga_descripcion, v.created_at,
              c.patente, c.modelo,
              (SELECT json_agg(json_build_object(
                'id', vp.id, 'orden', vp.orden, 'nombre', vp.nombre,
                'lat', vp.lat, 'lng', vp.lng, 'tipo', vp.tipo,
                'estado', vp.estado, 'hora_estimada', vp.hora_estimada,
                'hora_real', vp.hora_real, 'notas', vp.notas
              ) ORDER BY vp.orden)
              FROM viaje_paradas vp WHERE vp.viaje_id = v.id) as paradas
       FROM viajes v
       LEFT JOIN camiones c ON v.camion_id = c.id
       WHERE v.estado IN ('PROGRAMADO', 'EN_RUTA')
       ORDER BY
         CASE v.estado WHEN 'EN_RUTA' THEN 0 WHEN 'PROGRAMADO' THEN 1 END,
         v.fecha_salida ASC`
    );

    const viajesConGps = [];
    for (const v of result.rows) {
      let gps = null;
      if (v.camion_id) {
        const gpsResult = await pool.query(
          `SELECT lat, lng, velocidad_kmh, rumbo_grados, timestamp_punto
           FROM geo_puntos WHERE camion_id = $1
           ORDER BY timestamp_punto DESC LIMIT 1`,
          [v.camion_id]
        );
        if (gpsResult.rows.length > 0) {
          gps = gpsResult.rows[0];
        }
      }
      viajesConGps.push({ ...v, gps });
    }

    return res.json({ viajes: viajesConGps });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/viaje/:id/tracking", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const viajeResult = await pool.query(
      `SELECT v.*, c.patente, c.modelo
       FROM viajes v
       LEFT JOIN camiones c ON v.camion_id = c.id
       WHERE v.id = $1`,
      [id]
    );
    if (viajeResult.rowCount === 0) {
      return res.status(404).json({ error: "Viaje no encontrado" });
    }
    const viaje = viajeResult.rows[0];

    const paradasResult = await pool.query(
      `SELECT * FROM viaje_paradas WHERE viaje_id = $1 ORDER BY orden`,
      [id]
    );

    let trayectoria: any[] = [];
    if (viaje.camion_id && viaje.fecha_salida) {
      const trayResult = await pool.query(
        `SELECT lat, lng, velocidad_kmh, rumbo_grados, timestamp_punto
         FROM geo_puntos
         WHERE camion_id = $1 AND timestamp_punto >= $2
         ORDER BY timestamp_punto ASC
         LIMIT 2000`,
        [viaje.camion_id, viaje.fecha_salida]
      );
      trayectoria = trayResult.rows;
    }

    const novedadesResult = await pool.query(
      `SELECT * FROM novedades_conductor
       WHERE viaje_id = $1 ORDER BY creado_at DESC`,
      [id]
    );

    return res.json({
      viaje,
      paradas: paradasResult.rows,
      trayectoria,
      novedades: novedadesResult.rows,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/viajes-historial", async (req: Request, res: Response) => {
  try {
    const fecha = (req.query.fecha as string) || new Date().toISOString().slice(0, 10);
    const result = await pool.query(
      `SELECT v.id, v.codigo, v.conductor, v.cliente, v.origen_nombre,
              v.estado, v.fecha_salida, v.fecha_cierre,
              c.patente,
              (SELECT COUNT(*) FROM viaje_paradas vp WHERE vp.viaje_id = v.id) as total_paradas,
              (SELECT COUNT(*) FROM viaje_paradas vp WHERE vp.viaje_id = v.id AND vp.estado = 'COMPLETADA') as paradas_ok
       FROM viajes v
       LEFT JOIN camiones c ON v.camion_id = c.id
       WHERE v.fecha_salida::date = $1::date
       ORDER BY v.fecha_salida DESC`,
      [fecha]
    );
    return res.json({ viajes: result.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
