import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { db, pool, DATA_START, getDefaultDesde } from "./db";
import { geoPuntos, geoViajes, geoBases, geoTrayectorias, geoGeocache, camiones, geoLugares, geoVisitas, geoAnalisisIa, viajesAprendizaje, cargas } from "@shared/schema";
import { eq, desc, and, gte, lte, sql, inArray, asc, or, isNull, isNotNull } from "drizzle-orm";
import { getContractConfig, getContractPatentes, getContractCamiones, CONTRATOS_ACTIVOS } from "./faena-filter";
import { detectarLugar, registrarVisita, analizarHistoricoCompleto, generarAnalisisIA } from "./geo-lugares-service";
import { obtenerHistorialCamion, procesarFlotaHistorico, obtenerResumenFlota } from "./geo-reconstruccion-service";
import { detectarVisitasFlota, obtenerResumenVisitas, obtenerVisitasCamion, inicializarPerfilGPS } from "./geo-visitas-service";
import { buscarLugarCercano, LUGARES_CONOCIDOS } from "./viajes-historico";

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

async function geocodificar(lat: number, lng: number): Promise<{ nombre: string; ciudad: string; region: string }> {
  const roundLat = Math.round(lat * 100) / 100;
  const roundLng = Math.round(lng * 100) / 100;

  const cached = await db.select().from(geoGeocache)
    .where(and(
      eq(geoGeocache.lat, String(roundLat)),
      eq(geoGeocache.lng, String(roundLng))
    )).limit(1);

  if (cached.length > 0) {
    return { nombre: cached[0].nombre || "", ciudad: cached[0].ciudad || "", region: cached[0].region || "" };
  }

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14`, {
      headers: { "User-Agent": "GEOVALIDATOR-Sotraser/1.0" }
    });
    const data = await res.json();
    const nombre = data.display_name?.split(",").slice(0, 2).join(",").trim() || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    const ciudad = data.address?.city || data.address?.town || data.address?.village || "";
    const region = data.address?.state || "";

    await db.insert(geoGeocache).values({
      lat: String(roundLat),
      lng: String(roundLng),
      nombre, ciudad, region,
    }).onConflictDoNothing();

    return { nombre, ciudad, region };
  } catch {
    return { nombre: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, ciudad: "", region: "" };
  }
}


export const ESTACIONES_COMBUSTIBLE: Record<string, { lat: number; lng: number; ciudad: string }> = {
  "LOS ANGELES 3": { lat: -37.4695, lng: -72.3538, ciudad: "Los Angeles" },
  "QUILICURA": { lat: -33.3583, lng: -70.7250, ciudad: "Santiago" },
  "PANAMERICANA NORTE, CRUCE CAMINO HU": { lat: -33.32, lng: -70.73, ciudad: "Huechuraba" },
  "RUTA 5 SUR KM 906": { lat: -40.57, lng: -73.13, ciudad: "Osorno" },
  "CARRETERA PANAMERICANA NORTE KM 455": { lat: -30.40, lng: -70.98, ciudad: "La Serena" },
  "CARR. PANAMERICANA NORTE KM.811": { lat: -40.57, lng: -73.13, ciudad: "Puerto Montt" },
  "CARRETERA LONGITUDINAL SUR KM 275,3": { lat: -35.84, lng: -71.69, ciudad: "Linares" },
};

export function registerGeoRoutes(app: Express) {

  // Live fleet positions
  app.get("/api/geo/camiones-live", async (_req: Request, res: Response) => {
    try {
      const r = await pool.query(`
        SELECT patente, vin, lat, lng, velocidad, rumbo, timestamp_gps,
          fuente, es_principal, tiene_ecu, odometro, combustible_nivel,
          rpm, temp_motor, conductor, contrato,
          EXTRACT(EPOCH FROM (NOW() - timestamp_gps))/60 as age_min
        FROM ultima_posicion_camion
        ORDER BY
          CASE WHEN EXTRACT(EPOCH FROM (NOW() - timestamp_gps))/60 < 60 AND velocidad > 5 THEN 0
               WHEN EXTRACT(EPOCH FROM (NOW() - timestamp_gps))/60 < 30 THEN 1
               WHEN EXTRACT(EPOCH FROM (NOW() - timestamp_gps))/60 < 60 THEN 2
               ELSE 3 END,
          timestamp_gps DESC
      `);

      const result = r.rows.map((c: any) => {
        const ageMin = parseFloat(c.age_min) || 999;
        let estado = "SIN_SEÑAL";
        if (ageMin < 60) {
          estado = (c.velocidad || 0) > 5 ? "EN_MOVIMIENTO" : (ageMin < 30 ? "DETENIDO_RECIENTE" : "DETENIDO");
        }
        return {
          camionId: 0,
          patente: c.patente,
          modelo: null,
          conductor: c.conductor || null,
          vin: c.vin || null,
          lat: c.lat, lng: c.lng,
          velocidad: Math.round((c.velocidad || 0) * 10) / 10,
          rumbo: c.rumbo || 0,
          timestamp: c.timestamp_gps,
          estado,
          ageMinutes: Math.round(ageMin),
          fuelLevel: c.combustible_nivel || null,
          fuente: c.fuente,
          contrato: c.contrato || null,
          rpm: c.rpm || null,
          tempMotor: c.temp_motor || null,
        };
      });

      res.json(result);
    } catch (error: any) {
      console.error("[geo] camiones-live error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/geo/stats", async (_req: Request, res: Response) => {
    try {
      const totalPuntos = await pool.query(`SELECT COUNT(*) as cnt FROM geo_puntos`);
      const totalCamiones = await pool.query(`SELECT COUNT(DISTINCT camion_id) as cnt FROM geo_puntos`);
      const today = await pool.query(`SELECT COUNT(*) as cnt FROM geo_puntos WHERE timestamp_punto >= CURRENT_DATE`);
      const last7d = await pool.query(`SELECT COUNT(*) as cnt FROM geo_puntos WHERE timestamp_punto >= NOW() - INTERVAL '7 days'`);
      const byDay = await pool.query(`
        SELECT DATE(timestamp_punto) as dia, COUNT(*) as puntos, COUNT(DISTINCT camion_id) as camiones
        FROM geo_puntos WHERE timestamp_punto >= NOW() - INTERVAL '14 days'
        GROUP BY DATE(timestamp_punto) ORDER BY dia DESC
      `);
      const oldest = await pool.query(`SELECT MIN(timestamp_punto) as fecha FROM geo_puntos`);
      const newest = await pool.query(`SELECT MAX(timestamp_punto) as fecha FROM geo_puntos`);
      
      res.json({
        totalPuntos: parseInt(totalPuntos.rows[0]?.cnt) || 0,
        totalCamiones: parseInt(totalCamiones.rows[0]?.cnt) || 0,
        puntosHoy: parseInt(today.rows[0]?.cnt) || 0,
        puntos7d: parseInt(last7d.rows[0]?.cnt) || 0,
        primerPunto: oldest.rows[0]?.fecha,
        ultimoPunto: newest.rows[0]?.fecha,
        porDia: byDay.rows.map((r: any) => ({ dia: r.dia, puntos: parseInt(r.puntos), camiones: parseInt(r.camiones) })),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/geo/trayectoria/:camionId", async (req: Request, res: Response) => {
    try {
      const camionId = parseInt(String(req.params.camionId));
      const fecha = String(req.query.fecha || new Date().toISOString().split("T")[0]);

      const dayStart = new Date(fecha + "T00:00:00");
      const dayEnd = new Date(fecha + "T23:59:59");

      const puntos = await db.select().from(geoPuntos)
        .where(and(
          eq(geoPuntos.camionId, camionId),
          gte(geoPuntos.timestampPunto, dayStart),
          lte(geoPuntos.timestampPunto, dayEnd)
        ))
        .orderBy(geoPuntos.timestampPunto);

      res.json(puntos);
    } catch (error: any) {
      console.error("[geo] trayectoria error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/geo/bases", async (_req: Request, res: Response) => {
    try {
      const bases = await db.select().from(geoBases).where(eq(geoBases.activa, true));
      res.json(bases);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/geo/bases", async (req: Request, res: Response) => {
    try {
      const { nombre, lat, lng, radioMetros, contrato } = req.body;
      if (!nombre || !lat || !lng) return res.status(400).json({ message: "nombre, lat, lng requeridos" });
      const [base] = await db.insert(geoBases).values({
        nombre, lat: String(lat), lng: String(lng),
        radioMetros: radioMetros || 500,
        contrato: contrato || "GENERAL",
      }).returning();
      res.json(base);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/geocercas/importar-json", async (req: Request, res: Response) => {
    try {
      const { geocercas } = req.body;
      if (!Array.isArray(geocercas)) {
        return res.status(400).json({ message: "geocercas debe ser un array" });
      }
      let insertadas = 0;
      let actualizadas = 0;

      for (const g of geocercas) {
        if (!g.nombre || g.lat == null || g.lng == null) continue;
        const existe = await db.select()
          .from(geoBases)
          .where(eq(geoBases.nombre, g.nombre))
          .limit(1);

        if (existe.length > 0) {
          await db.update(geoBases)
            .set({
              lat: String(g.lat),
              lng: String(g.lng),
              radioMetros: 1000,
              contrato: g.contrato || 'TODOS',
              activa: true
            })
            .where(eq(geoBases.nombre, g.nombre));
          actualizadas++;
        } else {
          await db.insert(geoBases).values({
            nombre: g.nombre,
            lat: String(g.lat),
            lng: String(g.lng),
            radioMetros: 1000,
            contrato: g.contrato || 'TODOS',
            activa: true
          });
          insertadas++;
        }
      }

      res.json({ insertadas, actualizadas, total: insertadas + actualizadas });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/geocercas/actualizar-radio", async (_req: Request, res: Response) => {
    try {
      await db.update(geoBases)
        .set({ radioMetros: 1000 })
        .where(eq(geoBases.activa, true));
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/geocercas/recalibrar-viajes", async (_req: Request, res: Response) => {
    try {
      // Buscar viajes con origen O destino sin resolver
      const viajes = await db.select()
        .from(viajesAprendizaje)
        .where(
          or(
            eq(viajesAprendizaje.origenNombre, 'Punto desconocido'),
            isNull(viajesAprendizaje.origenNombre),
            eq(viajesAprendizaje.destinoNombre, 'Punto desconocido'),
            isNull(viajesAprendizaje.destinoNombre)
          )
        );

      const bases = await db.select().from(geoBases)
        .where(eq(geoBases.activa, true));

      let actualizados = 0;
      const MAX_DIST_KM = 3.0; // radio máximo de búsqueda

      for (const viaje of viajes) {
        let mejorOrigen: string | null = null;
        let mejorDestino: string | null = null;
        let menorDistOrigen = 999;
        let menorDistDestino = 999;

        const necesitaOrigen = !viaje.origenNombre || viaje.origenNombre === 'Punto desconocido';
        const necesitaDestino = !viaje.destinoNombre || viaje.destinoNombre === 'Punto desconocido';

        for (const base of bases) {
          // Radio de la geocerca en km, con mínimo 1km y máximo MAX_DIST_KM
          const radioKm = Math.min(Math.max((base.radioMetros || 500) / 1000, 1.0), MAX_DIST_KM);

          if (necesitaOrigen && viaje.origenLat && viaje.origenLng) {
            const distO = haversineKm(
              parseFloat(viaje.origenLat), parseFloat(viaje.origenLng),
              parseFloat(base.lat), parseFloat(base.lng)
            );
            if (distO < menorDistOrigen && distO < radioKm) {
              menorDistOrigen = distO;
              mejorOrigen = base.nombre;
            }
          }

          if (necesitaDestino && viaje.destinoLat && viaje.destinoLng) {
            const distD = haversineKm(
              parseFloat(viaje.destinoLat), parseFloat(viaje.destinoLng),
              parseFloat(base.lat), parseFloat(base.lng)
            );
            if (distD < menorDistDestino && distD < radioKm) {
              menorDistDestino = distD;
              mejorDestino = base.nombre;
            }
          }
        }

        if (mejorOrigen || mejorDestino) {
          await db.update(viajesAprendizaje)
            .set({
              ...(mejorOrigen ? { origenNombre: mejorOrigen } : {}),
              ...(mejorDestino ? { destinoNombre: mejorDestino } : {}),
            })
            .where(eq(viajesAprendizaje.id, viaje.id));
          actualizados++;
        }
      }

      res.json({ actualizados, total_viajes: viajes.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/geo/viajes", async (req: Request, res: Response) => {
    try {
      const desde = req.query.desde as string;
      const hasta = req.query.hasta as string;
      const patente = req.query.patente as string;
      const estado = req.query.estado as string;

      let query = db.select().from(geoViajes).orderBy(desc(geoViajes.creadoAt));

      const conditions: any[] = [];
      if (desde) conditions.push(gte(geoViajes.origenTimestamp, new Date(desde)));
      if (hasta) conditions.push(lte(geoViajes.origenTimestamp, new Date(hasta)));
      if (patente) conditions.push(eq(geoViajes.patente, patente));
      if (estado) conditions.push(eq(geoViajes.validacionEstado, estado));

      const viajes = conditions.length > 0
        ? await db.select().from(geoViajes).where(and(...conditions)).orderBy(desc(geoViajes.creadoAt)).limit(200)
        : await db.select().from(geoViajes).orderBy(desc(geoViajes.creadoAt)).limit(200);

      res.json(viajes);
    } catch (error: any) {
      console.error("[geo] viajes error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/geo/viajes/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id));
      const [viaje] = await db.select().from(geoViajes).where(eq(geoViajes.id, id));
      if (!viaje) return res.status(404).json({ message: "Viaje no encontrado" });

      let puntos: any[] = [];
      if (viaje.trayectoriaId) {
        puntos = await db.select().from(geoPuntos)
          .where(eq(geoPuntos.trayectoriaId, viaje.trayectoriaId))
          .orderBy(geoPuntos.timestampPunto);
      }

      res.json({ viaje, puntos });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/geo/viajes/:id/validar", async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id));
      const { estado, notas, validadoPor } = req.body;
      if (!["VALIDADO", "REVISAR", "ANOMALIA", "PENDIENTE"].includes(estado)) {
        return res.status(400).json({ message: "Estado invalido" });
      }
      await db.update(geoViajes).set({
        validacionEstado: estado,
        notas: notas || null,
        validadoManualmente: true,
        validadoPor: validadoPor || "manual",
        actualizadoAt: new Date(),
      }).where(eq(geoViajes.id, id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/geo/viajes/aprobar-masivo", async (req: Request, res: Response) => {
    try {
      const result = await db.update(geoViajes).set({
        validadoManualmente: true,
        validadoPor: "auto-aprobado",
        actualizadoAt: new Date(),
      }).where(and(
        eq(geoViajes.validacionEstado, "VALIDADO"),
        eq(geoViajes.validadoManualmente, false)
      ));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/geo/validacion/stats", async (req: Request, res: Response) => {
    try {
      const dias = parseInt(req.query.dias as string) || 7;
      const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

      const stats = await pool.query(`
        SELECT 
          validacion_estado,
          COUNT(*) as count,
          ROUND(AVG(km_gps::numeric), 1) as avg_km,
          ROUND(AVG(duracion_minutos::numeric), 0) as avg_duracion,
          ROUND(AVG(velocidad_promedio::numeric), 1) as avg_velocidad
        FROM geo_viajes
        WHERE creado_at >= $1
        GROUP BY validacion_estado
      `, [desde]);

      const totalViajes = stats.rows.reduce((s: number, r: any) => s + parseInt(r.count), 0);
      const kmTotal = await pool.query(`
        SELECT COALESCE(SUM(km_gps::numeric), 0) as total_km
        FROM geo_viajes WHERE creado_at >= $1
      `, [desde]);

      const hoyCount = await pool.query(`
        SELECT COUNT(*) as count FROM geo_viajes 
        WHERE creado_at >= CURRENT_DATE
      `);

      res.json({
        porEstado: stats.rows.map((r: any) => ({
          estado: r.validacion_estado || "PENDIENTE",
          count: parseInt(r.count),
          avgKm: parseFloat(r.avg_km) || 0,
          avgDuracion: parseInt(r.avg_duracion) || 0,
          pct: totalViajes > 0 ? Math.round(parseInt(r.count) / totalViajes * 1000) / 10 : 0,
        })),
        totalViajes,
        kmTotal: Math.round(parseFloat(kmTotal.rows[0]?.total_km) || 0),
        hoyActivos: parseInt(hoyCount.rows[0]?.count) || 0,
      });
    } catch (error: any) {
      console.error("[geo] validacion stats error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/geo/puntos/ingest", async (req: Request, res: Response) => {
    try {
      const puntos = req.body;
      if (!Array.isArray(puntos) || puntos.length === 0) {
        return res.status(400).json({ message: "Array de puntos requerido" });
      }

      const inserted = [];
      for (const p of puntos) {
        const [punto] = await db.insert(geoPuntos).values({
          camionId: p.camionId || null,
          patente: p.patente,
          lat: String(p.lat),
          lng: String(p.lng),
          timestampPunto: new Date(p.timestamp),
          velocidadKmh: String(p.velocidad_kmh || 0),
          kmOdometro: p.km_odometro ? String(p.km_odometro) : null,
          fuente: p.fuente || "MANUAL",
        }).returning();
        inserted.push(punto);
      }

      res.json({ inserted: inserted.length });
    } catch (error: any) {
      console.error("[geo] ingest error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });


  app.post("/api/geo/detectar-viajes", async (_req: Request, res: Response) => {
    try {
      const allCamiones = await storage.getCamiones();
      const withVin = allCamiones.filter(c => c.vin);
      const bases = await db.select().from(geoBases).where(eq(geoBases.activa, true));
      const faenasResult = await pool.query(`SELECT id, nombre FROM faenas`);
      const faenaMap = new Map<number, string>(faenasResult.rows.map((r: any) => [r.id, r.nombre]));
      let detected = 0;

      for (const cam of withVin) {
        const puntos = await db.select().from(geoPuntos)
          .where(and(
            eq(geoPuntos.camionId, cam.id),
            gte(geoPuntos.timestampPunto, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
          ))
          .orderBy(geoPuntos.timestampPunto);

        if (puntos.length < 3) continue;

        let viajeInicio: any = null;
        let maxSpeed = 0;
        let totalKm = 0;
        let prevPoint: any = null;

        for (let i = 0; i < puntos.length; i++) {
          const p = puntos[i];
          const lat = parseFloat(p.lat as string);
          const lng = parseFloat(p.lng as string);
          const speed = parseFloat(p.velocidadKmh as string) || 0;

          const inBase = bases.some(b => {
            const dist = haversineKm(lat, lng, parseFloat(b.lat as string), parseFloat(b.lng as string)) * 1000;
            return dist <= (b.radioMetros || 500);
          });

          if (!viajeInicio && !inBase && speed > 5) {
            viajeInicio = p;
            maxSpeed = speed;
            totalKm = 0;
            prevPoint = p;
            continue;
          }

          if (viajeInicio && prevPoint) {
            const d = haversineKm(
              parseFloat(prevPoint.lat as string), parseFloat(prevPoint.lng as string),
              lat, lng
            );
            if (d < 500) totalKm += d;
            if (speed > maxSpeed) maxSpeed = speed;
          }

          if (viajeInicio && inBase && speed < 5 && totalKm > 10) {
            const origenLat = parseFloat(viajeInicio.lat as string);
            const origenLng = parseFloat(viajeInicio.lng as string);
            const [origenGeo, destinoGeo] = await Promise.all([
              geocodificar(origenLat, origenLng),
              geocodificar(lat, lng),
            ]);

            const duracion = Math.round(
              (new Date(p.timestampPunto).getTime() - new Date(viajeInicio.timestampPunto).getTime()) / 60000
            );

            const existingViaje = await db.select({ id: geoViajes.id }).from(geoViajes)
              .where(and(
                eq(geoViajes.camionId, cam.id),
                eq(geoViajes.origenTimestamp, new Date(viajeInicio.timestampPunto))
              )).limit(1);

            if (existingViaje.length === 0) {
              await db.insert(geoViajes).values({
                camionId: cam.id,
                patente: cam.patente,
                contrato: faenaMap.get(cam.faenaId) || "DESCONOCIDO",
                origenLat: viajeInicio.lat,
                origenLng: viajeInicio.lng,
                origenNombre: origenGeo.nombre,
                origenTimestamp: new Date(viajeInicio.timestampPunto),
                destinoLat: String(lat),
                destinoLng: String(lng),
                destinoNombre: destinoGeo.nombre,
                destinoTimestamp: new Date(p.timestampPunto),
                kmGps: String(Math.round(totalKm * 100) / 100),
                duracionMinutos: duracion,
                velocidadPromedio: String(Math.round(totalKm / (duracion / 60) * 10) / 10),
                velocidadMaxima: String(Math.round(maxSpeed * 10) / 10),
                validacionEstado: "PENDIENTE",
              });
              detected++;
            }

            viajeInicio = null;
            prevPoint = null;
            totalKm = 0;
            maxSpeed = 0;
            continue;
          }

          prevPoint = p;
        }
      }

      res.json({ detected });
    } catch (error: any) {
      console.error("[geo] detectar-viajes error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });


  app.get("/api/geo/lugares", async (req, res) => {
    try {
      const todos = await db.select().from(geoLugares).where(eq(geoLugares.activo, true)).orderBy(desc(geoLugares.vecesVisitado));
      const visitas = await db.select().from(geoVisitas);
      const result = todos.map(l => {
        const visitasLugar = visitas.filter(v => v.lugarId === l.id);
        const camionesUnicos = new Set(visitasLugar.map(v => v.camionId)).size;
        const tiempoPromedio = visitasLugar.length > 0
          ? Math.round(visitasLugar.reduce((s, v) => s + (v.minutosDetenido || 0), 0) / visitasLugar.length)
          : 0;
        const ultimoCamion = visitasLugar.length > 0
          ? visitasLugar.sort((a, b) => new Date(b.llegada || 0).getTime() - new Date(a.llegada || 0).getTime())[0]?.patente
          : null;
        return { ...l, camionesUnicos, tiempoPromedio, ultimoCamion, totalVisitas: visitasLugar.length };
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/geo/lugares", async (req, res) => {
    try {
      const { nombre, tipo, lat, lng, radioMetros, direccion, comuna, region } = req.body;
      const [inserted] = await db.insert(geoLugares).values({
        nombre,
        tipo: tipo || "OTRO",
        lat: String(lat),
        lng: String(lng),
        radioMetros: radioMetros || 500,
        direccion,
        comuna,
        region,
        detectadoVia: "MANUAL",
        confianzaPct: 100,
        confirmado: true,
        activo: true,
      }).returning();
      res.json(inserted);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/geo/lugares/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates: any = {};
      if (req.body.nombreConfirmado !== undefined) updates.nombreConfirmado = req.body.nombreConfirmado;
      if (req.body.nombre !== undefined) updates.nombre = req.body.nombre;
      if (req.body.tipo !== undefined) updates.tipo = req.body.tipo;
      if (req.body.confirmado !== undefined) updates.confirmado = req.body.confirmado;
      if (req.body.radioMetros !== undefined) updates.radioMetros = req.body.radioMetros;

      const [updated] = await db.update(geoLugares).set(updates).where(eq(geoLugares.id, id)).returning();
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/geo/lugares/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.update(geoLugares).set({ activo: false }).where(eq(geoLugares.id, id));
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/geo/lugares/:id/visitas", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = await db.select().from(geoVisitas)
        .where(eq(geoVisitas.lugarId, id))
        .orderBy(desc(geoVisitas.llegada));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/geo/analisis-ia", async (req, res) => {
    try {
      const [latest] = await db.select().from(geoAnalisisIa)
        .orderBy(desc(geoAnalisisIa.generadoAt))
        .limit(1);
      res.json(latest || null);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/geo/analisis-ia/generar", async (req, res) => {
    try {
      const result = await generarAnalisisIA();
      res.json(result);
    } catch (error: any) {
      console.error("[geo] analisis-ia error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/geo/analizar-historico", async (req, res) => {
    try {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const result = await analizarHistoricoCompleto((msg) => {
        res.write(`data: ${JSON.stringify(msg)}\n\n`);
      });

      res.write(`data: ${JSON.stringify({ paso: "DONE", ...result })}\n\n`);
      res.end();
    } catch (error: any) {
      console.error("[geo] analizar-historico error:", error.message);
      if (!res.headersSent) {
        res.status(500).json({ message: error.message });
      } else {
        res.write(`data: ${JSON.stringify({ paso: "ERROR", error: error.message })}\n\n`);
        res.end();
      }
    }
  });

  app.get("/api/geo/lugares/stats", async (req, res) => {
    try {
      const todos = await db.select().from(geoLugares).where(eq(geoLugares.activo, true));
      const stats = {
        total: todos.length,
        jumbos: todos.filter(l => l.tipo === "LOCAL_JUMBO").length,
        santaIsabel: todos.filter(l => l.tipo === "LOCAL_SANTA_ISABEL").length,
        cds: todos.filter(l => l.tipo === "CD_CENCOSUD" || l.tipo === "BASE_ORIGEN").length,
        easy: todos.filter(l => l.tipo === "LOCAL_EASY").length,
        paris: todos.filter(l => l.tipo === "LOCAL_PARIS").length,
        localesCencosud: todos.filter(l => l.tipo === "LOCAL_CENCOSUD").length,
        sinIdentificar: todos.filter(l => l.tipo === "PUNTO_FRECUENTE").length,
        pendienteConfirmar: todos.filter(l => !l.confirmado).length,
        confirmados: todos.filter(l => l.confirmado === true).length,
      };
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/geo/camion/:patente/historial", async (req: Request, res: Response) => {
    try {
      const { patente } = req.params;
      const desde = req.query.desde ? new Date(req.query.desde as string) : getDefaultDesde();
      const hasta = req.query.hasta ? new Date(req.query.hasta as string) : new Date();

      const resultado = await obtenerHistorialCamion(String(patente), desde, hasta);
      if (!resultado) {
        return res.status(404).json({ message: `Camion ${patente} no encontrado` });
      }
      res.json(resultado);
    } catch (error: any) {
      console.error("[geo] historial error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/geo/procesar-historico-flota", async (req: Request, res: Response) => {
    try {
      const { desde, patentes } = req.body;
      const fechaDesde = desde ? new Date(desde) : getDefaultDesde();
      const patentesList = patentes || [];

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });

      await procesarFlotaHistorico(fechaDesde, patentesList, (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      });

      res.end();
    } catch (error: any) {
      console.error("[geo] procesar-historico-flota error:", error.message);
      if (!res.headersSent) {
        res.status(500).json({ message: error.message });
      } else {
        res.write(`data: ${JSON.stringify({ estado: "error", mensaje: error.message })}\n\n`);
        res.end();
      }
    }
  });

  app.get("/api/geo/resumen-flota", async (req: Request, res: Response) => {
    try {
      const desde = req.query.desde ? new Date(req.query.desde as string) : getDefaultDesde();
      const resumen = await obtenerResumenFlota(desde);
      res.json(resumen);
    } catch (error: any) {
      console.error("[geo] resumen-flota error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/geo/camion/:camionId/puntos", async (req: Request, res: Response) => {
    try {
      const camionId = parseInt(String(req.params.camionId));
      const desde = req.query.desde ? new Date(req.query.desde as string) : getDefaultDesde();
      const hasta = req.query.hasta ? new Date(req.query.hasta as string) : new Date();

      const puntos = await db.select({
        lat: geoPuntos.lat,
        lng: geoPuntos.lng,
        ts: geoPuntos.timestampPunto,
        velocidad: geoPuntos.velocidadKmh,
      }).from(geoPuntos)
        .where(and(
          eq(geoPuntos.camionId, camionId),
          gte(geoPuntos.timestampPunto, desde),
          lte(geoPuntos.timestampPunto, hasta)
        ))
        .orderBy(asc(geoPuntos.timestampPunto))
        .limit(5000);

      res.json(puntos);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  inicializarPerfilGPS().catch(err => console.error("[geo-routes] Error init perfil GPS:", err));

  app.post("/api/geo/detectar-visitas", async (req: Request, res: Response) => {
    try {
      const { desde = getDefaultDesde().toISOString().slice(0,10), hasta, patentes = [] } = req.body;
      const hastaFinal = hasta || new Date().toISOString().split("T")[0];
      const resultado = await detectarVisitasFlota(desde, hastaFinal, patentes);
      res.json(resultado);
    } catch (error: any) {
      console.error("[visitas] Error detectando visitas:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/geo/resumen-visitas", async (_req: Request, res: Response) => {
    try {
      const desde = _req.query.desde as string || getDefaultDesde().toISOString().slice(0,10);
      const hasta = _req.query.hasta as string || new Date().toISOString().split("T")[0];
      const resumen = await obtenerResumenVisitas(desde, hasta);
      res.json(resumen);
    } catch (error: any) {
      console.error("[visitas] Error obteniendo resumen:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/geo/camion/:patente/visitas", async (req: Request, res: Response) => {
    try {
      const patente = String(req.params.patente);
      const visitas = await obtenerVisitasCamion(patente);
      res.json(visitas);
    } catch (error: any) {
      console.error("[visitas] Error obteniendo visitas camion:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ESTACIONES_COMBUSTIBLE is now exported at module level

  app.get("/api/geo/cargas-combustible", async (req: Request, res: Response) => {
    try {
      const desde = req.query.desde as string || getDefaultDesde().toISOString().slice(0,10);
      const hasta = req.query.hasta as string || new Date().toISOString().split("T")[0];
      const patenteFilter = req.query.patente as string || "";
      const contrato = (req.query.contrato as string || "").toUpperCase();
      const allFuel: any[] = [];

      const allCamiones = await storage.getCamiones();
      let faenaIds: number[];
      if (contrato === "TODOS" || contrato === "ALL" || !contrato) {
        const faenas = await storage.getFaenas();
        faenaIds = faenas.map(f => f.id);
      } else {
        const config = await getContractConfig(contrato);
        faenaIds = config.faenaIds;
      }
      const faenaIdSet = new Set(faenaIds);
      const camionesContrato = allCamiones.filter(c => faenaIdSet.has(c.faenaId));
      const patentes = new Set(camionesContrato.map(c => c.patente));
      const numVehToPatente = new Map<string, string>();
      for (const c of camionesContrato) {
        if (c.numVeh) numVehToPatente.set(c.numVeh, c.patente);
      }

      const contractFuel = allFuel.filter((r: any) => {
        if (r.patente && patentes.has(r.patente)) return true;
        if (r.numVeh && numVehToPatente.has(String(r.numVeh))) return true;
        return false;
      });
      const filtered = patenteFilter
        ? contractFuel.filter((r: any) => {
            const p = r.patente || numVehToPatente.get(String(r.numVeh)) || String(r.numVeh);
            return p === patenteFilter || String(r.numVeh) === patenteFilter;
          })
        : contractFuel;

      const porEstacion: Record<string, { cargas: number; litros: number; patentes: Set<string>; conductores: Set<string>; ultimaCarga: string; lat: number | null; lng: number | null; ciudad: string }> = {};
      for (const r of filtered) {
        const lugar = r.lugarConsumo || "DESCONOCIDO";
        const p = r.patente || numVehToPatente.get(String(r.numVeh)) || String(r.numVeh);
        if (!porEstacion[lugar]) {
          const est = ESTACIONES_COMBUSTIBLE[lugar];
          porEstacion[lugar] = { cargas: 0, litros: 0, patentes: new Set(), conductores: new Set(), ultimaCarga: "", lat: est?.lat || null, lng: est?.lng || null, ciudad: est?.ciudad || "" };
        }
        porEstacion[lugar].cargas++;
        porEstacion[lugar].litros += r.cantidadLt || 0;
        porEstacion[lugar].patentes.add(p);
        if (r.nombreConductor) porEstacion[lugar].conductores.add(r.nombreConductor);
        const fecha = r.fechaConsumo || "";
        if (fecha > porEstacion[lugar].ultimaCarga) porEstacion[lugar].ultimaCarga = fecha;
      }

      const estaciones = Object.entries(porEstacion).map(([nombre, d]) => ({
        nombre,
        cargas: d.cargas,
        litros: Math.round(d.litros),
        camiones: d.patentes.size,
        patentes: [...d.patentes].sort((a, b) => parseInt(a) - parseInt(b)),
        conductores: [...d.conductores].sort(),
        ultimaCarga: d.ultimaCarga,
        lat: d.lat,
        lng: d.lng,
        ciudad: d.ciudad,
      })).sort((a, b) => b.litros - a.litros);

      const cargas = filtered.map((r: any) => {
        const p = r.patente || numVehToPatente.get(String(r.numVeh)) || String(r.numVeh);
        return {
          numVeh: p,
          fecha: r.fechaConsumo,
          litros: r.cantidadLt,
          lugar: r.lugarConsumo || "DESCONOCIDO",
          odometro: r.odometroActual,
          kmRecorrido: r.kmRecorrido,
          rendimiento: r.rendReal,
          conductor: r.nombreConductor,
          lat: ESTACIONES_COMBUSTIBLE[r.lugarConsumo]?.lat || null,
          lng: ESTACIONES_COMBUSTIBLE[r.lugarConsumo]?.lng || null,
        };
      });

      res.json({
        totalCargas: filtered.length,
        totalLitros: Math.round(filtered.reduce((s: number, r: any) => s + (r.cantidadLt || 0), 0)),
        estaciones,
        cargas,
      });
    } catch (error: any) {
      console.error("[geo] Error cargas combustible:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/geo/cruce-mensual", async (req: Request, res: Response) => {
    try {
      const desde = req.query.desde as string || getDefaultDesde().toISOString().slice(0,10);
      const hasta = req.query.hasta as string || new Date().toISOString().split("T")[0];

      const allFuel: any[] = [];
      const filteredFuel = allFuel;

      const sigetraPorCamion: Record<string, { litros: number; cargas: number; conductores: Set<string>; odoMin: number; odoMax: number }> = {};
      for (const r of filteredFuel) {
        const p = r.patente || numVehToPatente.get(String(r.numVeh)) || String(r.numVeh);
        if (!sigetraPorCamion[p]) sigetraPorCamion[p] = { litros: 0, cargas: 0, conductores: new Set(), odoMin: Infinity, odoMax: 0 };
        sigetraPorCamion[p].litros += r.cantidadLt || 0;
        sigetraPorCamion[p].cargas++;
        if (r.nombreConductor) sigetraPorCamion[p].conductores.add(r.nombreConductor);
        const odo = r.odometroActual || 0;
        if (odo > 0) {
          if (odo < sigetraPorCamion[p].odoMin) sigetraPorCamion[p].odoMin = odo;
          if (odo > sigetraPorCamion[p].odoMax) sigetraPorCamion[p].odoMax = odo;
        }
      }

      const patenteList = [...patentes];
      const pPlaceholders = patenteList.map((_, i) => `$${i + 1}`).join(",");
      const ecuResult = await pool.query(`
        SELECT c.patente,
          MIN(s.total_fuel_used) as min_fuel,
          MAX(s.total_fuel_used) as max_fuel,
          MIN(s.total_distance) as min_dist,
          MAX(s.total_distance) as max_dist,
          COUNT(*) as snapshots
        FROM volvo_fuel_snapshots s
        JOIN camiones c ON c.vin = s.vin
        WHERE c.patente IN (${pPlaceholders})
          AND s.captured_at >= $${patenteList.length + 1}
          AND s.captured_at <= $${patenteList.length + 2}
        GROUP BY c.patente
      `, [...patenteList, desde, hasta + "T23:59:59"]);

      const ecuPorCamion: Record<string, { litrosEcu: number; km: number; viajes: number }> = {};
      for (const row of ecuResult.rows) {
        const deltaFuelMl = (parseFloat(row.max_fuel) || 0) - (parseFloat(row.min_fuel) || 0);
        const deltaDistM = (parseFloat(row.max_dist) || 0) - (parseFloat(row.min_dist) || 0);
        ecuPorCamion[row.patente] = {
          litrosEcu: deltaFuelMl / 1000,
          km: deltaDistM / 1000,
          viajes: parseInt(row.snapshots) || 0,
        };
      }

      let allPatentes = new Set([...Object.keys(sigetraPorCamion), ...Object.keys(ecuPorCamion)]);
      const volvoPatentes = new Set(Object.keys(ecuPorCamion));
      allPatentes = new Set([...allPatentes].filter(p => volvoPatentes.has(p)));
      const cruce = [...allPatentes].sort((a, b) => parseInt(a) - parseInt(b)).map(p => {
        const sig = sigetraPorCamion[p] || { litros: 0, cargas: 0, conductores: new Set(), odoMin: 0, odoMax: 0 };
        const ecu = ecuPorCamion[p] || { litrosEcu: 0, km: 0, viajes: 0 };
        const diff = sig.litros - ecu.litrosEcu;
        const diffPct = ecu.litrosEcu > 0 ? (diff / ecu.litrosEcu) * 100 : 0;
        const kmOdometro = sig.odoMax > sig.odoMin && sig.odoMin !== Infinity ? sig.odoMax - sig.odoMin : 0;
        const rendSigetra = kmOdometro > 0 && sig.litros > 0 ? kmOdometro / sig.litros : 0;
        const rendEcu = ecu.km > 0 && ecu.litrosEcu > 0 ? ecu.km / ecu.litrosEcu : 0;
        const snapshots = ecu.viajes;
        const confianza = snapshots >= 20 ? "ALTA" : snapshots >= 5 ? "MEDIA" : "BAJA";
        return {
          patente: p,
          conductores: [...sig.conductores],
          litrosSigetra: Math.round(sig.litros * 100) / 100,
          cargasSigetra: sig.cargas,
          litrosEcu: Math.round(ecu.litrosEcu * 100) / 100,
          kmEcu: Math.round(ecu.km * 100) / 100,
          kmOdometro,
          odoInicio: sig.odoMin !== Infinity ? sig.odoMin : 0,
          odoFin: sig.odoMax,
          viajesEcu: ecu.viajes,
          snapshots,
          confianza,
          diferencia: Math.round(diff * 100) / 100,
          diferenciaPct: Math.round(diffPct * 10) / 10,
          rendimientoSigetra: Math.round(rendSigetra * 100) / 100,
          rendimientoEcu: Math.round(rendEcu * 100) / 100,
        };
      });

      const totalSigetra = cruce.reduce((s, c) => s + c.litrosSigetra, 0);
      const totalEcu = cruce.reduce((s, c) => s + c.litrosEcu, 0);

      res.json({
        desde,
        hasta,
        totalCamiones: cruce.length,
        totalSigetra: Math.round(totalSigetra),
        totalEcu: Math.round(totalEcu),
        diferencia: Math.round(totalSigetra - totalEcu),
        camiones: cruce,
      });
    } catch (error: any) {
      console.error("[geo] Error cruce mensual:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/geo/conductores", async (req: Request, res: Response) => {
    try {
      const desde = req.query.desde as string || getDefaultDesde().toISOString().slice(0,10);
      const hasta = req.query.hasta as string || new Date().toISOString().split("T")[0];
      const contrato = (req.query.contrato as string || "TODOS").toUpperCase();
      const subfaena = req.query.subfaena as string || "";

      const allCamiones = await storage.getCamiones();
      let faenaIds: number[];
      if (contrato === "TODOS" || contrato === "ALL") {
        const faenas = await storage.getFaenas();
        faenaIds = faenas.map(f => f.id);
      } else {
        const config = await getContractConfig(contrato);
        if (subfaena) {
          const subId = config.faenaIds.find((_, i) => config.faenaNames[i] === subfaena);
          faenaIds = subId ? [subId] : config.faenaIds;
        } else {
          faenaIds = config.faenaIds;
        }
      }
      const faenaIdSet = new Set(faenaIds);
      const camionesContrato = allCamiones.filter(c => faenaIdSet.has(c.faenaId));
      const patentes = new Set(camionesContrato.map(c => c.patente));
      const numVehToPatente = new Map<string, string>();
      for (const c of camionesContrato) {
        if (c.numVeh) numVehToPatente.set(c.numVeh, c.patente);
      }

      const allFuel: any[] = [];
      const filteredFuel = allFuel;

      const byConductor: Record<string, {
        litros: number; cargas: number; kmTotal: number; litrosValidos: number;
        patentes: Set<string>; primerCarga: string; ultimaCarga: string;
        cargasDetalle: { fecha: string; litros: number; km: number; rend: number; patente: string; lugar: string }[];
      }> = {};

      for (const r of filteredFuel) {
        const cond = r.nombreConductor || "SIN CONDUCTOR";
        const p = r.patente || numVehToPatente.get(String(r.numVeh)) || String(r.numVeh);
        if (!byConductor[cond]) byConductor[cond] = {
          litros: 0, cargas: 0, kmTotal: 0, litrosValidos: 0,
          patentes: new Set(), primerCarga: "", ultimaCarga: "",
          cargasDetalle: [],
        };
        const d = byConductor[cond];
        d.litros += r.cantidadLt || 0;
        d.cargas++;
        d.patentes.add(p);
        const fecha = r.fechaConsumo || "";
        if (!d.primerCarga || fecha < d.primerCarga) d.primerCarga = fecha;
        if (fecha > d.ultimaCarga) d.ultimaCarga = fecha;
        const km = r.kmRecorrido || 0;
        const rend = r.rendReal || 0;
        if (km > 0 && rend > 0 && rend < 100) {
          d.kmTotal += km;
          d.litrosValidos += r.cantidadLt || 0;
        }
        d.cargasDetalle.push({
          fecha,
          litros: r.cantidadLt || 0,
          km,
          rend,
          patente: p,
          lugar: r.lugarConsumo || "",
        });
      }

      const conductores = Object.entries(byConductor)
        .map(([nombre, d]) => ({
          nombre,
          litrosTotales: Math.round(d.litros * 100) / 100,
          cargas: d.cargas,
          kmTotales: d.kmTotal,
          rendimiento: d.kmTotal > 0 && d.litrosValidos > 0 ? Math.round((d.kmTotal / d.litrosValidos) * 100) / 100 : 0,
          camiones: [...d.patentes].sort((a, b) => parseInt(a) - parseInt(b)),
          primerCarga: d.primerCarga,
          ultimaCarga: d.ultimaCarga,
          cargasDetalle: d.cargasDetalle.sort((a, b) => b.fecha.localeCompare(a.fecha)),
        }))
        .sort((a, b) => b.litrosTotales - a.litrosTotales);

      res.json({
        desde,
        hasta,
        totalConductores: conductores.length,
        conductores,
      });
    } catch (error: any) {
      console.error("[geo] Error conductores:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/conductores/detalle", async (req: Request, res: Response) => {
    try {
      const nombre = (req.query.nombre as string || "").trim();
      if (!nombre) return res.status(400).json({ message: "nombre required" });

      const desde = req.query.desde as string || getDefaultDesde().toISOString().slice(0,10);
      const hasta = req.query.hasta as string || new Date().toISOString().split("T")[0];

      const viajesResult = await pool.query(`
        SELECT va.*, c.patente, c.modelo
        FROM viajes_aprendizaje va
        JOIN camiones c ON va.camion_id = c.id
        WHERE LOWER(va.conductor) = LOWER($1)
          AND va.fecha_inicio >= $2::timestamp
          AND va.fecha_fin <= ($3::date + interval '1 day')
        ORDER BY va.fecha_inicio DESC
      `, [nombre, desde, hasta]);

      const viajes = viajesResult.rows.map((v: any) => ({
        id: v.id,
        patente: v.patente,
        modelo: v.modelo,
        contrato: v.contrato,
        fechaInicio: v.fecha_inicio,
        fechaFin: v.fecha_fin,
        kmEcu: parseFloat(v.km_ecu) || 0,
        litrosEcu: parseFloat(v.litros_consumidos_ecu) || 0,
        rendimiento: parseFloat(v.rendimiento_real) || 0,
        duracionMin: parseInt(v.duracion_minutos) || 0,
        velMax: parseFloat(v.velocidad_maxima) || 0,
        scoreAnomalia: parseInt(v.score_anomalia) || 0,
        estado: v.estado,
        kmSigetra: parseFloat(v.km_declarado_sigetra) || 0,
        litrosSigetra: parseFloat(v.litros_sigetra) || 0,
      }));

      const allFuel: any[] = [];
      const conductorFuel = allFuel.filter((r: any) => {
        const cn = (r.nombreConductor || "").trim().toLowerCase();
        return cn === nombre.toLowerCase();
      });

      const cargas = conductorFuel.map((r: any) => ({
        fecha: r.fechaConsumo || "",
        litros: r.cantidadLt || 0,
        odometro: r.odometroActual || 0,
        odometroPrevio: r.odometroPrevio || 0,
        kmRecorrido: r.kmRecorrido || 0,
        rendimiento: r.rendReal || 0,
        patente: String(r.numVeh || ""),
        lugar: r.lugarConsumo || "",
        tarjeta: r.nroTarjeta || "",
        faena: r.faena || "",
        numGuia: r.numGuia || 0,
      })).sort((a: any, b: any) => b.fecha.localeCompare(a.fecha));

      const porCamion: Record<string, { patente: string; viajes: number; litrosEcu: number; kmEcu: number; rendEcu: number; cargas: number; litrosSig: number; kmSig: number; rendSig: number }> = {};
      for (const v of viajes) {
        if (!porCamion[v.patente]) porCamion[v.patente] = { patente: v.patente, viajes: 0, litrosEcu: 0, kmEcu: 0, rendEcu: 0, cargas: 0, litrosSig: 0, kmSig: 0, rendSig: 0 };
        const pc = porCamion[v.patente];
        pc.viajes++;
        pc.litrosEcu += v.litrosEcu;
        pc.kmEcu += v.kmEcu;
      }
      for (const c of cargas) {
        if (!porCamion[c.patente]) porCamion[c.patente] = { patente: c.patente, viajes: 0, litrosEcu: 0, kmEcu: 0, rendEcu: 0, cargas: 0, litrosSig: 0, kmSig: 0, rendSig: 0 };
        const pc = porCamion[c.patente];
        pc.cargas++;
        pc.litrosSig += c.litros;
        if (c.kmRecorrido > 0 && c.rendimiento > 0 && c.rendimiento < 100) pc.kmSig += c.kmRecorrido;
      }
      for (const pc of Object.values(porCamion)) {
        pc.rendEcu = pc.litrosEcu > 0 ? pc.kmEcu / pc.litrosEcu : 0;
        pc.rendSig = pc.litrosSig > 0 ? pc.kmSig / pc.litrosSig : 0;
      }

      const porZona: Record<string, { zona: string; cargas: number; litros: number; km: number; rend: number }> = {};
      for (const c of cargas) {
        const zona = c.lugar || "SIN LUGAR";
        if (!porZona[zona]) porZona[zona] = { zona, cargas: 0, litros: 0, km: 0, rend: 0 };
        porZona[zona].cargas++;
        porZona[zona].litros += c.litros;
        if (c.kmRecorrido > 0 && c.rendimiento > 0 && c.rendimiento < 100) porZona[zona].km += c.kmRecorrido;
      }
      for (const pz of Object.values(porZona)) {
        pz.rend = pz.litros > 0 ? pz.km / pz.litros : 0;
      }

      const totalEcuLt = viajes.reduce((s: number, v: any) => s + v.litrosEcu, 0);
      const totalEcuKm = viajes.reduce((s: number, v: any) => s + v.kmEcu, 0);
      const totalSigLt = cargas.reduce((s: number, c: any) => s + c.litros, 0);

      const anomalias = viajes.filter((v: any) => v.estado !== "NORMAL");
      const contratos = [...new Set(viajes.map((v: any) => v.contrato))];
      const camiones = [...new Set([...viajes.map((v: any) => v.patente), ...cargas.map((c: any) => c.patente)])].sort((a, b) => parseInt(a) - parseInt(b));

      const toMesKey = (fecha: string | null | undefined): string | null => {
        if (!fecha) return null;
        const s = String(fecha);
        const match = s.match(/^(\d{4})-(\d{2})/);
        return match ? `${match[1]}-${match[2]}` : null;
      };

      const MIN_MES = "2026-03";
      const porMes: Record<string, { mes: string; cargasSig: number; litrosSig: number; kmSig: number; viajesEcu: number; litrosEcu: number; kmEcu: number }> = {};
      for (const c of cargas) {
        const mesKey = toMesKey(c.fecha);
        if (!mesKey || mesKey < MIN_MES) continue;
        if (!porMes[mesKey]) porMes[mesKey] = { mes: mesKey, cargasSig: 0, litrosSig: 0, kmSig: 0, viajesEcu: 0, litrosEcu: 0, kmEcu: 0 };
        porMes[mesKey].cargasSig++;
        porMes[mesKey].litrosSig += c.litros;
        if (c.kmRecorrido > 0 && c.rendimiento > 0 && c.rendimiento < 100) porMes[mesKey].kmSig += c.kmRecorrido;
      }
      for (const v of viajes) {
        const mesKey = toMesKey(v.fechaInicio);
        if (!mesKey || mesKey < MIN_MES) continue;
        if (!porMes[mesKey]) porMes[mesKey] = { mes: mesKey, cargasSig: 0, litrosSig: 0, kmSig: 0, viajesEcu: 0, litrosEcu: 0, kmEcu: 0 };
        porMes[mesKey].viajesEcu++;
        porMes[mesKey].litrosEcu += v.litrosEcu;
        porMes[mesKey].kmEcu += v.kmEcu;
      }
      const historialMensual = Object.values(porMes).sort((a, b) => a.mes.localeCompare(b.mes)).map(m => ({
        ...m,
        litrosSig: Math.round(m.litrosSig),
        kmSig: Math.round(m.kmSig),
        litrosEcu: Math.round(m.litrosEcu),
        kmEcu: Math.round(m.kmEcu),
        rendSig: m.litrosSig > 0 ? Math.round((m.kmSig / m.litrosSig) * 100) / 100 : 0,
        rendEcu: m.litrosEcu > 0 ? Math.round((m.kmEcu / m.litrosEcu) * 100) / 100 : 0,
        diffLitros: Math.round(m.litrosSig - m.litrosEcu),
        promLitrosCarga: m.cargasSig > 0 ? Math.round(m.litrosSig / m.cargasSig) : 0,
        promKmViaje: m.viajesEcu > 0 ? Math.round(m.kmEcu / m.viajesEcu) : 0,
      }));

      const totalMeses = historialMensual.length;
      const promedios = {
        cargasMes: totalMeses > 0 ? Math.round(cargas.length / totalMeses) : 0,
        litrosSigMes: totalMeses > 0 ? Math.round(totalSigLt / totalMeses) : 0,
        litrosEcuMes: totalMeses > 0 ? Math.round(totalEcuLt / totalMeses) : 0,
        kmEcuMes: totalMeses > 0 ? Math.round(totalEcuKm / totalMeses) : 0,
        viajesMes: totalMeses > 0 ? Math.round(viajes.length / totalMeses) : 0,
      };

      res.json({
        conductor: nombre,
        resumen: {
          totalViajes: viajes.length,
          totalCargas: cargas.length,
          totalEcuLt: Math.round(totalEcuLt * 10) / 10,
          totalEcuKm: Math.round(totalEcuKm),
          totalSigLt: Math.round(totalSigLt * 10) / 10,
          rendEcu: totalEcuLt > 0 ? Math.round((totalEcuKm / totalEcuLt) * 100) / 100 : 0,
          anomalias: anomalias.length,
          contratos,
          camiones,
        },
        viajes,
        cargas,
        porCamion: Object.values(porCamion).sort((a, b) => b.litrosEcu - a.litrosEcu),
        porZona: Object.values(porZona).sort((a, b) => b.litros - a.litros),
        historialMensual,
        promedios,
      });
    } catch (error: any) {
      console.error("[conductores] Error detalle:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/geo/viajes-tms", async (req: Request, res: Response) => {
    try {
      const patenteFilter = req.query.patente as string || "";
      const desde = req.query.desde as string || getDefaultDesde().toISOString().slice(0,10);
      const contrato = (req.query.contrato as string || "TODOS").toUpperCase();
      let faenaIds: number[];
      if (contrato === "TODOS" || contrato === "ALL") {
        const faenas = await storage.getFaenas();
        faenaIds = faenas.map(f => f.id);
      } else {
        const config = await getContractConfig(contrato);
        faenaIds = config.faenaIds;
      }

      if (faenaIds.length === 0) {
        return res.json({ viajes: [], patentes: [], total: 0 });
      }
      const fp = faenaIds.map((_, i) => `$${i + 1}`).join(",");
      let query = `
        SELECT v.id, v.codigo, c.patente, v.conductor, v.estado,
          v.origen_nombre, v.destino_nombre,
          v.fecha_salida, v.fecha_llegada, v.fecha_cierre,
          v.km_inicio, v.km_cierre, v.km_recorridos,
          v.litros_sigetra, v.litros_ecu, v.diferencia_litros,
          v.rendimiento_real, v.detectado_por_ia, v.notas
        FROM tms_viajes v
        JOIN camiones c ON v.camion_id = c.id
        WHERE c.faena_id IN (${fp}) AND v.fecha_salida >= $${faenaIds.length + 1}
      `;
      const params: any[] = [...faenaIds, desde];

      if (patenteFilter) {
        query += ` AND c.patente = $${params.length + 1}`;
        params.push(patenteFilter);
      }
      query += ` ORDER BY v.fecha_salida DESC`;

      const result = await pool.query(query, params);
      const viajes = result.rows.map(v => ({
        id: v.id,
        codigo: v.codigo,
        patente: v.patente,
        conductor: v.conductor || null,
        estado: v.estado,
        origenNombre: v.origen_nombre || null,
        destinoNombre: v.destino_nombre || null,
        fechaSalida: v.fecha_salida,
        fechaLlegada: v.fecha_llegada || null,
        fechaCierre: v.fecha_cierre || null,
        kmInicio: parseFloat(v.km_inicio) || 0,
        kmCierre: parseFloat(v.km_cierre) || 0,
        kmRecorridos: parseFloat(v.km_recorridos) || 0,
        litrosSigetra: parseFloat(v.litros_sigetra) || null,
        litrosEcu: parseFloat(v.litros_ecu) || null,
        diferenciaLitros: parseFloat(v.diferencia_litros) || null,
        rendimiento: parseFloat(v.rendimiento_real) || null,
        detectadoPorIa: v.detectado_por_ia,
        notas: v.notas,
      }));

      const patentes = [...new Set(viajes.map(v => v.patente))].sort((a, b) => parseInt(a) - parseInt(b));

      res.json({ total: viajes.length, patentes, viajes });
    } catch (error: any) {
      console.error("[geo] Error viajes TMS:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/geo/rutas-corredores", async (req: Request, res: Response) => {
    try {
      const contrato = req.query.contrato as string | undefined;

      const params: any[] = [...CONTRATOS_ACTIVOS];
      const activeFp = CONTRATOS_ACTIVOS.map((_, i) => `$${i + 1}`).join(",");
      let whereClause = `WHERE va.origen_lat IS NOT NULL AND va.destino_lat IS NOT NULL AND va.contrato IN (${activeFp})`;
      if (contrato) {
        params.push(contrato);
        whereClause += ` AND va.contrato = $${params.length}`;
      }

      const viajesResult = await pool.query(`
        SELECT va.id, va.contrato, va.camion_id, c.patente,
          va.origen_lat::float as origen_lat, va.origen_lng::float as origen_lng,
          va.origen_nombre,
          va.destino_lat::float as destino_lat, va.destino_lng::float as destino_lng,
          va.destino_nombre,
          va.km_ecu::float as km_ecu,
          va.litros_consumidos_ecu::float as litros_ecu,
          va.litros_cargados_sigetra::float as litros_sigetra,
          va.rendimiento_real::float as rendimiento,
          va.score_anomalia::int as score,
          va.estado, va.conductor,
          va.fecha_inicio, va.fecha_fin,
          va.duracion_minutos::int as duracion_min
        FROM viajes_aprendizaje va
        JOIN camiones c ON va.camion_id = c.id
        ${whereClause}
          AND c.vin IS NOT NULL AND c.vin != ''
        ORDER BY va.contrato, va.fecha_inicio DESC
      `, params);

      const viajes = viajesResult.rows;

      const gpsResult = await pool.query(`
        SELECT gp.camion_id, gp.lat::float as lat, gp.lng::float as lng,
          gp.timestamp_punto, gp.velocidad_kmh::float as vel
        FROM geo_puntos gp
        WHERE gp.camion_id IN (
          SELECT DISTINCT va.camion_id FROM viajes_aprendizaje va
          ${whereClause}
        )
        ORDER BY gp.camion_id, gp.timestamp_punto
      `, params);

      const gpsByCamion = new Map<number, any[]>();
      for (const p of gpsResult.rows) {
        if (!gpsByCamion.has(p.camion_id)) gpsByCamion.set(p.camion_id, []);
        gpsByCamion.get(p.camion_id)!.push(p);
      }

      const corredoresMap = new Map<string, {
        id: string;
        contrato: string;
        origenLat: number;
        origenLng: number;
        destinoLat: number;
        destinoLng: number;
        origenNombre: string;
        destinoNombre: string;
        viajes: number;
        camiones: Set<string>;
        totalKm: number;
        totalLitros: number;
        viajeIds: number[];
      }>();

      // Radio estándar 1km para todas las faenas
      // Excepto mineras que usan radio más amplio
      const FAENAS_MINERAS_GEO = ["ZALDIVAR", "GLENCORE", "ANGLO", "CODELCO", "CENTINELA", "MANTOS", "SIERRA ATACAMA", "MINISTRO HALES"];
      function clusterRadius(kmViaje: number, contrato?: string): number {
        if (contrato && FAENAS_MINERAS_GEO.some(f => contrato.toUpperCase().includes(f))) {
          if (kmViaje < 100) return 5;
          if (kmViaje < 300) return 8;
          return 8;
        }
        return 1; // 1km = 1000m para todas las demás
      }

      function getNombrePunto(lat: number, lng: number, contrato: string): string {
        const lugar = buscarLugarCercano(lat, lng, contrato);
        if (lugar) return lugar.nombre;
        const lugarGeneral = buscarLugarCercano(lat, lng);
        if (lugarGeneral) return lugarGeneral.nombre;
        return `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
      }

      for (const v of viajes) {
        if (!v.origen_lat || !v.destino_lat) continue;
        const distViaje = haversineKm(v.origen_lat, v.origen_lng, v.destino_lat, v.destino_lng);
        const radio = clusterRadius(v.km_ecu || distViaje);
        let matched = false;
        for (const [key, corr] of corredoresMap) {
          if (corr.contrato !== v.contrato) continue;
          const dOrigen = haversineKm(corr.origenLat, corr.origenLng, v.origen_lat, v.origen_lng);
          const dDestino = haversineKm(corr.destinoLat, corr.destinoLng, v.destino_lat, v.destino_lng);
          if (dOrigen <= radio && dDestino <= radio) {
            corr.viajes++;
            corr.camiones.add(v.patente);
            corr.totalKm += (v.km_ecu || 0);
            corr.totalLitros += (v.litros_ecu || 0);
            corr.viajeIds.push(v.id);
            matched = true;
            break;
          }
        }
        if (!matched) {
          const oNombre = getNombrePunto(v.origen_lat, v.origen_lng, v.contrato);
          const dNombre = getNombrePunto(v.destino_lat, v.destino_lng, v.contrato);
          const coordKey = `${v.origen_lat.toFixed(2)}_${v.origen_lng.toFixed(2)}_${v.destino_lat.toFixed(2)}_${v.destino_lng.toFixed(2)}`;
          const key = `${v.contrato}-${coordKey}`;
          corredoresMap.set(key, {
            id: key,
            contrato: v.contrato,
            origenLat: v.origen_lat,
            origenLng: v.origen_lng,
            destinoLat: v.destino_lat,
            destinoLng: v.destino_lng,
            origenNombre: oNombre,
            destinoNombre: dNombre,
            viajes: 1,
            camiones: new Set([v.patente]),
            totalKm: v.km_ecu || 0,
            totalLitros: v.litros_ecu || 0,
            viajeIds: [v.id],
          });
        }
      }

      const corredores = [...corredoresMap.values()].map(c => ({
        id: c.id,
        contrato: c.contrato,
        origenLat: c.origenLat,
        origenLng: c.origenLng,
        origenNombre: c.origenNombre,
        destinoLat: c.destinoLat,
        destinoLng: c.destinoLng,
        destinoNombre: c.destinoNombre,
        nombre: `${c.origenNombre} → ${c.destinoNombre}`,
        viajes: c.viajes,
        camiones: c.camiones.size,
        kmPromedio: c.viajes > 0 ? Math.round(c.totalKm / c.viajes * 10) / 10 : 0,
        rendPromedio: c.totalLitros > 0 ? Math.round(c.totalKm / c.totalLitros * 100) / 100 : 0,
        totalKm: Math.round(c.totalKm),
        patentesList: [...c.camiones].sort(),
      })).sort((a, b) => b.viajes - a.viajes);

      const byContrato: Record<string, { viajes: number; corredores: number; camiones: Set<string>; totalKm: number }> = {};
      for (const v of viajes) {
        if (!byContrato[v.contrato]) byContrato[v.contrato] = { viajes: 0, corredores: 0, camiones: new Set(), totalKm: 0 };
        byContrato[v.contrato].viajes++;
        byContrato[v.contrato].camiones.add(v.patente);
        byContrato[v.contrato].totalKm += v.km_ecu;
      }
      for (const c of corredores) {
        if (byContrato[c.contrato]) byContrato[c.contrato].corredores++;
      }

      const contratoStats = Object.entries(byContrato).map(([name, data]) => ({
        contrato: name,
        viajes: data.viajes,
        corredores: data.corredores,
        camiones: data.camiones.size,
        totalKm: Math.round(data.totalKm),
        pctViajes: Math.round(data.viajes / viajes.length * 100),
      })).sort((a, b) => b.viajes - a.viajes);

      const viajesConGps = viajes.map(v => {
        const puntos = gpsByCamion.get(v.camion_id) || [];
        const puntosViaje = puntos.filter((p: any) => {
          const t = new Date(p.timestamp_punto).getTime();
          return t >= new Date(v.fecha_inicio).getTime() && t <= new Date(v.fecha_fin).getTime();
        });
        return {
          ...v,
          breadcrumbs: puntosViaje.map((p: any) => ({ lat: p.lat, lng: p.lng })),
        };
      });

      res.json({
        totalViajes: viajes.length,
        totalCorredores: corredores.length,
        totalCamiones: new Set(viajes.map(v => v.patente)).size,
        corredores,
        contratoStats,
        viajes: viajesConGps,
        lugaresConocidos: LUGARES_CONOCIDOS.map(l => ({
          nombre: l.nombre,
          lat: l.lat,
          lng: l.lng,
          tipo: l.tipo,
          radio_km: l.radio_km,
        })),
      });
    } catch (error: any) {
      console.error("[geo] Error rutas corredores:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/geo/lugares-conocidos", async (_req: Request, res: Response) => {
    res.json(LUGARES_CONOCIDOS.map(l => ({
      nombre: l.nombre,
      lat: l.lat,
      lng: l.lng,
      tipo: l.tipo,
      radio_km: l.radio_km,
      contratos: l.contratos || [],
    })));
  });

  app.post("/api/geo/geocodificar-viajes", async (_req: Request, res: Response) => {
    try {
      const viajesResult = await pool.query(`
        SELECT id, contrato, 
               origen_lat::float as olat, origen_lng::float as olng, origen_nombre,
               destino_lat::float as dlat, destino_lng::float as dlng, destino_nombre
        FROM viajes_aprendizaje
        WHERE (origen_nombre IS NULL OR origen_nombre = '' OR destino_nombre IS NULL OR destino_nombre = '')
          AND origen_lat IS NOT NULL AND destino_lat IS NOT NULL
      `);

      let updated = 0;
      for (const v of viajesResult.rows) {
        const oNombre = v.origen_nombre || (v.olat ? (buscarLugarCercano(v.olat, v.olng, v.contrato)?.nombre || buscarLugarCercano(v.olat, v.olng)?.nombre || null) : null);
        const dNombre = v.destino_nombre || (v.dlat ? (buscarLugarCercano(v.dlat, v.dlng, v.contrato)?.nombre || buscarLugarCercano(v.dlat, v.dlng)?.nombre || null) : null);

        if (oNombre || dNombre) {
          await pool.query(`
            UPDATE viajes_aprendizaje 
            SET origen_nombre = COALESCE($1, origen_nombre),
                destino_nombre = COALESCE($2, destino_nombre)
            WHERE id = $3
          `, [oNombre, dNombre, v.id]);
          updated++;
        }
      }

      res.json({ message: `Geocodificados ${updated} viajes de ${viajesResult.rows.length} sin nombre`, updated, total: viajesResult.rows.length });
    } catch (error: any) {
      console.error("[geo] Error geocodificando viajes:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/geo/viaje-puntos/:patente", async (req: Request, res: Response) => {
    try {
      const { patente } = req.params;
      const desde = req.query.desde as string;
      const hasta = req.query.hasta as string;

      if (!patente || !desde || !hasta) {
        return res.status(400).json({ message: "patente, desde, hasta required" });
      }

      const result = await pool.query(`
        SELECT lat::float as lat, lng::float as lng,
               velocidad_kmh::float as velocidad,
               timestamp_punto as timestamp,
               km_odometro::float as km_odometro
        FROM geo_puntos
        WHERE patente = $1
          AND timestamp_punto >= $2::timestamp
          AND timestamp_punto <= $3::timestamp
        ORDER BY timestamp_punto ASC
      `, [patente, desde, hasta]);

      res.json({
        patente,
        total_puntos: result.rows.length,
        tiene_gps: result.rows.length > 0,
        puntos: result.rows,
      });
    } catch (error: any) {
      console.error("[GEO-V2] viaje-puntos:", error.message);
      res.status(500).json({ message: error.message });
    }
  });
  app.get("/api/camiones/:patente/mapa-mes", async (req: Request, res: Response) => {
    try {
      const { patente } = req.params;

      const camionResult = await pool.query(
        `SELECT id, vin, patente, modelo, faena_id FROM camiones WHERE patente = $1 LIMIT 1`,
        [patente]
      );
      if (camionResult.rows.length === 0) {
        return res.status(404).json({ message: `Camion ${patente} no encontrado` });
      }
      const camion = camionResult.rows[0];
      const camionId = camion.id;

      let contrato = "X ASIGNAR";
      if (camion.faena_id) {
        const faenaResult = await pool.query(`SELECT nombre FROM faenas WHERE id = $1`, [camion.faena_id]);
        if (faenaResult.rows.length > 0) {
          const fn = faenaResult.rows[0].nombre?.toUpperCase() || "";
          if (fn.includes("CENCOSUD")) contrato = "CENCOSUD";
        }
      }

      const now = new Date();
      const desde = req.query.desde as string || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const ahora = req.query.hasta as string || now.toISOString();

      const viajesResult = await pool.query(`
        SELECT id, fecha_inicio, fecha_fin,
               origen_lat::float as origen_lat, origen_lng::float as origen_lng, origen_nombre,
               destino_lat::float as destino_lat, destino_lng::float as destino_lng, destino_nombre,
               km_ecu::float as km_ecu, litros_consumidos_ecu::float as litros,
               rendimiento_real::float as rendimiento,
               conductor, velocidad_promedio::float as vel_prom, velocidad_maxima::float as vel_max,
               duracion_minutos, estado, score_anomalia,
               paradas
        FROM viajes_aprendizaje
        WHERE camion_id = $1 AND fecha_inicio >= $2
        ORDER BY fecha_inicio ASC
      `, [camionId, desde]);

      const cargasResult = await pool.query(`
        SELECT id, fecha, litros_surtidor as litros, proveedor, lugar_consumo,
               km_anterior, km_actual, conductor, rend_real, desviacion
        FROM cargas
        WHERE patente = $1 AND fecha >= $2
        ORDER BY fecha ASC
      `, [patente, desde]);

      const gpsResult = await pool.query(`
        SELECT lat::float as lat, lng::float as lng,
               velocidad_kmh::float as velocidad,
               timestamp_punto as timestamp
        FROM geo_puntos
        WHERE patente = $1 AND timestamp_punto >= $2::timestamp
        ORDER BY timestamp_punto ASC
      `, [patente, desde]);

      const viajes = viajesResult.rows.map((v: any) => ({
        ...v,
        paradas: v.paradas || [],
      }));

      const cargasConGeo: any[] = [];
      for (const c of cargasResult.rows) {
        const lugar = c.lugar_consumo || c.proveedor || "Desconocido";
        cargasConGeo.push({ ...c, lugar });
      }

      const gpsSampled = gpsResult.rows.length > 2000
        ? gpsResult.rows.filter((_: any, i: number) => i % Math.ceil(gpsResult.rows.length / 2000) === 0)
        : gpsResult.rows;

      const totalKm = viajes.reduce((s: number, v: any) => s + (v.km_ecu || 0), 0);
      const totalLitros = viajes.reduce((s: number, v: any) => s + (v.litros || 0), 0);
      const totalLitrosCargados = cargasResult.rows.reduce((s: number, c: any) => s + (c.litros || 0), 0);
      const rendProm = totalKm > 0 && totalLitros > 0 ? totalKm / totalLitros : 0;
      const diasActivo = new Set(viajes.map((v: any) => v.fecha_inicio?.toISOString?.()?.slice(0, 10) || "")).size;

      res.json({
        camion: {
          patente: camion.patente,
          vin: camion.vin,
          modelo: camion.modelo,
          contrato,
        },
        resumen: {
          totalViajes: viajes.length,
          totalKm: Math.round(totalKm),
          totalLitrosEcu: Math.round(totalLitros),
          totalLitrosCargados: Math.round(totalLitrosCargados),
          rendimientoPromedio: Math.round(rendProm * 100) / 100,
          diasActivo,
          totalCargas: cargasResult.rows.length,
          totalPuntosGps: gpsResult.rows.length,
        },
        viajes,
        cargas: cargasConGeo,
        gps: gpsSampled,
        periodo: { desde, hasta: ahora.slice(0, 10) },
      });
    } catch (error: any) {
      console.error("[mapa-mes] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

}
