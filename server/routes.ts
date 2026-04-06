import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertFaenaSchema, insertCamionSchema, insertCargaSchema, insertTarifaRutaSchema, camiones } from "@shared/schema";
import { z } from "zod";
import { registerIARoutes } from "./ia-routes";
import { registerTMSRoutes } from "./tms-routes";
import { registerCEORoutes } from "./ceo-routes";
import { registerGeoRoutes } from "./geo-routes";
import { registerRutasGpsRoutes } from "./rutas-gps-routes";
import { registerCorredoresOperacionalesRoutes } from "./corredores-operacionales";
import { registerProductividadRoutes } from "./productividad";
import { registerCerebroRoutes } from "./cerebro-routes";
import { registerEstacionesRoutes } from "./estaciones-routes";
import { registerDriversRoutes } from "./drivers-routes";
import { registerSupervisionRoutes } from "./supervision-engine";
import { registerBrainRoutes } from "./brain-routes";
import { registerValidadorCruzadoRoutes } from "./validador-cruzado";
import viajesTmsRoutes from "./viajes-tms-routes";
import combustibleRoutes from "./combustible-routes";
import biRoutes from "./bi-routes";
import agentesRoutes from "./agentes-routes";
import gerenteRoutes from "./gerente-routes";
import welcomeRoutes from "./welcome-routes";
import cencosudRoutes from "./cencosud-routes";
import wisetrackRoutes from "./wisetrack-routes";
import { towerRoutes } from "./tower-routes";

