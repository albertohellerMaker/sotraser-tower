import { Router, Request, Response } from "express";
import { pool } from "./db";
import crypto from "crypto";

const router = Router();

const CONDUCTOR_API_KEY = process.env.CONDUCTOR_API_KEY || crypto.randomBytes(24).toString("hex");

function authConductor(req: Request, res: Response, next: Function) {
  const key = req.headers["x-api-key"] || req.query.apiKey;
  if (key !== CONDUCTOR_API_KEY) {
    return res.status(401).json({ error: "API key inválida" });
  }
  next();
}

router.use(authConductor);

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { rut, patente } = req.body;
    if (!rut && !patente) {
      return res.status(400).json({ error: "Se requiere rut o patente" });
    }

    let conductor = null;
    if (rut) {
      const result = await pool.query(
        `SELECT cp.id, cp.nombre, cp.contrato, cp.score_comportamiento,
                c.id as camion_id, c.patente
         FROM conductores_perfil cp
         LEFT JOIN camiones c ON c.conductor = cp.nombre
         WHERE cp.nombre ILIKE $1
         LIMIT 1`,
        [`%${rut}%`]
      );
      conductor = result.rows[0];
    }
    if (!conductor && patente) {
      const result = await pool.query(
        `SELECT cp.id, cp.nombre, cp.contrato, cp.score_comportamiento,
                c.id as camion_id, c.patente
         FROM camiones c
         LEFT JOIN conductores_perfil cp ON cp.nombre = c.conductor
         WHERE c.patente = $1
         LIMIT 1`,
        [patente.toUpperCase()]
      );
      conductor = result.rows[0];
    }

    if (!conductor) {
      return res.status(404).json({ error: "Conductor no encontrado" });
    }

    return res.json({ ok: true, conductor });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/viajes/:conductorNombre", async (req: Request, res: Response) => {
  try {
    const { conductorNombre } = req.params;
    const fecha = (req.query.fecha as string) || new Date().toISOString().slice(0, 10);

    const result = await pool.query(
      `SELECT v.id, v.codigo, v.camion_id, v.conductor, v.cliente,
              v.origen_nombre, v.origen_lat, v.origen_lng,
              v.fecha_salida, v.fecha_llegada_estimada, v.estado,
              v.km_inicio, v.carga_descripcion,
              (SELECT json_agg(vp ORDER BY vp.orden)
               FROM viaje_paradas vp WHERE vp.viaje_id = v.id) as paradas
       FROM viajes v
       WHERE v.conductor ILIKE $1
         AND v.fecha_salida::date = $2::date
       ORDER BY v.fecha_salida DESC`,
      [`%${conductorNombre}%`, fecha]
    );

    return res.json({ viajes: result.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/viaje/:viajeId/paradas", async (req: Request, res: Response) => {
  try {
    const { viajeId } = req.params;

    const result = await pool.query(
      `SELECT vp.*, v.conductor, v.cliente, v.origen_nombre
       FROM viaje_paradas vp
       JOIN viajes v ON vp.viaje_id = v.id
       WHERE vp.viaje_id = $1
       ORDER BY vp.orden`,
      [viajeId]
    );

    return res.json({ paradas: result.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/parada/:paradaId", async (req: Request, res: Response) => {
  try {
    const { paradaId } = req.params;
    const { estado, notas } = req.body;

    const validEstados = ["PENDIENTE", "EN_CAMINO", "COMPLETADA", "SALTADA"];
    if (estado && !validEstados.includes(estado)) {
      return res.status(400).json({ error: `Estado inválido. Usar: ${validEstados.join(", ")}` });
    }

    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    if (estado) {
      sets.push(`estado = $${idx++}`);
      vals.push(estado);
      if (estado === "COMPLETADA") {
        sets.push(`hora_real = NOW()`);
      }
    }
    if (notas !== undefined) {
      sets.push(`notas = $${idx++}`);
      vals.push(notas);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: "Nada que actualizar" });
    }

    vals.push(paradaId);
    const result = await pool.query(
      `UPDATE viaje_paradas SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      vals
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Parada no encontrada" });
    }

    return res.json({ ok: true, parada: result.rows[0] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/ubicacion", async (req: Request, res: Response) => {
  try {
    const { camionId, lat, lng, velocidad, rumbo } = req.body;
    if (!camionId || lat == null || lng == null) {
      return res.status(400).json({ error: "camionId, lat, lng requeridos" });
    }

    await pool.query(
      `INSERT INTO geo_puntos (camion_id, lat, lng, timestamp_punto, velocidad_kmh, rumbo_grados)
       VALUES ($1, $2, $3, NOW(), $4, $5)`,
      [camionId, lat, lng, velocidad || 0, rumbo || 0]
    );

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/novedad", async (req: Request, res: Response) => {
  try {
    const { viajeId, conductorNombre, tipo, descripcion, lat, lng } = req.body;
    if (!conductorNombre || !tipo || !descripcion) {
      return res.status(400).json({ error: "conductorNombre, tipo, descripcion requeridos" });
    }

    const validTipos = ["MECANICA", "ACCIDENTE", "RETRASO", "CARGA", "OTRO"];
    if (!validTipos.includes(tipo)) {
      return res.status(400).json({ error: `Tipo inválido. Usar: ${validTipos.join(", ")}` });
    }

    await pool.query(
      `INSERT INTO novedades_conductor (viaje_id, conductor, tipo, descripcion, lat, lng, creado_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [viajeId || null, conductorNombre, tipo, descripcion, lat || null, lng || null]
    );

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/camion/:patente/info", async (req: Request, res: Response) => {
  try {
    const patente = String(req.params.patente);

    const result = await pool.query(
      `SELECT c.id, c.patente, c.modelo, c.anio_fabricacion, c.odometro,
              c.conductor, c.tipo_vehiculo, c.capacidad_estanque_litros,
              cp.score_comportamiento, cp.rendimiento_promedio, cp.contrato
       FROM camiones c
       LEFT JOIN conductores_perfil cp ON cp.nombre = c.conductor
       WHERE c.patente = $1`,
      [patente.toUpperCase()]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Camión no encontrado" });
    }

    return res.json({ camion: result.rows[0] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

if (!CONDUCTOR_API_KEY.includes("CONDUCTOR_API_KEY")) {
  console.log(`[CONDUCTOR-API] Endpoints activos en /api/conductor/*`);
}

export default router;
