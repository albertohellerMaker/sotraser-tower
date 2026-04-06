import { Router } from "express";
import { fetchSeguimiento, getWiseTrackStatus, startWiseTrackSync, stopWiseTrackSync, fetchTelemetriaAPI, type SeguimientoVehicle } from "./wisetrack-scraper";
import { pool } from "./db";

const router = Router();

router.get("/api/wisetrack/en-vivo", async (_req, res) => {
  try {
    const vehicles = await fetchSeguimiento("CENCOSUD");
    const enriched = vehicles.map((v: SeguimientoVehicle) => {
      let estado: "en_ruta" | "detenido" | "ralenti" | "sin_senal" = "sin_senal";
      if (v.estadoOperacion === "En Movimiento" || v.velocidad > 5) estado = "en_ruta";
      else if (v.estadoOperacion === "Ralenti") estado = "ralenti";
      else if (v.estadoOperacion === "Detenido" || v.velocidad === 0) estado = "detenido";
      if (v.estadoOperacion === "Sin Lectura") estado = "sin_senal";

      const santiago = new Date().toLocaleString("en-US", { timeZone: "America/Santiago" });
      const localNow = new Date(santiago);
      const utcNow = new Date();
      const offsetMs = localNow.getTime() - utcNow.getTime();
      const offsetHours = Math.round(offsetMs / 3600000);
      const sign = offsetHours >= 0 ? "+" : "-";
      const abs = Math.abs(offsetHours);
      const isoOffset = `${sign}${String(abs).padStart(2, "0")}:00`;
      const fechaMs = new Date(v.fecha.replace(" ", "T") + isoOffset).getTime();
      const minutosAgo = isNaN(fechaMs) ? 9999 : (Date.now() - fechaMs) / 60000;
      if (minutosAgo > 60) estado = "sin_senal";

      return {
        patente: v.patente,
        etiqueta: v.etiqueta,
        lat: v.lat,
        lng: v.lng,
        velocidad: v.velocidad,
        heading: v.direccion,
        estado,
        estadoWt: v.estadoOperacion,
        ignicion: v.ignicion,
        conductor: v.conductor,
        grupo1: v.grupo1,
        kmsTotal: v.kmsTotal,
        nivelEstanque: v.nivelEstanque,
        rpm: v.rpm,
        tempMotor: v.tempMotor,
        fecha: v.fecha,
        minutosAgo: Math.round(minutosAgo),
        ultimoViaje: {
          inicio: v.fechaInicioUltViaje,
          fin: v.fechaFinUltViaje,
          kms: v.kms,
        },
      };
    });

    const resumen = {
      total: enriched.length,
      en_ruta: enriched.filter((v) => v.estado === "en_ruta").length,
      detenido: enriched.filter((v) => v.estado === "detenido").length,
      ralenti: enriched.filter((v) => v.estado === "ralenti").length,
      sin_senal: enriched.filter((v) => v.estado === "sin_senal").length,
    };

    res.json({ vehiculos: enriched, resumen, timestamp: new Date().toISOString() });
  } catch (err: any) {
    console.error("[WISETRACK-API] en-vivo error:", err.message);
    res.status(500).json({ error: "Error al obtener datos WiseTrack" });
  }
});

