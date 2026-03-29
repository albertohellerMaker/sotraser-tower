import { db, pool } from "./db";
import { corredoresOperacionales, viajesCorredor } from "@shared/schema";
import { eq, and, sql, desc, asc, gt, isNotNull } from "drizzle-orm";
import type { Express, Request, Response } from "express";

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/* ── Match score 0-100 ── */
export function calcularMatchRuta(
  viaje: { origenLat: number; origenLng: number; destinoLat: number; destinoLng: number; kmEcu: number; contrato: string },
  corredor: { origenLat: number; origenLng: number; origenRadioKm: number; destinoLat: number; destinoLng: number; destinoRadioKm: number; distanciaPromedio: number; distanciaTolerancia: number; contrato: string }
): number {
  if (viaje.contrato !== corredor.contrato) return 0;

  const distOrigen = haversineKm(viaje.origenLat, viaje.origenLng, corredor.origenLat, corredor.origenLng);
  if (distOrigen > corredor.origenRadioKm) return 0;

  const distDestino = haversineKm(viaje.destinoLat, viaje.destinoLng, corredor.destinoLat, corredor.destinoLng);
  if (distDestino > corredor.destinoRadioKm) return 0;

  if (corredor.distanciaPromedio > 0) {
    const diffPct = Math.abs(viaje.kmEcu - corredor.distanciaPromedio) / corredor.distanciaPromedio * 100;
    if (diffPct > corredor.distanciaTolerancia) return 0;
    return Math.max(0, 100 - (diffPct / corredor.distanciaTolerancia * 30));
  }

  return 90;
}

/* ── Asignar viaje a corredor (o crear uno nuevo) ── */
export async function asignarCorredorOperacional(viaje: {
  origenLat: number | null; origenLng: number | null;
  destinoLat: number | null; destinoLng: number | null;
  origenNombre: string | null; destinoNombre: string | null;
  kmEcu: number | null; contrato: string | null;
}): Promise<number | null> {
  if (!viaje.origenLat || !viaje.destinoLat || !viaje.contrato) return null;
  if (!viaje.kmEcu || viaje.kmEcu < 20) return null;

  const corredores = await db.select().from(corredoresOperacionales)
    .where(and(eq(corredoresOperacionales.contrato, viaje.contrato), eq(corredoresOperacionales.activo, true)));

  let mejorMatch = 0;
  let mejorCorredor: number | null = null;

  for (const c of corredores) {
    if (!c.origenLat || !c.destinoLat) continue;
    const score = calcularMatchRuta(
      { origenLat: viaje.origenLat, origenLng: viaje.origenLng!, destinoLat: viaje.destinoLat, destinoLng: viaje.destinoLng!, kmEcu: viaje.kmEcu, contrato: viaje.contrato },
      { origenLat: c.origenLat, origenLng: c.origenLng!, origenRadioKm: c.origenRadioKm || 5, destinoLat: c.destinoLat, destinoLng: c.destinoLng!, destinoRadioKm: c.destinoRadioKm || 30, distanciaPromedio: c.distanciaPromedioKm || 0, distanciaTolerancia: c.distanciaTolerancia || 15, contrato: c.contrato }
    );
    if (score > mejorMatch && score >= 70) {
      mejorMatch = score;
      mejorCorredor = c.id;
    }
  }

  // Crear nuevo corredor si no hay match y tenemos nombres
  if (!mejorCorredor && viaje.origenNombre && viaje.origenNombre !== "Punto desconocido") {
    const [nuevo] = await db.insert(corredoresOperacionales).values({
      nombre: `${viaje.origenNombre} → ${viaje.destinoNombre || "?"}`,
      contrato: viaje.contrato,
      origenNombre: viaje.origenNombre,
      origenLat: viaje.origenLat,
      origenLng: viaje.origenLng!,
      origenRadioKm: 5,
      destinoNombre: viaje.destinoNombre,
      destinoLat: viaje.destinoLat,
      destinoLng: viaje.destinoLng!,
      destinoRadioKm: 30,
      distanciaPromedioKm: viaje.kmEcu,
      distanciaTolerancia: 15,
      totalViajes: 0,
      creadoManual: false,
    }).returning();
    mejorCorredor = nuevo.id;
  }

  return mejorCorredor;
}

