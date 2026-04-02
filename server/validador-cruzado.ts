/**
 * VALIDADOR CRUZADO — Camiones Volvo Connect + Sigetra
 * Cruza data de ambos sistemas para máxima confiabilidad
 */

import type { Express } from "express";
import { pool } from "./db";

export function registerValidadorCruzadoRoutes(app: Express) {
  console.log("[VALIDADOR-CRUZADO] Routes registered");

  app.get("/api/cruzado/fleet", async (_req, res) => {
    try {
      const ci = await pool.query(`SELECT vin, id_display, ids_validos, numero_interno, patente_actual FROM camion_identidades`);

      const sigR = await pool.query(`
        SELECT UPPER(REPLACE(patente,'-','')) as pat, COUNT(*) as cargas, MAX(fecha) as ultima,
          faena as contrato, MAX(conductor) as conductor
        FROM cargas WHERE fecha::timestamp >= NOW() - INTERVAL '30 days'
        GROUP BY UPPER(REPLACE(patente,'-','')), faena
      `);
      const sigMap = new Map<string, any>();
      sigR.rows.forEach((r: any) => sigMap.set(r.pat, r));

      const gpsR = await pool.query(`
        SELECT patente, lat, lng, velocidad, timestamp_gps
        FROM gps_unificado WHERE fuente = 'VOLVO' AND timestamp_gps >= NOW() - INTERVAL '2 hours'
        ORDER BY timestamp_gps DESC
      `);
      const gpsMap = new Map<string, any>();
      gpsR.rows.forEach((r: any) => { if (!gpsMap.has(r.patente)) gpsMap.set(r.patente, r); });

      const camiones: any[] = [];
      for (const c of ci.rows) {
        const ids = (c.ids_validos || []).map((i: string) => i.replace(/-/g, "").toUpperCase());
        const sigId = ids.find((i: string) => sigMap.has(i));
        const gps = ids.reduce((found: any, id: string) => found || gpsMap.get(id), null);
        const sig = sigId ? sigMap.get(sigId) : null;

        camiones.push({
          id_display: c.id_display,
          vin: c.vin,
          patentes: c.ids_validos,
          volvo_vin: c.vin,
          lat: gps?.lat || null,
          lng: gps?.lng || null,
          velocidad: gps?.velocidad || 0,
          ultima_posicion: gps?.timestamp_gps || null,
          sig_contrato: sig?.contrato || null,
          sig_cargas: sig ? parseInt(sig.cargas) : 0,
          sig_ultima_carga: sig?.ultima || null,
          sig_conductor: sig?.conductor || null,
        });
      }

      const conduccion = camiones.filter(c => c.velocidad > 0).length;
      const porContrato: Record<string, number> = {};
      camiones.forEach(c => { const k = c.sig_contrato || "SIN"; porContrato[k] = (porContrato[k] || 0) + 1; });

      res.json({
        total: camiones.length,
        conduccion,
        detenido: camiones.length - conduccion,
        fuentes: { volvo: ci.rows.length, sigetra: sigMap.size },
        por_contrato: Object.entries(porContrato).map(([c, n]) => ({ contrato: c, count: n })).sort((a, b) => b.count - a.count),
        camiones: camiones.sort((a, b) => b.velocidad - a.velocidad),
      });
    } catch (e: any) {
      console.error("[VALIDADOR-CRUZADO]", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/cruzado/viajes-dia", async (req, res) => {
    try {
      const fecha = req.query.fecha || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const contrato = req.query.contrato as string;

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

      const ci = await pool.query(`SELECT vin, id_display, ids_validos FROM camion_identidades`);
      const idMap = new Map<string, any>();
      ci.rows.forEach((c: any) => (c.ids_validos || []).forEach((id: string) => idMap.set(id.replace(/-/g, "").toUpperCase(), c)));

      const cargasR = await pool.query(`
        SELECT UPPER(REPLACE(patente,'-','')) as pat, litros_surtidor, proveedor, conductor, fecha
        FROM cargas WHERE DATE(fecha::timestamp) = $1
      `, [fecha]);
      const cargasMap = new Map<string, any[]>();
      cargasR.rows.forEach((c: any) => {
        if (!cargasMap.has(c.pat)) cargasMap.set(c.pat, []);
        cargasMap.get(c.pat)!.push(c);
      });

      const enriched = viajes.rows.map((v: any) => {
        const patNorm = (v.patente || "").replace(/-/g, "").toUpperCase();
        const identity = idMap.get(patNorm);
        const allIds = identity ? identity.ids_validos.map((i: string) => i.replace(/-/g, "").toUpperCase()) : [patNorm];

        let cargas: any[] = [];
        for (const id of allIds) { if (cargasMap.has(id)) { cargas = cargasMap.get(id)!; break; } }

        return {
          ...v,
          id_display: identity?.id_display || v.patente,
          km_ecu: parseFloat(v.km_ecu) || 0,
          rendimiento: parseFloat(v.rendimiento_real) || 0,
          cargas_dia: cargas.length,
          litros_dia: cargas.reduce((s: number, c: any) => s + (c.litros_surtidor || 0), 0),
        };
      });

      const camiones = new Map<string, any>();
      enriched.forEach((v: any) => {
        if (!camiones.has(v.id_display)) {
          camiones.set(v.id_display, {
            id_display: v.id_display, patente: v.patente, contrato: v.contrato,
            viajes: 0, km_total: 0, consumo: 0,
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
        total_viajes: enriched.length,
        total_camiones: camiones.size,
        camiones: Array.from(camiones.values()).sort((a, b) => b.km_total - a.km_total),
        viajes: enriched,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/cruzado/camion/:patente", async (req, res) => {
    try {
      const patNorm = req.params.patente.replace(/-/g, "").toUpperCase();

      const ciR = await pool.query(`SELECT * FROM camion_identidades WHERE $1 = ANY(ids_validos) LIMIT 1`, [patNorm]);
      const identity = ciR.rows[0];
      const allIds = identity ? identity.ids_validos.map((i: string) => i.replace(/-/g, "").toUpperCase()) : [patNorm];

      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
      const volvoViajes = await pool.query(`
        SELECT va.fecha_inicio, va.fecha_fin, va.km_ecu::float as km, va.rendimiento_real::float as rend,
          va.origen_nombre, va.destino_nombre, va.contrato
        FROM viajes_aprendizaje va
        JOIN camiones c ON c.id = va.camion_id
        WHERE c.patente = ANY($1) AND va.fecha_inicio >= $2
        ORDER BY va.fecha_inicio DESC
      `, [allIds, inicioMes]);

      const cargas = await pool.query(`
        SELECT fecha, litros_surtidor as litros, proveedor as estacion, conductor,
          km_anterior::float as km_ant, km_actual::float as km_act
        FROM cargas
        WHERE UPPER(REPLACE(patente,'-','')) = ANY($1) AND fecha::timestamp >= $2::timestamp
        ORDER BY fecha
      `, [allIds, inicioMes]);

      const volvoSnaps = identity?.vin ? await pool.query(`
        SELECT COUNT(*) as total FROM volvo_fuel_snapshots WHERE vin = $1
      `, [identity.vin]) : { rows: [{ total: 0 }] };

      const gpsR = await pool.query(`
        SELECT lat, lng, velocidad, timestamp_gps
        FROM gps_unificado WHERE patente = ANY($1) AND fuente = 'VOLVO'
        ORDER BY timestamp_gps DESC LIMIT 1
      `, [allIds]);
      const lastGps = gpsR.rows[0] || null;

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
          lat: lastGps?.lat || null,
          lng: lastGps?.lng || null,
          velocidad: lastGps?.velocidad || 0,
          ultima_posicion: lastGps?.timestamp_gps || null,
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

  app.get("/api/cruzado/resumen", async (_req, res) => {
    try {
      const ci = await pool.query(`SELECT ids_validos FROM camion_identidades`);
      const sigR = await pool.query(`SELECT DISTINCT UPPER(REPLACE(patente,'-','')) as p FROM cargas WHERE fecha >= '2026-03-01'`);
      const sigSet = new Set(sigR.rows.map((r: any) => r.p));

      let conSigetra = 0;
      for (const c of ci.rows) {
        const ids = (c.ids_validos || []).map((i: string) => i.replace(/-/g, "").toUpperCase());
        if (ids.some((i: string) => sigSet.has(i))) conSigetra++;
      }

      res.json({ camiones_volvo_sigetra: conSigetra, volvo_total: ci.rows.length, sig_total: sigSet.size });
    } catch (e: any) {
      res.json({ camiones_volvo_sigetra: 0, volvo_total: 0, sig_total: 0 });
    }
  });

  app.get("/api/cruzado/faenas", async (_req, res) => {
    try {
      const ci = await pool.query(`SELECT vin, id_display, ids_validos, patente_actual FROM camion_identidades`);
      const sigDistinct = await pool.query(`SELECT DISTINCT UPPER(REPLACE(patente,'-','')) as p FROM cargas WHERE fecha::timestamp >= NOW() - INTERVAL '60 days'`);
      const sigSet = new Set(sigDistinct.rows.map((r: any) => r.p));

      const matchedVehicles = new Set<string>();
      const matchedIdMap = new Map<string, any>();
      for (const c of ci.rows) {
        const ids = (c.ids_validos || []).map((i: string) => i.replace(/-/g, "").toUpperCase());
        const inSig = ids.some((i: string) => sigSet.has(i));
        if (inSig) {
          ids.forEach((i: string) => { matchedVehicles.add(i); matchedIdMap.set(i, c); });
        }
      }

      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

      const volvoViajes = await pool.query(`
        SELECT va.contrato, c.patente, COUNT(*) as viajes, SUM(va.km_ecu::float) as km_total,
          AVG(NULLIF(va.rendimiento_real::float, 0)) as rend_prom
        FROM viajes_aprendizaje va
        JOIN camiones c ON c.id = va.camion_id
        WHERE va.fecha_inicio >= $1 AND va.km_ecu::float > 5
        GROUP BY va.contrato, c.patente
      `, [inicioMes]);

      const sigCargas = await pool.query(`
        SELECT faena as contrato, UPPER(REPLACE(patente,'-','')) as pat, COUNT(*) as cargas,
          SUM(litros_surtidor) as litros, MAX(conductor) as conductor
        FROM cargas WHERE fecha::timestamp >= $1::timestamp
        GROUP BY faena, UPPER(REPLACE(patente,'-',''))
      `, [inicioMes]);

      const faenaMap = new Map<string, any>();
      const addToFaena = (contrato: string) => {
        if (!contrato) contrato = "SIN CONTRATO";
        if (!faenaMap.has(contrato)) {
          faenaMap.set(contrato, { contrato, camiones_volvo: 0, camiones_sig: 0,
            viajes_volvo: 0, km_volvo: 0, cargas: 0, litros: 0,
            rend_volvo: 0, conductores: new Set(), patentes: new Set() });
        }
        return faenaMap.get(contrato)!;
      };

      for (const r of volvoViajes.rows) {
        const patNorm = (r.patente || "").replace(/-/g, "").toUpperCase();
        if (!matchedVehicles.has(patNorm)) continue;
        const identity = matchedIdMap.get(patNorm);
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
        if (!matchedVehicles.has(patNorm)) continue;
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
          camiones_volvo: f.camiones_volvo,
          camiones_sig: f.camiones_sig,
          viajes_volvo: f.viajes_volvo,
          km_volvo: Math.round(f.km_volvo),
          cargas: f.cargas,
          litros: Math.round(f.litros),
          rend_volvo: Math.round((f.rend_volvo || 0) * 100) / 100,
          conductores: f.conductores.size,
        }))
        .filter(f => f.camiones > 0)
        .sort((a, b) => b.camiones - a.camiones);

      const uniqueCamiones = new Set<string>();
      for (const c of ci.rows) {
        const ids = (c.ids_validos || []).map((i: string) => i.replace(/-/g, "").toUpperCase());
        if (ids.some((i: string) => matchedVehicles.has(i))) uniqueCamiones.add(c.id_display);
      }
      res.json({ faenas, total_faenas: faenas.length, total_camiones: uniqueCamiones.size });
    } catch (e: any) {
      console.error("[CRUZADO-FAENAS]", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/cruzado/conductores", async (_req, res) => {
    try {
      const ci = await pool.query(`SELECT ids_validos FROM camion_identidades`);
      const sigDistinct = await pool.query(`SELECT DISTINCT UPPER(REPLACE(patente,'-','')) as p FROM cargas WHERE fecha::timestamp >= NOW() - INTERVAL '60 days'`);
      const sigSet = new Set(sigDistinct.rows.map((r: any) => r.p));

      const matchedVehicles = new Set<string>();
      for (const c of ci.rows) {
        const ids = (c.ids_validos || []).map((i: string) => i.replace(/-/g, "").toUpperCase());
        if (ids.some((i: string) => sigSet.has(i))) {
          ids.forEach((i: string) => matchedVehicles.add(i));
        }
      }

      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

      const sigConductores = await pool.query(`
        SELECT conductor, UPPER(REPLACE(patente,'-','')) as pat, faena as contrato,
          COUNT(*) as cargas, SUM(litros_surtidor) as litros
        FROM cargas
        WHERE fecha::timestamp >= $1::timestamp AND conductor IS NOT NULL AND conductor != ''
        GROUP BY conductor, UPPER(REPLACE(patente,'-','')), faena
      `, [inicioMes]);

      const conductorMap = new Map<string, any>();
      const normName = (n: string) => (n || "").trim().toUpperCase();

      for (const r of sigConductores.rows) {
        const patNorm = (r.pat || "").toUpperCase();
        if (!matchedVehicles.has(patNorm)) continue;
        const name = normName(r.conductor);
        if (!name) continue;
        if (!conductorMap.has(name)) {
          conductorMap.set(name, { nombre: r.conductor, camiones: new Set(), contrato: r.contrato,
            cargas: 0, litros: 0 });
        }
        const c = conductorMap.get(name)!;
        c.camiones.add(patNorm);
        c.cargas += parseInt(r.cargas) || 0;
        c.litros += parseFloat(r.litros) || 0;
        if (!c.contrato) c.contrato = r.contrato;
      }

      const conductores = Array.from(conductorMap.values())
        .map(c => ({
          nombre: c.nombre,
          total_camiones: c.camiones.size,
          contrato: c.contrato,
          cargas: c.cargas,
          litros: Math.round(c.litros),
        }))
        .sort((a, b) => b.total_camiones - a.total_camiones || b.cargas - a.cargas);

      res.json({ conductores, total: conductores.length });
    } catch (e: any) {
      console.error("[CRUZADO-CONDUCTORES]", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/cruzado/resumen-mes", async (_req, res) => {
    try {
      const ci = await pool.query(`SELECT vin, ids_validos FROM camion_identidades`);
      const sigDistinct = await pool.query(`SELECT DISTINCT UPPER(REPLACE(patente,'-','')) as p FROM cargas WHERE fecha::timestamp >= NOW() - INTERVAL '60 days'`);
      const sigSet = new Set(sigDistinct.rows.map((r: any) => r.p));

      const matchedVehicles = new Set<string>();
      const matchedVins = new Set<string>();
      for (const c of ci.rows) {
        const ids = (c.ids_validos || []).map((i: string) => i.replace(/-/g, "").toUpperCase());
        if (ids.some((i: string) => sigSet.has(i))) {
          ids.forEach((i: string) => matchedVehicles.add(i));
          if (c.vin) matchedVins.add(c.vin);
        }
      }

      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

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
        if (!matchedVehicles.has(patNorm)) continue;
        km_volvo += parseFloat(r.km_volvo) || 0;
        viajes_volvo += parseInt(r.viajes_volvo) || 0;
        if (r.rend_volvo) { rend_volvo_sum += parseFloat(r.rend_volvo); rend_volvo_count++; }
      }

      const sigR = await pool.query(`
        SELECT UPPER(REPLACE(patente,'-','')) as pat, SUM(litros_surtidor) as litros,
          COUNT(*) as cargas
        FROM cargas WHERE fecha::timestamp >= $1::timestamp
        GROUP BY UPPER(REPLACE(patente,'-',''))
      `, [inicioMes]);

      let litros_sig = 0, cargas_sig = 0;
      for (const r of sigR.rows) {
        if (!matchedVehicles.has(r.pat)) continue;
        litros_sig += parseFloat(r.litros) || 0;
        cargas_sig += parseInt(r.cargas) || 0;
      }

      const diasR = await pool.query(`
        SELECT COUNT(DISTINCT DATE(fecha_inicio)) as dias
        FROM viajes_aprendizaje WHERE fecha_inicio >= $1
      `, [inicioMes]);

      res.json({
        camiones_cruzados: Math.round(matchedVehicles.size / 2),
        mes: inicioMes,
        volvo: {
          km: Math.round(km_volvo),
          viajes: viajes_volvo,
          rend_prom: rend_volvo_count > 0 ? Math.round(rend_volvo_sum / rend_volvo_count * 100) / 100 : 0,
        },
        sigetra: {
          litros: Math.round(litros_sig),
          cargas: cargas_sig,
        },
        totales: {
          km_total: Math.round(km_volvo),
          viajes_total: viajes_volvo,
          rend_cruzado: litros_sig > 0 ? Math.round(km_volvo / litros_sig * 100) / 100 : 0,
          dias_activos: parseInt(diasR.rows[0]?.dias) || 0,
        },
      });
    } catch (e: any) {
      console.error("[CRUZADO-RESUMEN-MES]", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}
