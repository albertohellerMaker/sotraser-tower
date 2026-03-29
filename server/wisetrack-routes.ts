import type { Express } from "express";
import { getWisetrackFleet, getWisetrackAlertas, getWisetrackRankingAlertas, syncWisetrackToDB } from "./wisetrack-api";
import { pool } from "./db";

export function registerWisetrackRoutes(app: Express) {
  console.log("[WISETRACK] Routes registered");

  // ── Live fleet from WiseTrack ──
  app.get("/api/wisetrack/fleet", async (_req, res) => {
    try {
      const fleet = await getWisetrackFleet();

      // Classify
      const conduccion = fleet.filter(v => v.EstadoOperacionCanStr === "Conduccion" || parseFloat(v.Velocidad) > 0);
      const ralenti = fleet.filter(v => v.EstadoOperacionCanStr === "Ralenti" && parseFloat(v.Velocidad) === 0);
      const detenido = fleet.filter(v => v.EstadoOperacionCanStr !== "Conduccion" && v.EstadoOperacionCanStr !== "Ralenti");

      // Group by contrato
      const porContrato: Record<string, number> = {};
      fleet.forEach((v: any) => {
        const c = v.MOV_GRUPO1 || "SIN CONTRATO";
        porContrato[c] = (porContrato[c] || 0) + 1;
      });

      res.json({
        total: fleet.length,
        conduccion: conduccion.length,
        ralenti: ralenti.length,
        detenido: detenido.length,
        por_contrato: Object.entries(porContrato)
          .map(([contrato, count]) => ({ contrato, count }))
          .sort((a, b) => (b.count as number) - (a.count as number)),
        vehiculos: fleet.map((v: any) => ({
          movil: v.Movil,
          patente: v.MOV_PATENTE,
          lat: v.Latitud,
          lng: v.Longitud,
          velocidad: parseFloat(v.Velocidad) || 0,
          fecha: v.Fecha,
          estado: v.EstadoOperacionCanStr,
          ignicion: v.Ignicion,
          contrato: v.MOV_GRUPO1 || "",
          conductor: v.CONDUCTOR !== "-" ? v.CONDUCTOR : null,
          km_viaje: v.Kms || 0,
          km_total: v.Kms_Total_Sincronizado || 0,
          consumo_lt: parseFloat(v.ConsumoLitros_Conduccion) || 0,
          nivel_estanque: parseFloat(v.NIVELESTANQUE) || 0,
          rpm: v.RPM || 0,
          temp_motor: parseFloat(v.TempMotor) || 0,
          tiempo_conduccion: v.Tiempo_Conduccion || 0,
          tiempo_ralenti: v.Tiempo_Ralenti || 0,
        })),
      });
    } catch (e: any) {
      console.error("[WISETRACK] Fleet error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Alertas ──
  app.get("/api/wisetrack/alertas", async (_req, res) => {
    try {
      const alertas = await getWisetrackAlertas();
      res.json({
        total: alertas.length,
        alertas: alertas.map((a: any) => ({
          id: a.Id_Alertas,
          movil: a.Movil,
          patente: a.MOV_PATENTE,
          plantilla: a.plantilla,
          conductor: a.COND_NOMBRE,
          fecha: a.FechaAlerta,
          lat: a.Lat,
          lng: a.Lon,
          zona: a.Zona,
          tipo: a.NombreTipoAlerta,
          valor: a.Valor,
          detalle: a.Valor_Excepcion,
          estado: a.EstadoAlerta,
          categoria: a.Categoria,
        })),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Ranking alertas por vehículo ──
  app.get("/api/wisetrack/ranking-alertas", async (_req, res) => {
    try {
      const ranking = await getWisetrackRankingAlertas();
      res.json(ranking);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Resumen rápido para launcher card ──
  app.get("/api/wisetrack/resumen", async (_req, res) => {
    try {
      const fleet = await getWisetrackFleet();
      const alertas = await getWisetrackAlertas();

      const enMovimiento = fleet.filter((v: any) => parseFloat(v.Velocidad) > 0).length;
      const contratos = new Set(fleet.map((v: any) => v.MOV_GRUPO1).filter(Boolean)).size;

      res.json({
        total_vehiculos: fleet.length,
        en_movimiento: enMovimiento,
        alertas_activas: alertas.length,
        contratos: contratos,
      });
    } catch (e: any) {
      res.json({ total_vehiculos: 0, en_movimiento: 0, alertas_activas: 0, contratos: 0 });
    }
  });

  // ── Sync manual ──
  app.post("/api/wisetrack/sync", async (_req, res) => {
    try {
      const result = await syncWisetrackToDB();
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Historical data from DB ──
  app.get("/api/wisetrack/historial/:patente", async (req, res) => {
    try {
      const { patente } = req.params;
      const norm = patente.replace(/-/g, "").toUpperCase();
      const dias = parseInt(req.query.dias as string) || 7;

      const r = await pool.query(`
        SELECT fecha, lat, lng, velocidad, estado, km_total, nivel_estanque, rpm, temp_motor
        FROM wisetrack_snapshots
        WHERE patente_norm = $1 AND captured_at >= NOW() - ($2 || ' days')::interval
        ORDER BY fecha DESC
        LIMIT 500
      `, [norm, dias]);

      res.json({ patente: norm, puntos: r.rows.length, data: r.rows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Cross-match Volvo + WiseTrack + Sigetra ──
  app.get("/api/wisetrack/matching", async (_req, res) => {
    try {
      // Volvo via identidades
      const volvoR = await pool.query(`SELECT vin, ids_validos, id_display, numero_interno, patente_actual FROM camion_identidades`);

      // WiseTrack
      const wtFleet = await getWisetrackFleet();
      const wtMap = new Map<string, any>();
      wtFleet.forEach((v: any) => {
        const norm = (v.MOV_PATENTE || "").replace(/-/g, "").toUpperCase();
        if (norm) wtMap.set(norm, v);
      });

      // Sigetra
      const sigR = await pool.query(`
        SELECT UPPER(REPLACE(patente,'-','')) as pat, COUNT(*) as cargas, MAX(fecha) as ultima,
          faena as contrato, MAX(conductor) as conductor
        FROM cargas WHERE fecha >= '2026-03-01'
        GROUP BY UPPER(REPLACE(patente,'-','')), faena
      `);
      const sigMap = new Map<string, any>();
      sigR.rows.forEach((r: any) => sigMap.set(r.pat, r));

      // All unique patentes
      const allPats = new Set<string>();
      volvoR.rows.forEach((c: any) => (c.ids_validos || []).forEach((id: string) => allPats.add(id.replace(/-/g, "").toUpperCase())));
      wtMap.forEach((_v, k) => allPats.add(k));
      sigMap.forEach((_v, k) => allPats.add(k));

      // Build unified list
      const camiones: any[] = [];
      const processed = new Set<string>();

      // Start with Volvo (richest data)
      for (const cam of volvoR.rows) {
        const ids = (cam.ids_validos || []).map((id: string) => id.replace(/-/g, "").toUpperCase());
        const wtMatch = ids.find((id: string) => wtMap.has(id));
        const sigMatch = ids.find((id: string) => sigMap.has(id));
        const wt = wtMatch ? wtMap.get(wtMatch) : null;
        const sig = sigMatch ? sigMap.get(sigMatch) : null;

        ids.forEach((id: string) => processed.add(id));

        camiones.push({
          id_display: cam.id_display,
          patentes: cam.ids_validos,
          vin: cam.vin,
          volvo: true,
          wisetrack: !!wt,
          sigetra: !!sig,
          sistemas: 1 + (wt ? 1 : 0) + (sig ? 1 : 0),
          wt_estado: wt?.EstadoOperacionCanStr || null,
          wt_velocidad: wt ? parseFloat(wt.Velocidad) || 0 : null,
          wt_contrato: wt?.MOV_GRUPO1 || null,
          wt_lat: wt?.Latitud || null,
          wt_lng: wt?.Longitud || null,
          sig_contrato: sig?.contrato || null,
          sig_cargas: sig ? parseInt(sig.cargas) : 0,
          sig_ultima: sig?.ultima || null,
        });
      }

      // WiseTrack-only and WT+Sigetra
      for (const [pat, wt] of wtMap) {
        if (processed.has(pat)) continue;
        processed.add(pat);
        const sig = sigMap.get(pat);

        camiones.push({
          id_display: wt.Movil || pat,
          patentes: [wt.MOV_PATENTE],
          vin: null,
          volvo: false,
          wisetrack: true,
          sigetra: !!sig,
          sistemas: 1 + (sig ? 1 : 0),
          wt_estado: wt.EstadoOperacionCanStr,
          wt_velocidad: parseFloat(wt.Velocidad) || 0,
          wt_contrato: wt.MOV_GRUPO1 || null,
          wt_lat: wt.Latitud,
          wt_lng: wt.Longitud,
          sig_contrato: sig?.contrato || null,
          sig_cargas: sig ? parseInt(sig.cargas) : 0,
          sig_ultima: sig?.ultima || null,
        });
      }

      // Sigetra-only
      for (const [pat, sig] of sigMap) {
        if (processed.has(pat)) continue;
        processed.add(pat);

        camiones.push({
          id_display: pat,
          patentes: [pat],
          vin: null,
          volvo: false,
          wisetrack: false,
          sigetra: true,
          sistemas: 1,
          wt_estado: null,
          wt_velocidad: null,
          wt_contrato: null,
          wt_lat: null,
          wt_lng: null,
          sig_contrato: sig.contrato,
          sig_cargas: parseInt(sig.cargas),
          sig_ultima: sig.ultima,
        });
      }

      // Stats
      const los3 = camiones.filter(c => c.volvo && c.wisetrack && c.sigetra).length;
      const volvoWt = camiones.filter(c => c.volvo && c.wisetrack && !c.sigetra).length;
      const volvoSig = camiones.filter(c => c.volvo && !c.wisetrack && c.sigetra).length;
      const wtSig = camiones.filter(c => !c.volvo && c.wisetrack && c.sigetra).length;
      const soloVolvo = camiones.filter(c => c.volvo && !c.wisetrack && !c.sigetra).length;
      const soloWt = camiones.filter(c => !c.volvo && c.wisetrack && !c.sigetra).length;
      const soloSig = camiones.filter(c => !c.volvo && !c.wisetrack && c.sigetra).length;

      res.json({
        resumen: {
          total: camiones.length,
          los_3_sistemas: los3,
          volvo_wisetrack: volvoWt,
          volvo_sigetra: volvoSig,
          wisetrack_sigetra: wtSig,
          solo_volvo: soloVolvo,
          solo_wisetrack: soloWt,
          solo_sigetra: soloSig,
          pct_cobertura_completa: camiones.length > 0 ? Math.round(los3 / camiones.length * 100) : 0,
          pct_gps: camiones.length > 0 ? Math.round((los3 + volvoWt + volvoSig + wtSig + soloWt) / camiones.length * 100) : 0,
          pct_combustible: camiones.length > 0 ? Math.round((los3 + volvoSig + wtSig + soloSig) / camiones.length * 100) : 0,
        },
        camiones: camiones.sort((a, b) => b.sistemas - a.sistemas),
      });
    } catch (e: any) {
      console.error("[WISETRACK] Matching error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}