/* ── Actualizar estadísticas incrementales ── */
export async function actualizarEstadisticasCorredor(
  corredorId: number,
  nuevoViaje: { kmEcu: number; rendimiento: number; patente: string }
) {
  const [c] = await db.select().from(corredoresOperacionales).where(eq(corredoresOperacionales.id, corredorId)).limit(1);
  if (!c) return;

  const n = (c.totalViajes || 0) + 1;
  const kmTotal = (c.kmTotal || 0) + nuevoViaje.kmEcu;

  const rendNuevo = nuevoViaje.rendimiento > 0
    ? (c.rendimientoPromedio ? ((c.rendimientoPromedio * (n - 1)) + nuevoViaje.rendimiento) / n : nuevoViaje.rendimiento)
    : c.rendimientoPromedio;

  // Count distinct patentes
  const patenteCount = await db.execute(sql`SELECT COUNT(DISTINCT patente) as c FROM viajes_corredor WHERE corredor_id = ${corredorId}`);

  await db.update(corredoresOperacionales).set({
    totalViajes: n,
    kmTotal,
    totalCamiones: parseInt(patenteCount.rows[0]?.c as string || "0") + 1,
    rendimientoPromedio: rendNuevo ? Math.round(rendNuevo * 100) / 100 : null,
    rendimientoMejor: nuevoViaje.rendimiento > 0 ? Math.max(c.rendimientoMejor || 0, nuevoViaje.rendimiento) : c.rendimientoMejor,
    rendimientoPeor: nuevoViaje.rendimiento > 0 ? (c.rendimientoPeor ? Math.min(c.rendimientoPeor, nuevoViaje.rendimiento) : nuevoViaje.rendimiento) : c.rendimientoPeor,
    ultimaActualizacion: new Date(),
  }).where(eq(corredoresOperacionales.id, corredorId));
}

/* ── METAS ── */
const METAS: Record<string, number> = {}; // Sin metas km hardcodeadas por ahora

export async function calcularProyeccionMeta(patente: string, contrato: string) {
  const meta = METAS[contrato];
  if (!meta) return { estado: "SIN_META" as const, km_actual: 0, km_meta: 0, dia_actual: 0, dias_mes: 0, proyeccion_fin_mes: 0, cumplira: false, km_diarios_necesarios: null as number | null };

  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  const diaActual = hoy.getDate();
  const diasMes = finMes.getDate();
  const diasRestantes = diasMes - diaActual;

  const r = await pool.query(`
    SELECT COALESCE(SUM(km_ecu::float), 0) as km_total
    FROM viajes_aprendizaje va
    JOIN camiones c ON va.camion_id = c.id
    WHERE c.patente = $1 AND va.fecha_inicio >= $2 AND va.km_ecu > 0
  `, [patente, inicioMes]);

  const kmActual = parseFloat(r.rows[0]?.km_total || "0");
  const kmPorDia = diaActual > 0 ? kmActual / diaActual : 0;
  const proyeccion = kmActual + (kmPorDia * diasRestantes);
  const kmFaltante = meta - kmActual;
  const kmDiariosNec = diasRestantes > 0 ? Math.ceil(kmFaltante / diasRestantes) : null;

  let estado: "CUMPLIRA" | "EN_RIESGO" | "NO_CUMPLIRA";
  if (proyeccion >= meta * 0.98) estado = "CUMPLIRA";
  else if (proyeccion >= meta * 0.85) estado = "EN_RIESGO";
  else estado = "NO_CUMPLIRA";

  return { km_actual: Math.round(kmActual), km_meta: meta, dia_actual: diaActual, dias_mes: diasMes, proyeccion_fin_mes: Math.round(proyeccion), cumplira: proyeccion >= meta * 0.98, km_diarios_necesarios: kmDiariosNec, estado };
}