import conductorRoutes from "./conductor-routes";
import conductorPanelRoutes from "./conductor-panel-routes";
import { syncViajesHistorico, getSyncProgress, getViajesStats, buscarLugarCercano, clusterizarCorredores, recalcularScoresConCorredor, getCorredoresStats } from "./viajes-historico";
import { detectarParadas } from "./paradas-detector";
import { getAllContracts, getContractConfig, getContractPatentes, getContractCamiones, invalidateCache as invalidateFaenaCache } from "./faena-filter";
import { db, pool, DATA_START, getDefaultDesde } from "./db";
import { eq } from "drizzle-orm";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/faenas", async (_req, res) => {
    const faenas = await storage.getFaenas();
    res.json(faenas);
  });

  app.get("/api/contratos", async (req, res) => {
    try {
      const contracts = await getAllContracts(false);
      res.json(contracts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/faenas", async (req, res) => {
    const parsed = insertFaenaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const faena = await storage.createFaena(parsed.data);
    res.json(faena);
  });

  app.patch("/api/faenas/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const parsed = insertFaenaSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const updated = await storage.updateFaena(id, parsed.data);
    if (!updated) return res.status(404).json({ message: "Faena not found" });
    res.json(updated);
  });

  app.delete("/api/faenas/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    await storage.deleteFaena(id);
    res.json({ success: true });
  });

  app.get("/api/camiones", async (req, res) => {
    const cams = await storage.getCamiones();
    const faenaIdFilter = req.query.faenaId ? parseInt(req.query.faenaId as string) : null;
    let filtered = cams.filter(c => c.activo !== false);
    if (faenaIdFilter) {
      filtered = filtered.filter(c => c.faenaId === faenaIdFilter);
    }
    res.json(filtered);
  });

  app.get("/api/camiones/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const cam = await storage.getCamion(id);
    if (!cam) return res.status(404).json({ message: "Camion not found" });
    res.json(cam);
  });

  app.post("/api/camiones", async (req, res) => {
    const parsed = insertCamionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const cam = await storage.createCamion(parsed.data);
    res.json(cam);
  });

  app.patch("/api/camiones/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const parsed = insertCamionSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const updated = await storage.updateCamion(id, parsed.data);
    if (!updated) return res.status(404).json({ message: "Camion not found" });
    res.json(updated);
  });

  app.delete("/api/camiones/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    await storage.deleteCamion(id);
    res.json({ success: true });
  });

  app.get("/api/cargas", async (req, res) => {
    const camionId = req.query.camionId ? parseInt(req.query.camionId as string) : undefined;
    const cargasList = await storage.getCargas(camionId);
    res.json(cargasList);
  });

  app.post("/api/cargas", async (req, res) => {
    const parsed = insertCargaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const carga = await storage.createCarga(parsed.data);
    res.json(carga);
  });

  app.delete("/api/cargas/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    await storage.deleteCarga(id);
    res.json({ success: true });
  });

  app.get("/api/desviaciones/checks", async (_req, res) => {
    try {
      const checks = await storage.getDesviacionChecks();
      res.json(checks);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/desviaciones/check", async (req, res) => {
    try {
      const { fleetNum, tipo, gestionado, nota } = req.body;
      if (!fleetNum || typeof fleetNum !== "string") return res.status(400).json({ message: "fleetNum (string) required" });
      if (!tipo || typeof tipo !== "string") return res.status(400).json({ message: "tipo (string) required" });
      if (typeof gestionado !== "boolean") return res.status(400).json({ message: "gestionado (boolean) required" });
      const check = await storage.upsertDesviacionCheck(fleetNum, tipo, gestionado, typeof nota === "string" ? nota : undefined);
      res.json(check);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/sigetra/status", async (_req, res) => {
    res.json({ connected: false, message: "Sigetra removido — WiseTrack API activo", user: "" });
  });

  app.get("/api/parametros", async (_req, res) => {
    try {
      const params = await storage.getParametros();
      res.json(params);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/flota/percentiles", async (_req, res) => {
    try {
      const cached = await storage.getParametro("percentil_90");
      const now = Date.now();
      const sixHours = 6 * 60 * 60 * 1000;
      if (cached && cached.updatedAt && (now - new Date(cached.updatedAt).getTime()) < sixHours) {
        const p90 = parseFloat((await storage.getParametro("percentil_90"))?.valor || "0");
        const p75 = parseFloat((await storage.getParametro("percentil_75"))?.valor || "0");
        const p50 = parseFloat((await storage.getParametro("percentil_50"))?.valor || "0");
        const totalCamiones = parseInt((await storage.getParametro("percentil_total_camiones"))?.valor || "0");
        const fechaCalculo = cached.updatedAt;
        return res.json({ p50, p75, p90, totalCamiones, fechaCalculo, calibrando: totalCamiones < 10 });
      }

      const { pool } = await import("./db");
      const result = await pool.query(`
        WITH truck_rend AS (
          SELECT c.patente,
                 AVG(
                   CASE WHEN cg.km_actual - cg.km_anterior > 0 AND cg.litros_ecu > 0
                        THEN (cg.km_actual - cg.km_anterior)::float / cg.litros_ecu
                        ELSE NULL END
                 ) AS avg_rend,
                 COUNT(*) AS num_cargas
          FROM camiones c
          JOIN cargas cg ON cg.camion_id = c.id
          WHERE cg.fecha >= '${DATA_START.toISOString().slice(0,10)}'
          GROUP BY c.patente
          HAVING COUNT(*) >= 3
        )
        SELECT
          PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY avg_rend) AS p90,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY avg_rend) AS p75,
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY avg_rend) AS p50,
          COUNT(*) AS total_camiones
        FROM truck_rend
        WHERE avg_rend > 0 AND avg_rend < 15
      `);

      const row = result.rows[0];
      const p90 = row?.p90 ? Math.round(parseFloat(row.p90) * 100) / 100 : 0;
      const p75 = row?.p75 ? Math.round(parseFloat(row.p75) * 100) / 100 : 0;
      const p50 = row?.p50 ? Math.round(parseFloat(row.p50) * 100) / 100 : 0;
      const totalCamiones = parseInt(row?.total_camiones || "0");

      await storage.upsertParametro("percentil_90", String(p90));
      await storage.upsertParametro("percentil_75", String(p75));
      await storage.upsertParametro("percentil_50", String(p50));
      await storage.upsertParametro("percentil_total_camiones", String(totalCamiones));

      const fechaCalculo = new Date();
      res.json({ p50, p75, p90, totalCamiones, fechaCalculo, calibrando: totalCamiones < 10 });
    } catch (error: any) {
      console.error("[percentiles] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/puntos-ruta", async (req, res) => {
    try {
      const camionId = req.query.camionId ? parseInt(req.query.camionId as string) : undefined;
      const puntos = camionId ? await storage.getPuntosRutaByCamion(camionId) : await storage.getPuntosRuta();
      res.json(puntos);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/puntos-ruta/:id/confirmar", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const updated = await storage.updatePuntoRuta(id, { confirmado: true, confirmadoPor: req.body.confirmadoPor || "admin" });
      if (!updated) return res.status(404).json({ message: "Punto not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/puntos-ruta/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const { nombreInferido, tipo } = req.body;
      const data: any = {};
      if (nombreInferido !== undefined) data.nombreInferido = nombreInferido;
      if (tipo !== undefined) data.tipo = tipo;
      const updated = await storage.updatePuntoRuta(id, data);
      if (!updated) return res.status(404).json({ message: "Punto not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/tarifas/puntos-confirmados", async (_req, res) => {
    try {
      const puntos = await storage.getConfirmedPuntos();
      res.json(puntos);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/tarifas", async (_req, res) => {
    try {
      const tarifas = await storage.getTarifas();
      res.json(tarifas);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/tarifas", async (req, res) => {
    try {
      const parsed = insertTarifaRutaSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const tarifa = await storage.createTarifa(parsed.data);
      res.json(tarifa);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/tarifas/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const allowed = ["nombreRuta", "origenNombre", "destinoNombre", "distanciaKm", "litrosPromedio", "tiempoHoras", "tarifaClp", "tarifaUsd", "notas", "activa"];
      const data: any = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) data[key] = req.body[key];
      }
      if (Object.keys(data).length === 0) return res.status(400).json({ message: "No valid fields provided" });
      const updated = await storage.updateTarifa(id, data);
      if (!updated) return res.status(404).json({ message: "Tarifa not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/tarifas/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      await storage.deactivateTarifa(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/dashboard/hero", async (_req, res) => {
    try {
      const [allCamiones, allFaenas] = await Promise.all([
        storage.getCamiones(),
        storage.getFaenas(),
      ]);

      const to = new Date();
      const from30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const wtR = await pool.query(`
        WITH deltas AS (
          SELECT patente, kms_total - LAG(kms_total) OVER (PARTITION BY patente ORDER BY fecha) as dk,
            consumo_litros - LAG(consumo_litros) OVER (PARTITION BY patente ORDER BY fecha) as dl
          FROM wisetrack_posiciones WHERE fecha >= NOW() - INTERVAL '30 days' AND kms_total > 0 AND consumo_litros > 0
        )
        SELECT ROUND(SUM(GREATEST(dk,0))::numeric) as km, ROUND(SUM(GREATEST(dl,0))::numeric) as litros,
          COUNT(DISTINCT patente) as camiones_con_datos
        FROM deltas WHERE dk >= 0 AND dk < 500 AND dl >= 0 AND dl < 200
      `);
      const onlineR = await pool.query(`SELECT COUNT(DISTINCT patente) as online FROM wisetrack_posiciones WHERE fecha >= NOW() - INTERVAL '2 hours'`);
      const conductoresR = await pool.query(`SELECT COUNT(DISTINCT conductor) as total FROM wisetrack_posiciones WHERE fecha >= NOW() - INTERVAL '7 days' AND conductor IS NOT NULL AND conductor != ''`);

      const wt = wtR.rows[0] || {};
      const km30d = parseInt(wt.km || "0");
      const litros30d = parseInt(wt.litros || "0");
      const rendPromedio = litros30d > 0 ? +(km30d / litros30d).toFixed(2) : 0;

      res.json({
        totalCamiones: allCamiones.length,
        totalFaenas: allFaenas.length,
        litros30d,
        km30d,
        cargas30d: 0,
        rendPromedio,
        camionesConVin: allCamiones.filter(c => c.vin).length,
        camionesOnline: parseInt(onlineR.rows[0]?.online || "0"),
        conductores: parseInt(conductoresR.rows[0]?.total || "0"),
      });
    } catch (error: any) {
      console.error("[dashboard/hero] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/dashboard/faenas", async (_req, res) => {
    try {
      const [allFaenas, allCamiones] = await Promise.all([
        storage.getFaenas(),
        storage.getCamiones(),
      ]);

      const to = new Date();
      const from30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      let fuelData: any[] = [];
      try {
        fuelData = [];
      } catch {}

      const camionByPatente = new Map(allCamiones.map(c => [c.patente, c]));

      const fuelByFaena = new Map<string, any[]>();
      for (const rec of fuelData) {
        const faenaName = rec.faena || "Sin Faena";
        const arr = fuelByFaena.get(faenaName) || [];
        arr.push(rec);
        fuelByFaena.set(faenaName, arr);
      }

      const faenaResults = allFaenas.map(f => {
        const camionesEnFaena = allCamiones.filter(c => c.faenaId === f.id);
        const patentesEnFaena = new Set(camionesEnFaena.map(c => c.patente));

        const fuelRecs = fuelByFaena.get(f.nombre) || [];
        const totalLitros = Math.round(fuelRecs.reduce((s: number, c: any) => s + c.cantidadLt, 0));
        const validRend = fuelRecs.filter((c: any) => c.rendReal != null && c.rendReal > 0 && c.rendReal < 100);
        const rendPromedio = validRend.length > 0
          ? Math.round((validRend.reduce((s: number, c: any) => s + c.rendReal, 0) / validRend.length) * 100) / 100
          : 0;

        const criticos = validRend.filter((c: any) => c.rendReal < 1.5).length;
        const alertas = validRend.filter((c: any) => c.rendReal >= 1.5 && c.rendReal < 2.0).length;

        const patentesFuel = new Set(fuelRecs.map((c: any) => String(c.numVeh || c.patente)));
        const totalTrucks = Math.max(camionesEnFaena.length, patentesFuel.size);

        let estado: "operativa" | "alerta" | "critica" = "operativa";
        if (criticos > totalTrucks * 0.3) estado = "critica";
        else if (alertas > totalTrucks * 0.2 || criticos > 0) estado = "alerta";

        return {
          id: f.id,
          nombre: f.nombre,
          color: f.color,
          camiones: totalTrucks,
          litros30d: totalLitros,
          rendPromedio,
          criticos,
          alertas,
          estado,
        };
      });

      res.json(faenaResults);
    } catch (error: any) {
      console.error("[dashboard/faenas] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/dashboard/faena/:id", async (req, res) => {
    try {
      const faenaId = parseInt(req.params.id);
      if (isNaN(faenaId)) return res.status(400).json({ message: "Invalid ID" });

      const faena = await storage.getFaena(faenaId);
      if (!faena) return res.status(404).json({ message: "Faena no encontrada" });

      const allCamiones = await storage.getCamiones();
      const camionesEnFaena = allCamiones.filter(c => c.faenaId === faenaId);

      const to = new Date();
      const from30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      let fuelData: any[] = [];
      try {
        fuelData = [];
      } catch {}

      const fuelRecs = fuelData.filter((r: any) => r.faena === faena.nombre);
      const totalLitros = Math.round(fuelRecs.reduce((s: number, c: any) => s + (c.cantidadLt || 0), 0));
      const validRend = fuelRecs.filter((c: any) => c.rendReal != null && c.rendReal > 0 && c.rendReal < 100);
      const rendPromedio = validRend.length > 0
        ? Math.round((validRend.reduce((s: number, c: any) => s + c.rendReal, 0) / validRend.length) * 100) / 100
        : 0;
      const criticos = validRend.filter((c: any) => c.rendReal < 1.5).length;
      const alertas = validRend.filter((c: any) => c.rendReal >= 1.5 && c.rendReal < 2.0).length;

      const contratos = await storage.getTmsContratos();
      const contrato = contratos.find(c => c.faenaId === faenaId);

      let viajesData: any[] = [];
      let totalViajes = 0;
      let totalKmViajes = 0;
      if (contrato) {
        const viajes = await storage.getTmsViajes(contrato.id);
        totalViajes = viajes.length;
        totalKmViajes = Math.round(viajes.reduce((s, v) => s + (parseFloat(v.kmRecorridos || "0") || 0), 0) * 10) / 10;

        const camionMap = new Map(camionesEnFaena.map(c => [c.id, c]));

        viajesData = viajes
          .sort((a, b) => new Date(b.fechaSalida || 0).getTime() - new Date(a.fechaSalida || 0).getTime())
          .slice(0, 20)
          .map(v => ({
            id: v.id,
            codigo: v.codigo,
            camionPatente: camionMap.get(v.camionId!)?.patente || "?",
            fechaSalida: v.fechaSalida,
            estado: v.estado,
            km: parseFloat(v.kmRecorridos || "0") || 0,
            rendimiento: parseFloat(v.rendimientoReal || "0") || 0,
            litros: parseFloat(v.litrosSigetra || "0") || 0,
          }));
      }

      const fuelByPatente = new Map<string, any[]>();
      for (const r of fuelRecs) {
        const key = String(r.numVeh || r.patente);
        const arr = fuelByPatente.get(key) || [];
        arr.push(r);
        fuelByPatente.set(key, arr);
      }

      const viajeCountByPatente = new Map<string, number>();
      for (const v of viajesData) {
        viajeCountByPatente.set(v.camionPatente, (viajeCountByPatente.get(v.camionPatente) || 0) + 1);
      }

      const camionesConStats = camionesEnFaena.map(cam => {
        const camFuel = fuelByPatente.get(cam.patente) || [];
        const camLitros = Math.round(camFuel.reduce((s: number, c: any) => s + (c.cantidadLt || 0), 0));
        const camRendVals = camFuel.filter((c: any) => c.rendReal > 0 && c.rendReal < 100).map((c: any) => c.rendReal);
        const camRend = camRendVals.length > 0 ? Math.round(camRendVals.reduce((s: number, v: number) => s + v, 0) / camRendVals.length * 100) / 100 : 0;

        return {
          ...cam,
          litros30d: camLitros,
          rendimiento: camRend,
          cargas: camFuel.length,
          viajes: viajeCountByPatente.get(cam.patente) || 0,
        };
      }).sort((a, b) => b.litros30d - a.litros30d);

      const patentesFuel = new Set(fuelRecs.map((c: any) => String(c.numVeh || c.patente)));
      const totalTrucks = Math.max(camionesEnFaena.length, patentesFuel.size);

      res.json({
        faena,
        camiones: camionesConStats,
        contrato: contrato ? { id: contrato.id, nombre: contrato.nombre, totalViajes: contrato.totalViajes } : null,
        viajes: viajesData,
        resumen: {
          totalCamiones: totalTrucks,
          litros30d: totalLitros,
          rendPromedio,
          criticos,
          alertas,
          totalViajes,
          totalKmViajes,
          cargas: fuelRecs.length,
        },
      });
    } catch (error: any) {
      console.error("[dashboard/faena] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/faenas/resumen", async (_req, res) => {
    try {
      const allFaenas = await storage.getFaenas();
      const allCamiones = await storage.getCamiones();
      const contratos = await storage.getTmsContratos();

      const to = new Date();
      const from30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      let fuelData: any[] = [];
      try { fuelData = []; } catch {}

      const results = await Promise.all(allFaenas.map(async f => {
        const camionesEnFaena = allCamiones.filter(c => c.faenaId === f.id);
        if (camionesEnFaena.length === 0) return null;

        const fuelRecs = fuelData.filter((r: any) => r.faena === f.nombre);
        const totalLitros = Math.round(fuelRecs.reduce((s: number, c: any) => s + (c.cantidadLt || 0), 0));
        const validRend = fuelRecs.filter((c: any) => c.rendReal != null && c.rendReal > 0 && c.rendReal < 100);
        const rendPromedio = validRend.length > 0
          ? Math.round((validRend.reduce((s: number, c: any) => s + c.rendReal, 0) / validRend.length) * 100) / 100 : 0;

        const contrato = contratos.find(c => c.faenaId === f.id);
        let totalViajes = 0;
        let totalKm = 0;
        let viajesPorDia: Record<string, { total: number; km: number; camiones: string[] }> = {};
        let camionResumen: { patente: string; modelo: string; viajes: number; km: number; litros: number; rendimiento: number }[] = [];

        if (contrato) {
          const viajes = await storage.getTmsViajes(contrato.id);
          totalViajes = viajes.length;
          totalKm = Math.round(viajes.reduce((s, v) => s + (parseFloat(v.kmRecorridos || "0") || 0), 0) * 10) / 10;

          const camionMap = new Map(camionesEnFaena.map(c => [c.id, c]));

          for (const v of viajes) {
            const fecha = v.fechaSalida ? new Date(v.fechaSalida).toISOString().split("T")[0] : "sin-fecha";
            if (!viajesPorDia[fecha]) viajesPorDia[fecha] = { total: 0, km: 0, camiones: [] };
            viajesPorDia[fecha].total++;
            viajesPorDia[fecha].km += parseFloat(v.kmRecorridos || "0") || 0;
            const pat = camionMap.get(v.camionId!)?.patente || "?";
            if (!viajesPorDia[fecha].camiones.includes(pat)) viajesPorDia[fecha].camiones.push(pat);
          }

          for (const k of Object.keys(viajesPorDia)) {
            viajesPorDia[k].km = Math.round(viajesPorDia[k].km * 10) / 10;
          }

          const viajesByCamion = new Map<number, typeof viajes>();
          for (const v of viajes) {
            const cid = v.camionId!;
            const arr = viajesByCamion.get(cid) || [];
            arr.push(v);
            viajesByCamion.set(cid, arr);
          }

          const fuelByPatente = new Map<string, any[]>();
          for (const r of fuelRecs) {
            const key = String(r.numVeh || r.patente);
            const arr = fuelByPatente.get(key) || [];
            arr.push(r);
            fuelByPatente.set(key, arr);
          }

          camionResumen = camionesEnFaena.map(cam => {
            const cv = viajesByCamion.get(cam.id) || [];
            const cf = fuelByPatente.get(cam.patente) || [];
            const camLitros = Math.round(cf.reduce((s: number, c: any) => s + (c.cantidadLt || 0), 0));
            const rendVals = cf.filter((c: any) => c.rendReal > 0 && c.rendReal < 100).map((c: any) => c.rendReal);
            const rend = rendVals.length > 0 ? Math.round(rendVals.reduce((a: number, b: number) => a + b, 0) / rendVals.length * 100) / 100 : 0;
            return {
              patente: cam.patente,
              modelo: cam.modelo,
              viajes: cv.length,
              km: Math.round(cv.reduce((s, v) => s + (parseFloat(v.kmRecorridos || "0") || 0), 0) * 10) / 10,
              litros: camLitros,
              rendimiento: rend,
            };
          }).filter(c => c.viajes > 0 || c.litros > 0).sort((a, b) => b.viajes - a.viajes || b.km - a.km);
        }

        return {
          id: f.id,
          nombre: f.nombre,
          color: f.color,
          totalCamiones: camionesEnFaena.length,
          litros30d: totalLitros,
          rendPromedio,
          contrato: contrato ? { id: contrato.id, nombre: contrato.nombre } : null,
          totalViajes,
          totalKm,
          viajesPorDia,
          camionResumen,
        };
      }));

      res.json(results.filter(Boolean).sort((a: any, b: any) => b.totalViajes - a.totalViajes || b.litros30d - a.litros30d));
    } catch (error: any) {
      console.error("[faenas/resumen] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/faenas/en-movimiento", async (_req, res) => {
    try {
      const r = await pool.query(`
        SELECT COUNT(DISTINCT patente) FILTER (WHERE fecha >= NOW() - INTERVAL '30 minutes') as total_online,
          COUNT(DISTINCT patente) FILTER (WHERE fecha >= NOW() - INTERVAL '30 minutes' AND velocidad > 3) as en_ruta,
          COUNT(DISTINCT patente) FILTER (WHERE fecha >= NOW() - INTERVAL '30 minutes' AND velocidad <= 3) as detenidos,
          COUNT(DISTINCT patente) FILTER (WHERE fecha < NOW() - INTERVAL '2 hours') as inactivos
        FROM wisetrack_posiciones WHERE fecha >= NOW() - INTERVAL '24 hours'
      `);
      const row = r.rows[0] || {};
      res.json({
        faenas: [],
        totals: {
          totalOnline: parseInt(row.total_online || "0"),
          enRuta: parseInt(row.en_ruta || "0"),
          detenidos: parseInt(row.detenidos || "0"),
          inactivos: parseInt(row.inactivos || "0"),
          faenasActivas: 1,
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/dashboard/sistema", async (_req, res) => {
    try {
      const { getWiseTrackStatus } = await import("./wisetrack-scraper");
      const wtStatus = getWiseTrackStatus();

      const iaConfigured = !!process.env.ANTHROPIC_API_KEY;
      const iaStatus = {
        status: iaConfigured ? "available" : "not_configured",
        configured: iaConfigured,
        model: iaConfigured ? "Claude Sonnet" : null,
      };

      const now = new Date();
      const ultimoSync = now.toLocaleString("es-CL", { timeZone: "America/Santiago" });

      const healthWT = wtStatus.lastSyncAt && !wtStatus.lastSyncError ? 100 : wtStatus.lastSyncError ? 30 : 0;
      const healthIA = iaConfigured ? 100 : 0;

      res.json({
        wisetrack: { ...wtStatus, health: healthWT },
        ia: { ...iaStatus, health: healthIA },
        ultimoSync,
        healthGeneral: Math.round((healthWT + healthIA) / 2),
      });
    } catch (error: any) {
      console.error("[dashboard/sistema] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  registerIARoutes(app);
  registerTMSRoutes(app);
  registerCEORoutes(app);
  registerGeoRoutes(app);
  registerEstacionesRoutes(app);
  registerRutasGpsRoutes(app);
  registerCerebroRoutes(app);
  registerDriversRoutes(app);
  registerCorredoresOperacionalesRoutes(app);
  registerProductividadRoutes(app);
  registerSupervisionRoutes(app);
  registerBrainRoutes(app);
  registerValidadorCruzadoRoutes(app);
  app.use("/api/viajes-tms", viajesTmsRoutes);
  app.use("/api/combustible", combustibleRoutes);
  app.use("/api/bi", biRoutes);
  app.use("/api/agentes", agentesRoutes);
  app.use("/api/gerente", gerenteRoutes);
  app.use("/api/welcome", welcomeRoutes);
  app.use("/api/cencosud", cencosudRoutes);
  app.use(wisetrackRoutes);
  app.use("/api/tower", towerRoutes);

  app.use("/api/conductor", conductorRoutes);
  app.use("/api/conductor-panel", conductorPanelRoutes);

  const fusionStub = (_req: any, res: any) => {
    res.json([]);
  };
  app.get("/api/sigetra/fusion", fusionStub);
  app.get("/api/datos/fusion", fusionStub);

  // ═══════════════════════════════════════════════════
  // DATOS — MICRO-CARGAS (suspicious fuel loads from DB cargas table)
  // ═══════════════════════════════════════════════════
  app.get("/api/datos/micro-cargas", async (_req, res) => {
    try {
      const from = getDefaultDesde();
      const allCamiones = await storage.getCamiones();
      const faenas = await storage.getFaenas();
      const camiones = allCamiones;

      const cargasR = await pool.query(`
        SELECT num_guia as "numGuia", fecha as "fechaConsumo", patente,
               litros_surtidor as "cantidadLt", lugar_consumo as "lugarConsumo",
               conductor as "nombreConductor", faena, camion_id as "numVeh"
        FROM cargas WHERE fecha >= $1 AND litros_surtidor > 0
        ORDER BY fecha DESC
      `, [from]);
      const fuelData = cargasR.rows;

      const params = await storage.getParametros();
      const litrosMicro = parseFloat(params.find(p => p.clave === "litros_micro_carga")?.valor || "100");
      const nivelTanqueSospechoso = parseFloat(params.find(p => p.clave === "nivel_tanque_sospechoso_pct")?.valor || "80");

      const camionMap = new Map(camiones.map(c => [c.patente, c]));
      const camionByNumVeh = new Map(camiones.filter(c => c.numVeh).map(c => [c.numVeh!, c]));
      const faenaMap = new Map(faenas.map(f => [f.id, f]));

      const smallLoads = fuelData.filter(r => r.cantidadLt < litrosMicro && r.cantidadLt > 0);

      const dayGroups = new Map<string, typeof smallLoads>();
      for (const r of smallLoads) {
        const dateStr = r.fechaConsumo.split(" ")[0];
        const key = `${r.patente}|${dateStr}`;
        if (!dayGroups.has(key)) dayGroups.set(key, []);
        dayGroups.get(key)!.push(r);
      }
      const signalA = new Set<number>();
      for (const [, group] of dayGroups) {
        if (group.length >= 2) {
          const distinctPlaces = new Set(group.map(r => r.lugarConsumo || "").filter(Boolean));
          if (distinctPlaces.size >= 2) {
            for (const r of group) signalA.add(r.numGuia);
          }
        }
      }

      const signalB = new Set<number>();
      const signalC = new Set<number>();
      {
      }

      const suspicious: any[] = [];
      for (const r of smallLoads) {
        const signals: string[] = [];
        if (signalA.has(r.numGuia)) signals.push("MULTIPLE_DIA");
        if (signalB.has(r.numGuia)) signals.push("SIN_MOVIMIENTO");
        if (signalC.has(r.numGuia)) signals.push("TANQUE_LLENO");
        if (signals.length === 0) continue;

        const cam = camionMap.get(r.patente) || (r.numVeh ? camionByNumVeh.get(String(r.numVeh)) : null);
        const faena = cam ? faenaMap.get(cam.faenaId) : null;

        suspicious.push({
          numGuia: r.numGuia,
          patente: r.patente,
          conductor: r.nombreConductor || null,
          fecha: r.fechaConsumo,
          litros: r.cantidadLt,
          lugar: r.lugarConsumo,
          faena: faena?.nombre || r.faena || null,
          signals,
          riesgo: signals.length >= 2 ? "CRITICO" : "SOSPECHOSO",
          fuelLevelActual: null,
        });
      }

      suspicious.sort((a, b) => b.signals.length - a.signals.length || a.fecha.localeCompare(b.fecha));

      const criticos = suspicious.filter(s => s.riesgo === "CRITICO").length;
      const sospechosos = suspicious.filter(s => s.riesgo === "SOSPECHOSO").length;
      const normales = smallLoads.length - suspicious.length;

      res.json({
        registros: suspicious,
        totals: {
          criticos,
          sospechosos,
          normales,
          totalCargas: fuelData.length,
          cargasPequenas: smallLoads.length,
        },
        desde: getDefaultDesde(30).toISOString().slice(0,10),
      });
    } catch (error: any) {
      console.error("[datos] micro-cargas error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  // ═══════════════════════════════════════════════════
  // DATOS — EXCESOS DE VELOCIDAD
  // ═══════════════════════════════════════════════════
  app.get("/api/datos/excesos-velocidad", async (_req, res) => {
    try {
      const limiteKmh = 90;
      const eventosR = await pool.query(`
        SELECT patente, etiqueta, velocidad, fecha, lat, lng, conductor
        FROM wisetrack_posiciones
        WHERE fecha >= NOW() - INTERVAL '7 days' AND velocidad > $1
        ORDER BY fecha DESC LIMIT 200
      `, [limiteKmh]);
      const porCamionR = await pool.query(`
        SELECT patente, COUNT(*) as eventos, MAX(velocidad) as max_vel, MAX(fecha) as ultimo
        FROM wisetrack_posiciones
        WHERE fecha >= NOW() - INTERVAL '7 days' AND velocidad > $1
        GROUP BY patente ORDER BY eventos DESC
      `, [limiteKmh]);
      const hoyR = await pool.query(`
        SELECT COUNT(*) as total FROM wisetrack_posiciones
        WHERE fecha >= CURRENT_DATE AND velocidad > $1
      `, [limiteKmh]);

      const totalCam = porCamionR.rows.length;
      const totalEv = eventosR.rows.length;
      const masGrave = eventosR.rows.length > 0 ? eventosR.rows.reduce((a: any, b: any) => a.velocidad > b.velocidad ? a : b) : null;

      res.json({
        eventos: eventosR.rows,
        porCamion: porCamionR.rows,
        totals: { camionesConExceso: totalCam, eventosTotal: totalEv, masGrave, hoy: parseInt(hoyR.rows[0]?.total || "0"), limiteKmh },
        resumen: {
          nuncaExcedieron: 0,
          ocasionales: porCamionR.rows.filter((r: any) => parseInt(r.eventos) <= 3).length,
          frecuentes: porCamionR.rows.filter((r: any) => parseInt(r.eventos) > 3).length,
        },
      });
    } catch (error: any) {
      console.error("[datos] excesos-velocidad error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  // ═══════════════════════════════════════════════════
  // DATOS — PESO Y TARA
  // ═══════════════════════════════════════════════════
  app.get("/api/datos/peso-tara", async (_req, res) => {
    try {
      const allCamiones = await storage.getCamiones();
      const faenas = await storage.getFaenas();
      const faenaMap = new Map(faenas.map(f => [f.id, f]));
      const camiones = allCamiones;

      const vinWeight = new Map<string, number>();

      const from = getDefaultDesde();
      const to = new Date();
      let fuelData: any[] = [];
      try {
        fuelData = [];
      } catch {}

      const conTara = camiones.filter(c => c.taraKg != null);

      const registros = conTara.map(c => {
        const faena = faenaMap.get(c.faenaId);
        const pesoVolvo = c.vin ? vinWeight.get(c.vin) : null;
        const cargasSigetra = fuelData.filter(f => f.patente === c.patente);
        const ultimaCarga = cargasSigetra.length > 0
          ? cargasSigetra.sort((a: any, b: any) => b.fechaConsumo.localeCompare(a.fechaConsumo))[0]
          : null;

        const taraNum = parseFloat(c.taraKg as string);
        const pesoMaxNum = c.pesoMaximoKg ? parseFloat(c.pesoMaximoKg as string) : null;
        const pesoVolvoKg = pesoVolvo != null ? Math.round(pesoVolvo) : null;

        let cargaEstimada: number | null = null;
        let pesoTotal: number | null = null;
        let cumple: string = "SIN_DATOS";

        if (pesoVolvoKg != null) {
          cargaEstimada = Math.max(0, pesoVolvoKg - taraNum);
          pesoTotal = pesoVolvoKg;
        }

        if (pesoTotal != null && pesoMaxNum != null) {
          const pct = (pesoTotal / pesoMaxNum) * 100;
          if (pct > 100) cumple = "EXCEDE";
          else if (pct >= 95) cumple = "AL_LIMITE";
          else cumple = "CUMPLE";
        }

        return {
          id: c.id,
          patente: c.patente,
          modelo: c.modelo,
          faena: faena?.nombre || null,
          tipoVehiculo: c.tipoVehiculo || null,
          taraKg: taraNum,
          pesoMaximoKg: pesoMaxNum,
          capacidadCargaKg: c.capacidadCargaKg ? parseFloat(c.capacidadCargaKg as string) : null,
          cargaEstimada,
          pesoTotal,
          pesoVolvoKg,
          cumple,
          ultimaCarga: ultimaCarga ? {
            fecha: ultimaCarga.fechaConsumo,
            litros: ultimaCarga.cantidadLt,
            lugar: ultimaCarga.lugarConsumo,
          } : null,
          anioFabricacion: c.anioFabricacion || null,
          configuracionEjes: c.configuracionEjes || null,
        };
      });

      registros.sort((a, b) => {
        const order: Record<string, number> = { EXCEDE: 0, AL_LIMITE: 1, SIN_DATOS: 2, CUMPLE: 3 };
        return (order[a.cumple] ?? 2) - (order[b.cumple] ?? 2);
      });

      const totals = {
        conTara: conTara.length,
        cumplen: registros.filter(r => r.cumple === "CUMPLE").length,
        exceden: registros.filter(r => r.cumple === "EXCEDE").length,
        alLimite: registros.filter(r => r.cumple === "AL_LIMITE").length,
        sinDatos: registros.filter(r => r.cumple === "SIN_DATOS").length,
        totalCamiones: camiones.length,
      };

      res.json({ registros, totals });
    } catch (error: any) {
      console.error("[datos] peso-tara error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  const taraUpdateSchema = z.object({
    taraKg: z.number().min(1000).max(30000).nullable().optional(),
    pesoMaximoKg: z.number().min(5000).max(100000).nullable().optional(),
    capacidadCargaKg: z.number().min(0).max(80000).nullable().optional(),
    tipoVehiculo: z.enum(["CAMION RIGIDO", "ARTICULADO", "TRACTO-CAMION", "OTRO"]).nullable().optional(),
    anioFabricacion: z.number().int().min(1990).max(2030).nullable().optional(),
    configuracionEjes: z.string().max(20).nullable().optional(),
  });

  app.patch("/api/camiones/:id/tara", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });

      const parsed = taraUpdateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const body = parsed.data;

      const updateData: Record<string, any> = {};
      if (body.taraKg != null) updateData.taraKg = String(body.taraKg);
      if (body.pesoMaximoKg != null) updateData.pesoMaximoKg = String(body.pesoMaximoKg);
      if (body.capacidadCargaKg != null) updateData.capacidadCargaKg = String(body.capacidadCargaKg);
      if (body.tipoVehiculo != null) updateData.tipoVehiculo = body.tipoVehiculo;
      if (body.anioFabricacion != null) updateData.anioFabricacion = body.anioFabricacion;
      if (body.configuracionEjes != null) updateData.configuracionEjes = body.configuracionEjes;

      const [updated] = await db.update(camiones).set(updateData).where(eq(camiones.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "Camion not found" });
      res.json(updated);
    } catch (error: any) {
      console.error("[datos] update tara error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/viajes/sync-historico", async (req, res) => {
    try {
      const dias = parseInt(req.query.dias as string) || 90;
      const progress = getSyncProgress();
      if (progress.status === "running") {
        return res.json({ message: "Sync ya en progreso", progress });
      }
      syncViajesHistorico(dias);
      res.json({ message: "Sync iniciado", dias });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/viajes/sync-progress", async (_req, res) => {
    res.json(getSyncProgress());
  });

  let autoSyncInterval: NodeJS.Timeout | null = null;
  let autoSyncActive = false;
  let autoSyncIntervalMin = 30;

  app.post("/api/viajes/auto-sync", async (req, res) => {
    try {
      const enable = req.query.enable === "true" || req.query.enable === "1";
      const rawInterval = parseInt(req.query.interval as string);
      const intervalMin = (!isNaN(rawInterval) && rawInterval >= 5 && rawInterval <= 240) ? rawInterval : 30;

      if (enable && !autoSyncActive) {
        autoSyncActive = true;
        autoSyncIntervalMin = intervalMin;
        console.log(`[viajes-auto] Auto-sync activado cada ${intervalMin} min`);
        syncViajesHistorico(7);
        autoSyncInterval = setInterval(() => {
          const progress = getSyncProgress();
          if (progress.status !== "running") {
            console.log("[viajes-auto] Auto-sync ejecutando...");
            syncViajesHistorico(7);
          }
        }, intervalMin * 60 * 1000);
        res.json({ active: true, intervalMin });
      } else if (!enable && autoSyncActive) {
        autoSyncActive = false;
        if (autoSyncInterval) {
          clearInterval(autoSyncInterval);
          autoSyncInterval = null;
        }
        console.log("[viajes-auto] Auto-sync desactivado");
        res.json({ active: false, intervalMin: 0 });
      } else {
        res.json({ active: autoSyncActive, intervalMin: autoSyncActive ? autoSyncIntervalMin : 0 });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/viajes/auto-sync", async (_req, res) => {
    res.json({ active: autoSyncActive, intervalMin: autoSyncActive ? autoSyncIntervalMin : 0 });
  });

  app.get("/api/viajes/stats", async (_req, res) => {
    try {
      const stats = await getViajesStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/viajes/clusterizar-corredores", async (_req, res) => {
    try {
      const resultado = await clusterizarCorredores();
      res.json(resultado);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/viajes/recalcular-scores", async (_req, res) => {
    try {
      const resultado = await recalcularScoresConCorredor();
      res.json(resultado);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/viajes/corredores", async (_req, res) => {
    try {
      const corredores = await getCorredoresStats();
      res.json(corredores);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/viajes/aprendizaje", async (req, res) => {
    try {
      const { contrato, estado, limit: lim } = req.query;
      let query = `
        SELECT va.*, c.patente 
        FROM viajes_aprendizaje va
        JOIN camiones c ON va.camion_id = c.id
        WHERE 1=1
      `;
      const params: any[] = [];
      if (contrato) {
        params.push(contrato);
        query += ` AND va.contrato = $${params.length}`;
      }
      if (estado) {
        params.push(estado);
        query += ` AND va.estado = $${params.length}`;
      }
      query += ` ORDER BY va.score_anomalia DESC, va.fecha_inicio DESC`;
      const limit = parseInt(lim as string) || 200;
      params.push(limit);
      query += ` LIMIT $${params.length}`;
      
      const result = await (await import("./db")).pool.query(query, params);
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/rutas/paradas", async (req, res) => {
    try {
      const { fecha, patente, tipo, contrato } = req.query;
      let where = "WHERE 1=1";
      const params: any[] = [];
      let idx = 1;
      if (fecha) { where += ` AND DATE(inicio) = $${idx++}`; params.push(fecha); }
      if (patente) { where += ` AND patente = $${idx++}`; params.push(patente); }
      if (tipo) { where += ` AND tipo = $${idx++}`; params.push(tipo); }
      if (contrato) { where += ` AND contrato = $${idx++}`; params.push(contrato); }

      const result = await pool.query(
        `SELECT * FROM paradas_detectadas ${where} ORDER BY inicio DESC LIMIT 500`, params
      );
      const stats = await pool.query(
        `SELECT tipo, COUNT(*)::int as cantidad, ROUND(AVG(duracion_min))::int as duracion_promedio
         FROM paradas_detectadas ${where} GROUP BY tipo ORDER BY cantidad DESC`, params
      );
      res.json({ paradas: result.rows, resumen: stats.rows, total: result.rows.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/rutas/detectar-paradas", async (req, res) => {
    try {
      const fecha = req.query.fecha as string | undefined;
      const resultado = await detectarParadas(fecha);
      res.json(resultado);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /* ===== VIAJES-DIA / PATRONES / ACUMULACION movidos a server/rutas-gps-routes.ts ===== */

  return httpServer;
}
