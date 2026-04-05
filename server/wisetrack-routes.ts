import { Router } from "express";
import { fetchSeguimiento, getWiseTrackStatus, startWiseTrackSync, stopWiseTrackSync } from "./wisetrack-scraper";
import { pool } from "./db";

const router = Router();

router.get("/api/wisetrack/en-vivo", async (_req, res) => {
  try {
    const vehicles = await fetchSeguimiento("CENCOSUD");
    const enriched = vehicles.map((v) => {
      let estado: "en_ruta" | "detenido" | "ralenti" | "sin_senal" = "sin_senal";
      if (v.estadoOperacion === "En Movimiento" || v.velocidad > 5) estado = "en_ruta";
      else if (v.estadoOperacion === "Ralenti") estado = "ralenti";
      else if (v.estadoOperacion === "Detenido" || v.velocidad === 0) estado = "detenido";
      if (v.estadoOperacion === "Sin Lectura") estado = "sin_senal";

      const chileTz = Intl.DateTimeFormat("en", { timeZone: "America/Santiago", timeZoneName: "shortOffset" }).formatToParts(new Date()).find(p => p.type === "timeZoneName")?.value || "GMT-4";
      const offset = chileTz.replace("GMT", "");
      const fechaMs = new Date(v.fecha.replace(" ", "T") + offset).getTime();
      const minutosAgo = (Date.now() - fechaMs) / 60000;
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
    try {
      const countResult = await pool.query("SELECT COUNT(*) as total FROM wisetrack_posiciones");
      totalRegistros = parseInt(countResult.rows[0].total);
    } catch {
      // table may not exist yet
    }
    res.json({ ...status, totalRegistros });
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

export default router;