/* ── ROUTES ── */
export function registerCorredoresOperacionalesRoutes(app: Express) {

  // Lista de corredores con camiones top
  app.get("/api/rutas/corredores-operacionales", async (req: Request, res: Response) => {
    try {
      const contrato = req.query.contrato as string | undefined;

      let where = sql`activo = true`;
      if (contrato && contrato !== "TODOS") {
        where = sql`activo = true AND contrato = ${contrato}`;
      }

      const corredoresResult = await pool.query(`
        SELECT * FROM corredores_operacionales
        WHERE ${contrato && contrato !== "TODOS" ? `activo = true AND contrato = '${contrato}'` : "activo = true"}
        ORDER BY total_viajes DESC
      `);

      const corredoresConCamiones = await Promise.all(
        corredoresResult.rows.map(async (corredor: any) => {
          const camiones = await pool.query(`
            SELECT patente, conductor, COUNT(*) as viajes,
              ROUND(AVG(rendimiento)::numeric, 2) as rend_promedio,
              ROUND(MAX(rendimiento)::numeric, 2) as rend_mejor,
              ROUND(SUM(km_ecu)::numeric, 0) as km_total
            FROM viajes_corredor
            WHERE corredor_id = $1 AND rendimiento > 0
            GROUP BY patente, conductor
            ORDER BY rend_promedio DESC
            LIMIT 10
          `, [corredor.id]);

          return { ...corredor, camiones: camiones.rows };
        })
      );

      res.json({ total_corredores: corredoresResult.rows.length, corredores: corredoresConCamiones });
    } catch (error: any) {
      console.error("[CORREDORES-OP]", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  // Proyección meta por camión
  app.get("/api/rutas/proyeccion-meta", async (req: Request, res: Response) => {
    try {
      const { patente, contrato } = req.query;
      if (!patente || !contrato) return res.status(400).json({ error: "patente y contrato requeridos" });
      const proy = await calcularProyeccionMeta(patente as string, contrato as string);
      res.json(proy);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Meta flota completa
  app.get("/api/rutas/meta-flota", async (req: Request, res: Response) => {
    try {
      const contrato = req.query.contrato as string;
      const meta = METAS[contrato];
      if (!meta) return res.json({ estado: "SIN_META" });

      const hoy = new Date();
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
      const diaActual = hoy.getDate();
      const diasMes = finMes.getDate();
      const diasRestantes = diasMes - diaActual;

      const camionesR = await pool.query(`
        SELECT COUNT(DISTINCT c.patente) as n FROM viajes_aprendizaje va
        JOIN camiones c ON va.camion_id = c.id
        WHERE va.contrato = $1 AND c.vin IS NOT NULL AND c.vin != '' AND va.fecha_inicio >= $2 AND va.km_ecu > 0
      `, [contrato, inicioMes]);

      const kmR = await pool.query(`
        SELECT COALESCE(SUM(va.km_ecu::float), 0) as total FROM viajes_aprendizaje va
        JOIN camiones c ON va.camion_id = c.id
        WHERE va.contrato = $1 AND c.vin IS NOT NULL AND c.vin != '' AND va.fecha_inicio >= $2 AND va.km_ecu > 0
      `, [contrato, inicioMes]);

      const camionesCount = parseInt(camionesR.rows[0]?.n || "0");
      const kmActual = parseFloat(kmR.rows[0]?.total || "0");
      const kmMeta = meta * camionesCount;
      const kmPorDia = diaActual > 0 ? kmActual / diaActual : 0;
      const proyeccion = kmActual + (kmPorDia * diasRestantes);

      res.json({
        contrato, camiones_activos: camionesCount,
        km_actual_total: Math.round(kmActual), km_meta_total: kmMeta,
        dia_actual: diaActual, dias_mes: diasMes,
        proyeccion_total: Math.round(proyeccion),
        proyeccion_cumple: proyeccion >= kmMeta * 0.98,
        km_diarios_necesarios: diasRestantes > 0 ? Math.ceil((kmMeta - kmActual) / diasRestantes) : null,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Procesar viajes existentes → asignar a corredores
  app.post("/api/admin/procesar-corredores-operacionales", async (_req: Request, res: Response) => {
    try {
      const viajesR = await pool.query(`
        SELECT va.id, va.origen_lat::float as origen_lat, va.origen_lng::float as origen_lng,
          va.destino_lat::float as destino_lat, va.destino_lng::float as destino_lng,
          va.origen_nombre, va.destino_nombre, va.km_ecu::float as km_ecu,
          va.litros_consumidos_ecu::float as litros_ecu,
          va.rendimiento_real::float as rendimiento,
          va.contrato, va.conductor, va.duracion_minutos::float as duracion_min,
          va.fecha_inicio,
          c.patente
        FROM viajes_aprendizaje va
        JOIN camiones c ON va.camion_id = c.id
        WHERE va.origen_lat IS NOT NULL AND va.destino_lat IS NOT NULL AND va.km_ecu > 20
        ORDER BY va.fecha_inicio ASC
      `);

      let asignados = 0;
      let nuevos = 0;

      for (const v of viajesR.rows) {
        const corredorId = await asignarCorredorOperacional({
          origenLat: v.origen_lat, origenLng: v.origen_lng,
          destinoLat: v.destino_lat, destinoLng: v.destino_lng,
          origenNombre: v.origen_nombre, destinoNombre: v.destino_nombre,
          kmEcu: v.km_ecu, contrato: v.contrato,
        });

        if (corredorId) {
          try {
            await pool.query(`
              INSERT INTO viajes_corredor (corredor_id, viaje_id, patente, conductor, contrato, fecha, km_ecu, litros_ecu, rendimiento, duracion_horas)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
              ON CONFLICT (viaje_id) DO NOTHING
            `, [corredorId, v.id, v.patente, v.conductor, v.contrato, new Date(v.fecha_inicio), v.km_ecu, v.litros_ecu, v.rendimiento, v.duracion_min ? v.duracion_min / 60 : null]);

            await actualizarEstadisticasCorredor(corredorId, {
              kmEcu: v.km_ecu || 0,
              rendimiento: v.rendimiento || 0,
              patente: v.patente,
            });
            asignados++;
          } catch (e: any) {
            // skip duplicates
          }
        }
      }

      const corredorCount = await pool.query("SELECT count(*) as c FROM corredores_operacionales");

      console.log(`[CORREDORES-OP] Procesados ${viajesR.rows.length} viajes, ${asignados} asignados, ${corredorCount.rows[0].c} corredores`);
      res.json({ total_viajes: viajesR.rows.length, asignados, corredores_creados: parseInt(corredorCount.rows[0].c) });
    } catch (error: any) {
      console.error("[CORREDORES-OP] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  // Procesar cierres retroactivos (últimos 30 días)
  app.post("/api/admin/procesar-cierres-retroactivo", async (_req: Request, res: Response) => {
    try {
      const { procesarCierreAutomatico } = await import("./aprendizaje-engine");
      const cerradas = await procesarCierreAutomatico(30, 500);
      const total = await pool.query("SELECT count(*) as c FROM operaciones_cerradas");
      const anomalias = await pool.query("SELECT count(*) as c FROM operaciones_cerradas WHERE nivel_anomalia != 'NORMAL'");
      res.json({
        cerradas_nuevas: cerradas,
        total_operaciones: parseInt(total.rows[0].c),
        total_anomalias: parseInt(anomalias.rows[0].c),
      });
    } catch (error: any) {
      console.error("[CIERRES-RETRO] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  // Poblar corredores desde viajes existentes via SQL directo
  app.post("/api/admin/poblar-corredores", async (_req: Request, res: Response) => {
    try {
      // Limpiar y repoblar
      await pool.query("DELETE FROM viajes_corredor");
      await pool.query("DELETE FROM corredores_operacionales");

      // Crear corredores agrupando por origen→destino+contrato con 3+ viajes
      await pool.query(`
        INSERT INTO corredores_operacionales (
          nombre, contrato,
          origen_nombre, destino_nombre,
          distancia_promedio_km, distancia_tolerancia_pct,
          rendimiento_promedio, rendimiento_mejor, rendimiento_peor,
          total_viajes, total_camiones,
          creado_manual, activo
        )
        SELECT
          va.origen_nombre || ' → ' || va.destino_nombre,
          va.contrato,
          va.origen_nombre, va.destino_nombre,
          AVG(va.km_ecu::float), 15,
          AVG(va.rendimiento_real::float),
          MAX(va.rendimiento_real::float),
          MIN(NULLIF(va.rendimiento_real::float, 0)),
          COUNT(*)::int,
          COUNT(DISTINCT c.patente)::int,
          false, true
        FROM viajes_aprendizaje va
        JOIN camiones c ON va.camion_id = c.id
        WHERE va.fecha_inicio >= '2026-03-01'
          AND va.km_ecu::float > 20
          AND va.origen_nombre IS NOT NULL
          AND va.destino_nombre IS NOT NULL
          AND va.origen_nombre != 'Punto desconocido'
          AND va.destino_nombre != 'Punto desconocido'
          AND c.vin IS NOT NULL AND c.vin != ''
        GROUP BY va.origen_nombre, va.destino_nombre, va.contrato
        HAVING COUNT(*) >= 2
      `);

      // Vincular viajes a corredores
      await pool.query(`
        INSERT INTO viajes_corredor (
          corredor_id, viaje_id, patente,
          conductor, contrato, fecha,
          km_ecu, litros_ecu, rendimiento, duracion_horas
        )
        SELECT co.id, va.id, c.patente,
          va.conductor, va.contrato,
          va.fecha_inicio::date,
          va.km_ecu::float, va.litros_consumidos_ecu::float,
          va.rendimiento_real::float, va.duracion_minutos::float / 60.0
        FROM viajes_aprendizaje va
        JOIN camiones c ON va.camion_id = c.id
        JOIN corredores_operacionales co ON (
          co.origen_nombre = va.origen_nombre
          AND co.destino_nombre = va.destino_nombre
          AND co.contrato = va.contrato
        )
        WHERE va.fecha_inicio >= '2026-03-01'
          AND va.km_ecu::float > 20
          AND c.vin IS NOT NULL AND c.vin != ''
        ON CONFLICT (viaje_id) DO NOTHING
      `);

      const corredoresR = await pool.query(`SELECT contrato, COUNT(*) as n FROM corredores_operacionales GROUP BY contrato ORDER BY n DESC`);
      const viajesR = await pool.query("SELECT count(*) as c FROM viajes_corredor");

      console.log(`[POBLAR-CORREDORES] ${corredoresR.rows.map((r: any) => `${r.contrato}: ${r.n}`).join(", ")} · ${viajesR.rows[0].c} viajes`);
      res.json({ corredores: corredoresR.rows, total_viajes_vinculados: parseInt(viajesR.rows[0].c) });
    } catch (error: any) {
      console.error("[POBLAR-CORREDORES] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });
}