router.get("/api/wisetrack/flota", async (_req, res) => {
  try {
    const vehicles = await fetchSeguimiento("CENCOSUD");
    const flota = vehicles.map((v) => ({
      patente: v.patente,
      etiqueta: v.etiqueta,
      conductor: v.conductor,
      kmsTotal: v.kmsTotal,
      consumoLitros: v.consumoLitros,
      nivelEstanque: v.nivelEstanque,
      rpm: v.rpm,
      tempMotor: v.tempMotor,
      tiempoConduccion: v.tiempoConduccion,
      tiempoRalenti: v.tiempoRalenti,
      estadoOperacion: v.estadoOperacion,
      ultimoViaje: {
        inicio: v.fechaInicioUltViaje,
        fin: v.fechaFinUltViaje,
        kms: v.kms,
      },
    }));
    res.json({ flota, total: flota.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/wisetrack/historial/:patente", async (req, res) => {
  try {
    const { patente } = req.params;
    const horas = parseInt(req.query.horas as string) || 24;
    const result = await pool.query(
      `SELECT * FROM wisetrack_posiciones 
       WHERE patente = $1 AND creado_at > NOW() - INTERVAL '1 hour' * $2
       ORDER BY fecha DESC LIMIT 500`,
      [patente, horas]
    );
    res.json({ patente, puntos: result.rows, total: result.rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/wisetrack/status", async (_req, res) => {
  try {
    const status = getWiseTrackStatus();
    let totalRegistros = 0;
    let totalTelemetria = 0;
    try {
      const countResult = await pool.query("SELECT COUNT(*) as total FROM wisetrack_posiciones");
      totalRegistros = parseInt(countResult.rows[0].total);
    } catch {}
    try {
      const countResult2 = await pool.query("SELECT COUNT(*) as total FROM wisetrack_telemetria");
      totalTelemetria = parseInt(countResult2.rows[0].total);
    } catch {}
    res.json({ ...status, totalRegistros, totalTelemetria });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/wisetrack/telemetria/:movil", async (req, res) => {
  try {
    const { movil } = req.params;
    const horas = parseInt(req.query.horas as string) || 24;
    const result = await pool.query(
      `SELECT * FROM wisetrack_telemetria 
       WHERE movil = $1 AND creado_at > NOW() - INTERVAL '1 hour' * $2
       ORDER BY fecha_hora DESC LIMIT 500`,
      [movil, horas]
    );
    res.json({ movil, registros: result.rows, total: result.rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/wisetrack/grupos", async (_req, res) => {
  try {
    const vehicles = await fetchSeguimiento();
    const grupos: Record<string, number> = {};
    vehicles.forEach((v) => {
      grupos[v.grupo1] = (grupos[v.grupo1] || 0) + 1;
    });
    const sorted = Object.entries(grupos)
      .sort((a, b) => b[1] - a[1])
      .map(([nombre, cantidad]) => ({ nombre, cantidad }));
    res.json({ grupos: sorted, totalVehiculos: vehicles.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══ WISETRACK TMS EN VIVO — Same format as /api/cencosud/en-vivo but with WiseTrack GPS ═══
router.get("/api/wisetrack/tms/en-vivo", async (_req, res) => {
  try {
    const ahora = new Date();
    const vehicles = await fetchSeguimiento("CENCOSUD");

    const TRANSITO_PATTERNS = [
      'peaje', 'copec', 'descanso', 'pesaje', 'hosteria', 'estacionamiento',
      'watts', 'prolesur', 'kaufman', 'embonor', 'blue express', 'tiltil',
      'sotraser', 'bodegas san francisco',
    ];
    function isCD(nombre: string): boolean {
      const n = nombre.toLowerCase();
      return n.startsWith('cd ') || n.includes('centro de distribución') || n.includes('centro de transferencia');
    }
    function isTransito(nombre: string): boolean {
      const n = nombre.toLowerCase();
      return TRANSITO_PATTERNS.some(p => n.includes(p));
    }

    const [geocercasRes, aliasRes] = await Promise.all([
      pool.query(`SELECT nombre, lat, lng, poligono FROM cencosud_geocercas_kml WHERE lat IS NOT NULL AND lat != 0`),
      pool.query(`SELECT geocerca_nombre, nombre_contrato FROM geocerca_alias_contrato WHERE contrato = 'CENCOSUD' AND confirmado = true`),
    ]);

    const aliasMap = new Map<string, string>();
    for (const a of aliasRes.rows as any[]) {
      aliasMap.set(a.geocerca_nombre.toLowerCase(), a.nombre_contrato);
    }

    const geocercas = (geocercasRes.rows as any[]).map(g => {
      const nc = aliasMap.get(g.nombre.toLowerCase()) || g.nombre;
      return {
        nombre: g.nombre, nombre_contrato: nc,
        lat: parseFloat(g.lat), lng: parseFloat(g.lng),
        poligono: g.poligono && Array.isArray(g.poligono) && g.poligono.length >= 3 ? g.poligono : null,
        tipo: isCD(nc) ? "cd" as const : isTransito(nc) ? "transito" as const : "tienda" as const,
      };
    });

    const cds = geocercas.filter(g => g.tipo === "cd");
    const tiendas = geocercas.filter(g => g.tipo === "tienda");

    function pipCheck(lat: number, lng: number, poligono: [number, number][]): boolean {
      let inside = false;
      for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
        const yi = poligono[i][0], xi = poligono[i][1];
        const yj = poligono[j][0], xj = poligono[j][1];
        if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
      }
      return inside;
    }
    function hav(lat1: number, lon1: number, lat2: number, lon2: number): number {
      const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180; const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    function findGeocerca(lat: number, lng: number) {
      for (const g of geocercas) {
        if (g.poligono) { if (pipCheck(lat, lng, g.poligono)) return g; }
        else if (hav(lat, lng, g.lat, g.lng) < 0.5) return g;
      }
      return null;
    }
    function findNearestOfType(lat: number, lng: number, list: typeof geocercas, exclude?: string) {
      let best = null; let bestDist = Infinity;
      const seen = new Set<string>();
      for (const g of list) {
        const nc = g.nombre_contrato;
        if (seen.has(nc)) continue; seen.add(nc);
        if (exclude && nc === exclude) continue;
        const d = hav(lat, lng, g.lat, g.lng);
        if (d < bestDist) { bestDist = d; best = g; }
      }
      return best ? { geo: best, dist: Math.round(bestDist) } : null;
    }

    const enRuta: any[] = [];
    const enCD: any[] = [];
    const sinGps: any[] = [];

    function parseWTDate(fechaStr: string): number {
      const santiago = new Date().toLocaleString("en-US", { timeZone: "America/Santiago" });
      const localNow = new Date(santiago);
      const utcNow = new Date();
      const offsetMs = localNow.getTime() - utcNow.getTime();
      const offsetHours = Math.round(offsetMs / 3600000);
      const sign = offsetHours >= 0 ? "+" : "-";
      const abs = Math.abs(offsetHours);
      const isoOffset = `${sign}${String(abs).padStart(2, "0")}:00`;
      const iso = fechaStr.replace(" ", "T") + isoOffset;
      const ms = new Date(iso).getTime();
      return isNaN(ms) ? 0 : ms;
    }

    for (const v of vehicles) {
      const lat = v.lat;
      const lng = v.lng;
      const fechaMs = parseWTDate(v.fecha);
      const minutosDesde = fechaMs > 0 ? (Date.now() - fechaMs) / 60000 : 9999;

      if (!lat || !lng || minutosDesde > 120 || v.estadoOperacion === "Sin Lectura") {
        sinGps.push({
          patente: v.patente, etiqueta: v.etiqueta, lat, lng,
          ultimo_gps: v.fecha, minutos_sin_gps: Math.round(minutosDesde),
          conductor: v.conductor,
        });
        continue;
      }

      const geoActual = findGeocerca(lat, lng);

      if (geoActual && geoActual.tipo !== "transito" && v.velocidad < 5) {
        enCD.push({
          patente: v.patente, etiqueta: v.etiqueta, lat, lng,
          velocidad: v.velocidad,
          geocerca: geoActual.nombre_contrato || geoActual.nombre,
          tipo_geocerca: geoActual.tipo,
          timestamp_gps: v.fecha,
          conductor: v.conductor,
          rpm: v.rpm, nivelEstanque: v.nivelEstanque, tempMotor: v.tempMotor,
        });
      } else {
        let fase: "ida" | "vuelta" | "desconocido" = "desconocido";
        let destino: { nombre: string; lat: number; lng: number; km_restante: number } | null = null;

        const nearCD = findNearestOfType(lat, lng, cds);
        const nearTienda = findNearestOfType(lat, lng, tiendas);

        if (nearCD && nearTienda) {
          if (nearCD.dist < nearTienda.dist) {
            fase = "vuelta";
            destino = { nombre: nearCD.geo.nombre_contrato || nearCD.geo.nombre, lat: nearCD.geo.lat, lng: nearCD.geo.lng, km_restante: nearCD.dist };
          } else {
            fase = "ida";
            destino = { nombre: nearTienda.geo.nombre_contrato || nearTienda.geo.nombre, lat: nearTienda.geo.lat, lng: nearTienda.geo.lng, km_restante: nearTienda.dist };
          }
        } else if (nearTienda) {
          fase = "ida";
          destino = { nombre: nearTienda.geo.nombre_contrato || nearTienda.geo.nombre, lat: nearTienda.geo.lat, lng: nearTienda.geo.lng, km_restante: nearTienda.dist };
        } else if (nearCD) {
          fase = "vuelta";
          destino = { nombre: nearCD.geo.nombre_contrato || nearCD.geo.nombre, lat: nearCD.geo.lat, lng: nearCD.geo.lng, km_restante: nearCD.dist };
        }

        enRuta.push({
          patente: v.patente, etiqueta: v.etiqueta, lat, lng,
          velocidad: v.velocidad, rumbo: v.direccion,
          timestamp_gps: v.fecha, conductor: v.conductor,
          fase,
          origen: nearCD ? { nombre: nearCD.geo.nombre_contrato || nearCD.geo.nombre, lat: nearCD.geo.lat, lng: nearCD.geo.lng } : null,
          hora_salida: null,
          km_recorridos: Math.round(v.kms || 0),
          entrega: null,
          destino_probable: destino,
          rpm: v.rpm, nivelEstanque: v.nivelEstanque, tempMotor: v.tempMotor,
        });
      }
    }

    enRuta.sort((a, b) => (b.km_recorridos || 0) - (a.km_recorridos || 0));

    const geocercasMap: any[] = [];
    const seenGeo = new Set<string>();
    for (const g of geocercas) {
      if (g.tipo === "transito") continue;
      const nc = g.nombre_contrato || g.nombre;
      if (seenGeo.has(nc)) continue; seenGeo.add(nc);
      geocercasMap.push({ nombre: nc, lat: g.lat, lng: g.lng, tipo: g.tipo });
    }

    res.json({
      timestamp: ahora.toISOString(),
      resumen: { total_cencosud: vehicles.length, en_ruta: enRuta.length, en_cd: enCD.length, sin_gps: sinGps.length },
      en_ruta: enRuta, en_cd: enCD, sin_gps: sinGps,
      geocercas: geocercasMap,
      fuente: "wisetrack",
    });
  } catch (err: any) {
    console.error("[WT-TMS-EN-VIVO]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══ WISETRACK TMS: GPS trail from wisetrack_posiciones ═══
router.get("/api/wisetrack/tms/en-vivo/trail/:patente", async (req, res) => {
  try {
    const { patente } = req.params;
    const hoyStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
    const result = await pool.query(`
      SELECT lat, lng, velocidad, fecha as timestamp_gps, rpm
      FROM wisetrack_posiciones
      WHERE patente = $1 AND DATE(fecha) = $2
      ORDER BY fecha ASC
    `, [patente, hoyStr]);
    res.json({ patente, puntos: result.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
