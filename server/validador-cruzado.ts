/**
 * VALIDADOR CRUZADO — Solo camiones en Volvo + WiseTrack + Sigetra
 * Cruza toda la data de los 3 sistemas para máxima confiabilidad
 */

import type { Express } from "express";
import { pool } from "./db";
import { getWisetrackFleet } from "./wisetrack-api";

export function registerValidadorCruzadoRoutes(app: Express) {
  console.log("[VALIDADOR-CRUZADO] Routes registered");

  // ── Fleet cruzada: solo camiones en 3 sistemas ──
  app.get("/api/cruzado/fleet", async (_req, res) => {
    try {
      const ci = await pool.query(`SELECT vin, id_display, ids_validos, numero_interno, patente_actual FROM camion_identidades`);
      const wtFleet = await getWisetrackFleet();
      const wtMap = new Map<string, any>();
      wtFleet.forEach((v: any) => { const n = (v.MOV_PATENTE || "").replace(/-/g, "").toUpperCase(); if (n) wtMap.set(n, v); });

      const sigR = await pool.query(`
        SELECT UPPER(REPLACE(patente,'-','')) as pat, COUNT(*) as cargas, MAX(fecha) as ultima,
          faena as contrato, MAX(conductor) as conductor
        FROM cargas WHERE fecha::timestamp >= NOW() - INTERVAL '30 days'
        GROUP BY UPPER(REPLACE(patente,'-','')), faena
      `);
      const sigMap = new Map<string, any>();
      sigR.rows.forEach((r: any) => sigMap.set(r.pat, r));

      const camiones: any[] = [];
      for (const c of ci.rows) {
        const ids = (c.ids_validos || []).map((i: string) => i.replace(/-/g, "").toUpperCase());
        const wtId = ids.find((i: string) => wtMap.has(i));
        const sigId = ids.find((i: string) => sigMap.has(i));
        if (!wtId || !sigId) continue; // Only 3-system vehicles

        const wt = wtMap.get(wtId)!;
        const sig = sigMap.get(sigId)!;

        camiones.push({
          id_display: c.id_display,
          vin: c.vin,
          patentes: c.ids_validos,
          // Volvo data
          volvo_vin: c.vin,
          // WiseTrack live
          wt_lat: wt.Latitud,
          wt_lng: wt.Longitud,
          wt_velocidad: parseFloat(wt.Velocidad) || 0,
          wt_estado: wt.EstadoOperacionCanStr,
          wt_fecha: wt.Fecha,
          wt_contrato: wt.MOV_GRUPO1,
          wt_conductor: wt.CONDUCTOR !== "-" ? wt.CONDUCTOR : null,
          wt_movil: wt.Movil,
          wt_km_total: wt.Kms_Total_Sincronizado || 0,
          wt_nivel_estanque: parseFloat(wt.NIVELESTANQUE) || 0,
          wt_rpm: wt.RPM || 0,
          wt_temp_motor: parseFloat(wt.TempMotor) || 0,
          wt_consumo: parseFloat(wt.ConsumoLitros_Conduccion) || 0,
          // Sigetra
          sig_contrato: sig.contrato,
          sig_cargas: parseInt(sig.cargas),
          sig_ultima_carga: sig.ultima,
          sig_conductor: sig.conductor,
        });
      }

      const conduccion = camiones.filter(c => c.wt_velocidad > 0).length;
      const ralenti = camiones.filter(c => c.wt_estado === "Ralenti" && c.wt_velocidad === 0).length;

      // Group by contrato
      const porContrato: Record<string, number> = {};
      camiones.forEach(c => { const k = c.wt_contrato || c.sig_contrato || "SIN"; porContrato[k] = (porContrato[k] || 0) + 1; });

      res.json({
        total: camiones.length,
        conduccion,
        ralenti,
        detenido: camiones.length - conduccion - ralenti,
        fuentes: { volvo: ci.rows.length, wisetrack: wtFleet.length, sigetra: sigMap.size },
        por_contrato: Object.entries(porContrato).map(([c, n]) => ({ contrato: c, count: n })).sort((a, b) => b.count - a.count),
        camiones: camiones.sort((a, b) => b.wt_velocidad - a.wt_velocidad),
      });
    } catch (e: any) {
      console.error("[VALIDADOR-CRUZADO]", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Viajes cruzados: viajes Volvo enriquecidos con WT + Sigetra ──
  app.get("/api/cruzado/viajes-dia", async (req, res) => {
    try {
      const fecha = req.query.fecha || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const contrato = req.query.contrato as string;

      // Get Volvo trips
      let sql = `
        SELECT va.id, va.camion_id, c.patente, va.contrato, va.origen_nombre, va.destino_nombre,
          va.fecha_inicio, va.fecha_fin, va.km_ecu, va.rendimiento_real, va.snap_count,
          va.origen_lat, va.origen_lng, va.destino_lat, va.destino_lng
        FROM viajes_aprendizaje va
        JOIN camiones c ON c.id = va.camion_id
        WHERE DATE(va.fecha_inicio) = $1 AND va.km_ecu::float > 20
      `;
      const params: any[] = [fecha];
      if (contrato && contrato !== "TODOS") { sql += ` AND va.contrato = $2`; params.push(contrato); }
      sql += ` ORDER BY va.fecha_inicio DESC`;

      const viajes = await pool.query(sql, params);

      // Get identidades for enrichment
      const ci = await pool.query(`SELECT vin, id_display, ids_validos FROM camion_identidades`);
      const idMap = new Map<string, any>();
      ci.rows.forEach((c: any) => (c.ids_validos || []).forEach((id: string) => idMap.set(id.replace(/-/g, "").toUpperCase(), c)));

      // Get WT live data
      const wtFleet = await getWisetrackFleet();
      const wtMap = new Map<string, any>();
      wtFleet.forEach((v: any) => { const n = (v.MOV_PATENTE || "").replace(/-/g, "").toUpperCase(); if (n) wtMap.set(n, v); });

      // Get Sigetra cargas del dia
      const cargasR = await pool.query(`
        SELECT UPPER(REPLACE(patente,'-','')) as pat, litros_surtidor, proveedor, conductor, fecha
        FROM cargas WHERE DATE(fecha::timestamp) = $1
      `, [fecha]);
      const cargasMap = new Map<string, any[]>();
      cargasR.rows.forEach((c: any) => {
        if (!cargasMap.has(c.pat)) cargasMap.set(c.pat, []);
        cargasMap.get(c.pat)!.push(c);
      });

      // Enrich viajes
      const enriched = viajes.rows.map((v: any) => {
        const patNorm = (v.patente || "").replace(/-/g, "").toUpperCase();
        const identity = idMap.get(patNorm);
        const allIds = identity ? identity.ids_validos.map((i: string) => i.replace(/-/g, "").toUpperCase()) : [patNorm];

        // Find WT data for any of the IDs
        let wt: any = null;
        for (const id of allIds) { if (wtMap.has(id)) { wt = wtMap.get(id); break; } }

        // Find Sigetra cargas
        let cargas: any[] = [];
        for (const id of allIds) { if (cargasMap.has(id)) { cargas = cargasMap.get(id)!; break; } }

        const enLos3 = !!identity && !!wt && cargas.length > 0;

        return {
          ...v,
          id_display: identity?.id_display || v.patente,
          en_3_sistemas: enLos3,
          km_ecu: parseFloat(v.km_ecu) || 0,
          rendimiento: parseFloat(v.rendimiento_real) || 0,
          // WT enrichment
          wt_estado: wt?.EstadoOperacionCanStr || null,
          wt_nivel_estanque: wt ? parseFloat(wt.NIVELESTANQUE) || 0 : null,
          wt_rpm: wt?.RPM || null,
          wt_temp_motor: wt ? parseFloat(wt.TempMotor) || 0 : null,
          wt_km_total: wt?.Kms_Total_Sincronizado || null,
          // Sigetra enrichment
          cargas_dia: cargas.length,
          litros_dia: cargas.reduce((s: number, c: any) => s + (c.litros_surtidor || 0), 0),
        };
      });

      // Filter to only 3-system if requested
      const solo3 = req.query.solo3 === "true";
      const filtered = solo3 ? enriched.filter((v: any) => v.en_3_sistemas) : enriched;

      // Unique camiones
      const camiones = new Map<string, any>();
      filtered.forEach((v: any) => {
        if (!camiones.has(v.id_display)) {
          camiones.set(v.id_display, {
            id_display: v.id_display, patente: v.patente, contrato: v.contrato,
            en_3_sistemas: v.en_3_sistemas, viajes: 0, km_total: 0, consumo: 0,
            wt_estado: v.wt_estado, wt_nivel_estanque: v.wt_nivel_estanque,
          });
        }
        const c = camiones.get(v.id_display)!;
        c.viajes++;
        c.km_total += v.km_ecu;
        c.consumo += v.litros_dia || 0;
      });
      for (const c of camiones.values()) {
        c.rendimiento = c.consumo > 0 ? Math.round(c.km_total / c.consumo * 100) / 100 : 0;
      }

      res.json({
        fecha,
        total_viajes: filtered.length,
        total_camiones: camiones.size,
        en_3_sistemas: filtered.filter((v: any) => v.en_3_sistemas).length,
        camiones: Array.from(camiones.values()).sort((a, b) => b.km_total - a.km_total),
        viajes: filtered,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Detalle cruzado de un camión ──
  app.get("/api/cruzado/camion/:patente", async (req, res) => {
    try {
      const patNorm = req.params.patente.replace(/-/g, "").toUpperCase();

      // Identity
      const ciR = await pool.query(`SELECT * FROM camion_identidades WHERE $1 = ANY(ids_validos) LIMIT 1`, [patNorm]);
      const identity = ciR.rows[0];
      const allIds = identity ? identity.ids_validos.map((i: string) => i.replace(/-/g, "").toUpperCase()) : [patNorm];

      // Volvo viajes del mes
      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
      const volvoViajes = await pool.query(`
        SELECT va.fecha_inicio, va.fecha_fin, va.km_ecu::float as km, va.rendimiento_real::float as rend,
          va.origen_nombre, va.destino_nombre, va.contrato
        FROM viajes_aprendizaje va
        JOIN camiones c ON c.id = va.camion_id
        WHERE c.patente = ANY($1) AND va.fecha_inicio >= $2
        ORDER BY va.fecha_inicio DESC
      `, [allIds, inicioMes]);

      // WT viajes del mes
      const wtViajes = await pool.query(`
        SELECT fecha_inicio, fecha_fin, km_viaje as km, rendimiento as rend,
          origen_nombre, destino_nombre, contrato
        FROM wt_viajes
        WHERE patente_norm = ANY($1) AND fecha_inicio >= $2 AND estado = 'CERRADO'
        ORDER BY fecha_inicio DESC
      `, [allIds, inicioMes]);

      // Sigetra cargas
      const cargas = await pool.query(`
        SELECT fecha, litros_surtidor as litros, proveedor as estacion, conductor,
          km_anterior::float as km_ant, km_actual::float as km_act
        FROM cargas
        WHERE UPPER(REPLACE(patente,'-','')) = ANY($1) AND fecha::timestamp >= $2::timestamp
        ORDER BY fecha
      `, [allIds, inicioMes]);

      // WT live
      const wtFleet = await getWisetrackFleet();
      let wtLive: any = null;
      for (const v of wtFleet) {
        const n = (v.MOV_PATENTE || "").replace(/-/g, "").toUpperCase();
        if (allIds.includes(n)) { wtLive = v; break; }
      }

      // Volvo snapshots count
      const volvoSnaps = identity?.vin ? await pool.query(`
        SELECT COUNT(*) as total FROM volvo_fuel_snapshots WHERE vin = $1
      `, [identity.vin]) : { rows: [{ total: 0 }] };

      res.json({
        id_display: identity?.id_display || patNorm,
        patentes: allIds,
        vin: identity?.vin || null,
        volvo: {
          activo: parseInt(volvoSnaps.rows[0].total) > 0,
          snapshots: parseInt(volvoSnaps.rows[0].total),
          viajes_mes: volvoViajes.rows.length,
          km_mes: volvoViajes.rows.reduce((s: number, v: any) => s + (v.km || 0), 0),
          rend_prom: volvoViajes.rows.length > 0 ? Math.round(volvoViajes.rows.reduce((s: number, v: any) => s + (v.rend || 0), 0) / volvoViajes.rows.filter((v: any) => v.rend > 0).length * 100) / 100 : 0,
          viajes: volvoViajes.rows,
        },
        wisetrack: {
          activo: !!wtLive,
          estado: wtLive?.EstadoOperacionCanStr || null,
          lat: wtLive?.Latitud, lng: wtLive?.Longitud,
          velocidad: wtLive ? parseFloat(wtLive.Velocidad) || 0 : 0,
          nivel_estanque: wtLive ? parseFloat(wtLive.NIVELESTANQUE) || 0 : 0,
          rpm: wtLive?.RPM || 0,
          temp_motor: wtLive ? parseFloat(wtLive.TempMotor) || 0 : 0,
          km_total: wtLive?.Kms_Total_Sincronizado || 0,
          viajes_mes: wtViajes.rows.length,
          viajes: wtViajes.rows,
        },
        sigetra: {
          activo: cargas.rows.length > 0,
          cargas_mes: cargas.rows.length,
          litros_mes: cargas.rows.reduce((s: number, c: any) => s + (c.litros || 0), 0),
          conductor: cargas.rows.length > 0 ? cargas.rows[cargas.rows.length - 1].conductor : null,
          cargas: cargas.rows,
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Resumen rápido para launcher card ──
  app.get("/api/cruzado/resumen", async (_req, res) => {
    try {
      const ci = await pool.query(`SELECT ids_validos FROM camion_identidades`);
      const wtR = await pool.query(`SELECT DISTINCT patente_norm FROM wisetrack_snapshots`);
      const wtSet = new Set(wtR.rows.map((r: any) => r.patente_norm));
      const sigR = await pool.query(`SELECT DISTINCT UPPER(REPLACE(patente,'-','')) as p FROM cargas WHERE fecha >= '2026-03-01'`);
      const sigSet = new Set(sigR.rows.map((r: any) => r.p));

      let los3 = 0;
      for (const c of ci.rows) {
        const ids = (c.ids_validos || []).map((i: string) => i.replace(/-/g, "").toUpperCase());
        if (ids.some((i: string) => wtSet.has(i)) && ids.some((i: string) => sigSet.has(i))) los3++;
      }

      res.json({ camiones_3_sistemas: los3, volvo_total: ci.rows.length, wt_total: wtSet.size, sig_total: sigSet.size });
    } catch (e: any) {
      res.json({ camiones_3_sistemas: 0, volvo_total: 0, wt_total: 0, sig_total: 0 });
    }
  });

  // ── Faenas: Contracts with data from all 3 sources ──
  app.get("/api/cruzado/faenas", async (_req, res) => {
    try {
      // Get 3-system vehicle set
      const ci = await pool.query(`SELECT vin, id_display, ids_validos, patente_actual FROM camion_identidades`);
      const wtSnap = await pool.query(`SELECT DISTINCT patente_norm FROM wisetrack_snapshots`);
      const wtSet = new Set(wtSnap.rows.map((r: any) => r.patente_norm));
      const sigDistinct = await pool.query(`SELECT DISTINCT UPPER(REPLACE(patente,'-','')) as p FROM cargas WHERE fecha::timestamp >= NOW() - INTERVAL '60 days'`);
      const sigSet = new Set(sigDistinct.rows.map((r: any) => r.p));

      const tripleVehicles = new Set<string>();
      const tripleIdMap = new Map<string, any>();
      for (const c of ci.rows) {
        const ids = (c.ids_validos || []).map((i: string) => i.replace(/-/g, "").toUpperCase());
        const inWt = ids.some((i: string) => wtSet.has(i));
        const inSig = ids.some((i: string) => sigSet.has(i));
        if (inWt && inSig) {
          ids.forEach((i: string) => { tripleVehicles.add(i); tripleIdMap.set(i, c); });
        }
      }

      // WT viajes grouped by contrato (current month)
      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
      const wtViajes = await pool.query(`
        SELECT contrato, patente_norm, COUNT(*) as viajes, SUM(km_viaje::float) as km_total,
          AVG(NULLIF(rendimiento::float, 0)) as rend_prom
        FROM wt_viajes
        WHERE fecha_inicio >= $1 AND estado = 'CERRADO'
        GROUP BY contrato, patente_norm
      `, [inicioMes]);

      // Volvo viajes grouped by contrato
      const volvoViajes = await pool.query(`
        SELECT va.contrato, c.patente, COUNT(*) as viajes, SUM(va.km_ecu::float) as km_total,
          AVG(NULLIF(va.rendimiento_real::float, 0)) as rend_prom
        FROM viajes_aprendizaje va
        JOIN camiones c ON c.id = va.camion_id
        WHERE va.fecha_inicio >= $1 AND va.km_ecu::float > 5
        GROUP BY va.contrato, c.patente
      `, [inicioMes]);

      // Sigetra cargas grouped by faena
      const sigCargas = await pool.query(`
        SELECT faena as contrato, UPPER(REPLACE(patente,'-','')) as pat, COUNT(*) as cargas,
          SUM(litros_surtidor) as litros, MAX(conductor) as conductor
        FROM cargas WHERE fecha::timestamp >= $1::timestamp
        GROUP BY faena, UPPER(REPLACE(patente,'-',''))
      `, [inicioMes]);

      // Build faena map
      const faenaMap = new Map<string, any>();
      const addToFaena = (contrato: string) => {
        if (!contrato) contrato = "SIN CONTRATO";
        if (!faenaMap.has(contrato)) {
          faenaMap.set(contrato, { contrato, camiones_wt: 0, camiones_volvo: 0, camiones_sig: 0,
            viajes_wt: 0, viajes_volvo: 0, km_wt: 0, km_volvo: 0, cargas: 0, litros: 0,
            rend_wt: 0, rend_volvo: 0, conductores: new Set(), patentes: new Set() });
        }
        return faenaMap.get(contrato)!;
      };

      for (const r of wtViajes.rows) {
        const patNorm = (r.patente_norm || "").toUpperCase();
        if (!tripleVehicles.has(patNorm)) continue;
        const f = addToFaena(r.contrato);
        f.camiones_wt++;
        f.viajes_wt += parseInt(r.viajes) || 0;
        f.km_wt += parseFloat(r.km_total) || 0;
        f.rend_wt = parseFloat(r.rend_prom) || 0;
        f.patentes.add(patNorm);
      }

      for (const r of volvoViajes.rows) {
        const patNorm = (r.patente || "").replace(/-/g, "").toUpperCase();
        if (!tripleVehicles.has(patNorm)) continue;
        const identity = tripleIdMap.get(patNorm);
        const contrato = r.contrato || identity?.contrato || "SIN CONTRATO";
        const f = addToFaena(contrato);
        f.camiones_volvo++;
        f.viajes_volvo += parseInt(r.viajes) || 0;
        f.km_volvo += parseFloat(r.km_total) || 0;
        f.rend_volvo = parseFloat(r.rend_prom) || 0;
        f.patentes.add(patNorm);
      }

      for (const r of sigCargas.rows) {
        const patNorm = (r.pat || "").toUpperCase();
        if (!tripleVehicles.has(patNorm)) continue;
        const f = addToFaena(r.contrato || "SIN CONTRATO");
        f.camiones_sig++;
        f.cargas += parseInt(r.cargas) || 0;
        f.litros += parseFloat(r.litros) || 0;
        if (r.conductor) f.conductores.add(r.conductor);
        f.patentes.add(patNorm);
      }

      const faenas = Array.from(faenaMap.values())
        .map(f => ({
          contrato: f.contrato,
          camiones: f.patentes.size,
          camiones_wt: f.camiones_wt,
          camiones_volvo: f.camiones_volvo,
          camiones_sig: f.camiones_sig,
          viajes_wt: f.viajes_wt,
          viajes_volvo: f.viajes_volvo,
          km_wt: Math.round(f.km_wt),
          km_volvo: Math.round(f.km_volvo),
          cargas: f.cargas,
          litros: Math.round(f.litros),
          rend_wt: Math.round((f.rend_wt || 0) * 100) / 100,
          rend_volvo: Math.round((f.rend_volvo || 0) * 100) / 100,
          conductores: f.conductores.size,
        }))
        .filter(f => f.camiones > 0)
        .sort((a, b) => b.camiones - a.camiones);

      res.json({ faenas, total_faenas: faenas.length, total_camiones_3s: tripleVehicles.size / 2 });
    } catch (e: any) {
      console.error("[CRUZADO-FAENAS]", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Conductores: Drivers from all sources deduplicated ──
  app.get("/api/cruzado/conductores", async (_req, res) => {
    try {
      // Get 3-system vehicle set
      const ci = await pool.query(`SELECT ids_validos FROM camion_identidades`);
      const wtSnap = await pool.query(`SELECT DISTINCT patente_norm FROM wisetrack_snapshots`);
      const wtSet = new Set(wtSnap.rows.map((r: any) => r.patente_norm));
      const sigDistinct = await pool.query(`SELECT DISTINCT UPPER(REPLACE(patente,'-','')) as p FROM cargas WHERE fecha::timestamp >= NOW() - INTERVAL '60 days'`);
      const sigSet = new Set(sigDistinct.rows.map((r: any) => r.p));

      const tripleVehicles = new Set<string>();
      for (const c of ci.rows) {
        const ids = (c.ids_validos || []).map((i: string) => i.replace(/-/g, "").toUpperCase());
        if (ids.some((i: string) => wtSet.has(i)) && ids.some((i: string) => sigSet.has(i))) {
          ids.forEach((i: string) => tripleVehicles.add(i));
        }
      }

      // WT conductores from snapshots
      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
      const wtConductores = await pool.query(`
        SELECT conductor, patente_norm, contrato, COUNT(*) as snapshots,
          MAX(captured_at) as ultima_vez
        FROM wisetrack_snapshots
        WHERE captured_at >= $1 AND conductor IS NOT NULL AND conductor != '' AND conductor != '-'
        GROUP BY conductor, patente_norm, contrato
      `, [inicioMes]);

      // Sigetra conductores from cargas
      const sigConductores = await pool.query(`
        SELECT conductor, UPPER(REPLACE(patente,'-','')) as pat, faena as contrato,
          COUNT(*) as cargas, SUM(litros_surtidor) as litros
        FROM cargas
        WHERE fecha::timestamp >= $1::timestamp AND conductor IS NOT NULL AND conductor != ''
        GROUP BY conductor, UPPER(REPLACE(patente,'-','')), faena
      `, [inicioMes]);

      // Merge conductores
      const conductorMap = new Map<string, any>();
      const normName = (n: string) => (n || "").trim().toUpperCase();

      for (const r of wtConductores.rows) {
        const patNorm = (r.patente_norm || "").toUpperCase();
        if (!tripleVehicles.has(patNorm)) continue;
        const name = normName(r.conductor);
        if (!name) continue;
        if (!conductorMap.has(name)) {
          conductorMap.set(name, { nombre: r.conductor, fuente_wt: true, fuente_sig: false,
            camiones_wt: new Set(), camiones_sig: new Set(), contrato: r.contrato,
            snapshots: 0, cargas: 0, litros: 0, ultima_vez: null });
        }
        const c = conductorMap.get(name)!;
        c.camiones_wt.add(patNorm);
        c.snapshots += parseInt(r.snapshots) || 0;
        if (!c.ultima_vez || r.ultima_vez > c.ultima_vez) c.ultima_vez = r.ultima_vez;
        if (!c.contrato) c.contrato = r.contrato;
      }

      for (const r of sigConductores.rows) {
        const patNorm = (r.pat || "").toUpperCase();
        if (!tripleVehicles.has(patNorm)) continue;
        const name = normName(r.conductor);
        if (!name) continue;
        if (!conductorMap.has(name)) {
          conductorMap.set(name, { nombre: r.conductor, fuente_wt: false, fuente_sig: true,
            camiones_wt: new Set(), camiones_sig: new Set(), contrato: r.contrato,
            snapshots: 0, cargas: 0, litros: 0, ultima_vez: null });
        }
        const c = conductorMap.get(name)!;
        c.fuente_sig = true;
        c.camiones_sig.add(patNorm);
        c.cargas += parseInt(r.cargas) || 0;
        c.litros += parseFloat(r.litros) || 0;
        if (!c.contrato) c.contrato = r.contrato;
      }

      const conductores = Array.from(conductorMap.values())
        .map(c => ({
          nombre: c.nombre,
          fuente_wt: c.fuente_wt,
          fuente_sig: c.fuente_sig,
          en_ambas: c.fuente_wt && c.fuente_sig,
          camiones_wt: c.camiones_wt.size,
          camiones_sig: c.camiones_sig.size,
          total_camiones: new Set([...c.camiones_wt, ...c.camiones_sig]).size,
          contrato: c.contrato,
          snapshots: c.snapshots,
          cargas: c.cargas,
          litros: Math.round(c.litros),
          ultima_vez: c.ultima_vez,
        }))
        .sort((a, b) => b.total_camiones - a.total_camiones || b.snapshots - a.snapshots);

      const enAmbas = conductores.filter(c => c.en_ambas).length;

      res.json({ conductores, total: conductores.length, en_ambas_fuentes: enAmbas });
    } catch (e: any) {
      console.error("[CRUZADO-CONDUCTORES]", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Resumen Mes: Monthly KPIs combining all sources ──
  app.get("/api/cruzado/resumen-mes", async (_req, res) => {
    try {
      // Get 3-system vehicle set
      const ci = await pool.query(`SELECT vin, ids_validos FROM camion_identidades`);
      const wtSnap = await pool.query(`SELECT DISTINCT patente_norm FROM wisetrack_snapshots`);
      const wtSet = new Set(wtSnap.rows.map((r: any) => r.patente_norm));
      const sigDistinct = await pool.query(`SELECT DISTINCT UPPER(REPLACE(patente,'-','')) as p FROM cargas WHERE fecha::timestamp >= NOW() - INTERVAL '60 days'`);
      const sigSet = new Set(sigDistinct.rows.map((r: any) => r.p));

      const tripleVehicles = new Set<string>();
      const tripleVins = new Set<string>();
      for (const c of ci.rows) {
        const ids = (c.ids_validos || []).map((i: string) => i.replace(/-/g, "").toUpperCase());
        if (ids.some((i: string) => wtSet.has(i)) && ids.some((i: string) => sigSet.has(i))) {
          ids.forEach((i: string) => tripleVehicles.add(i));
          if (c.vin) tripleVins.add(c.vin);
        }
      }

      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

      // Volvo km from viajes_aprendizaje
      const volvoR = await pool.query(`
        SELECT c.patente, SUM(va.km_ecu::float) as km_volvo, COUNT(*) as viajes_volvo,
          AVG(NULLIF(va.rendimiento_real::float, 0)) as rend_volvo
        FROM viajes_aprendizaje va
        JOIN camiones c ON c.id = va.camion_id
        WHERE va.fecha_inicio >= $1 AND va.km_ecu::float > 5
        GROUP BY c.patente
      `, [inicioMes]);

      let km_volvo = 0, viajes_volvo = 0, rend_volvo_sum = 0, rend_volvo_count = 0;
      for (const r of volvoR.rows) {
        const patNorm = (r.patente || "").replace(/-/g, "").toUpperCase();
        if (!tripleVehicles.has(patNorm)) continue;
        km_volvo += parseFloat(r.km_volvo) || 0;
        viajes_volvo += parseInt(r.viajes_volvo) || 0;
        if (r.rend_volvo) { rend_volvo_sum += parseFloat(r.rend_volvo); rend_volvo_count++; }
      }

      // WT km from wt_viajes
      const wtR = await pool.query(`
        SELECT patente_norm, SUM(km_viaje::float) as km_wt, COUNT(*) as viajes_wt,
          AVG(NULLIF(rendimiento::float, 0)) as rend_wt
        FROM wt_viajes
        WHERE fecha_inicio >= $1 AND estado = 'CERRADO'
        GROUP BY patente_norm
      `, [inicioMes]);

      let km_wt = 0, viajes_wt = 0, rend_wt_sum = 0, rend_wt_count = 0;
      for (const r of wtR.rows) {
        const patNorm = (r.patente_norm || "").toUpperCase();
        if (!tripleVehicles.has(patNorm)) continue;
        km_wt += parseFloat(r.km_wt) || 0;
        viajes_wt += parseInt(r.viajes_wt) || 0;
        if (r.rend_wt) { rend_wt_sum += parseFloat(r.rend_wt); rend_wt_count++; }
      }

      // Sigetra litros from cargas
      const sigR = await pool.query(`
        SELECT UPPER(REPLACE(patente,'-','')) as pat, SUM(litros_surtidor) as litros,
          COUNT(*) as cargas
        FROM cargas WHERE fecha::timestamp >= $1::timestamp
        GROUP BY UPPER(REPLACE(patente,'-',''))
      `, [inicioMes]);

      let litros_sig = 0, cargas_sig = 0;
      for (const r of sigR.rows) {
        if (!tripleVehicles.has(r.pat)) continue;
        litros_sig += parseFloat(r.litros) || 0;
        cargas_sig += parseInt(r.cargas) || 0;
      }

      // Dias activos (from WT)
      const diasR = await pool.query(`
        SELECT COUNT(DISTINCT DATE(fecha_inicio)) as dias
        FROM wt_viajes WHERE fecha_inicio >= $1 AND estado = 'CERRADO'
      `, [inicioMes]);

      res.json({
        camiones_3s: Math.round(tripleVehicles.size / 2),
        mes: inicioMes,
        volvo: {
          km: Math.round(km_volvo),
          viajes: viajes_volvo,
          rend_prom: rend_volvo_count > 0 ? Math.round(rend_volvo_sum / rend_volvo_count * 100) / 100 : 0,
        },
        wisetrack: {
          km: Math.round(km_wt),
          viajes: viajes_wt,
          rend_prom: rend_wt_count > 0 ? Math.round(rend_wt_sum / rend_wt_count * 100) / 100 : 0,
        },
        sigetra: {
          litros: Math.round(litros_sig),
          cargas: cargas_sig,
        },
        totales: {
          km_combinado: Math.round(km_volvo + km_wt),
          viajes_combinado: viajes_volvo + viajes_wt,
          rend_cruzado: litros_sig > 0 ? Math.round((km_volvo + km_wt) / 2 / litros_sig * 100) / 100 : 0,
          dias_activos: parseInt(diasR.rows[0]?.dias) || 0,
        },
      });
    } catch (e: any) {
      console.error("[CRUZADO-RESUMEN-MES]", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}
