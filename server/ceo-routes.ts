import type { Express, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { storage } from "./storage";
import { pool, DATA_START } from "./db";
import { getCachedFuelData } from "./sigetra-api";
import { getFleetStatus } from "./volvo-api";

const MODEL = "claude-sonnet-4-20250514";

const CEO_CACHE_TTL = 30 * 60 * 1000;

let ceoDiagCache: { texto: string; timestamp: number } | null = null;

function getClient(): Anthropic {
  return new Anthropic();
}

function parsePeriodo(p: string): number {
  if (p === "1d" || p === "hoy") return 1;
  if (p === "7d") return 7;
  if (p === "30d") return 30;
  return 7;
}

async function getCoreData(dias: number) {
  const now = new Date();
  let from = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  if (from < DATA_START) from = new Date(DATA_START);
  const prevFrom = new Date(from.getTime() - dias * 24 * 60 * 60 * 1000);
  const prevTo = from;
  let prevFuelFrom = prevFrom < DATA_START ? new Date(DATA_START) : prevFrom;

  const [allCamiones, faenas, allFuelData, allFuelDataPrev, fleet, params] = await Promise.all([
    storage.getCamiones(),
    storage.getFaenas(),
    getCachedFuelData(from, now).catch(() => []),
    getCachedFuelData(prevFuelFrom, prevTo).catch(() => []),
    getFleetStatus().catch(() => []),
    storage.getParametros(),
  ]);

  const camiones = allCamiones.filter(c => c.vin != null);
  const fuelData = allFuelData;
  const fuelDataPrev = allFuelDataPrev;

  const allVins = new Set(camiones.map(c => c.vin).filter((v): v is string => v != null));
  const vinsOnline = new Set(fleet.filter((v: any) => allVins.has(v.vin)).map((v: any) => v.vin));
  const camionesActivos = camiones.filter(c => c.vin && vinsOnline.has(c.vin)).length;

  const litrosPeriodo = fuelData.reduce((s: number, r: any) => s + (r.cantidadLt || 0), 0);
  const litrosPrev = fuelDataPrev.reduce((s: number, r: any) => s + (r.cantidadLt || 0), 0);
  const litrosCambioPct = litrosPrev > 0 ? +((litrosPeriodo - litrosPrev) / litrosPrev * 100).toFixed(1) : 0;

  function matchPatente(record: any): string | null {
    const numVeh = record.numVeh != null ? String(record.numVeh) : null;
    const pat = record.patente || "";
    for (const cam of camiones) {
      if (numVeh && cam.patente === numVeh) return cam.patente;
      if (pat && cam.patente === pat) return cam.patente;
    }
    return numVeh || pat || null;
  }

  const byCamion = new Map<string, { litros: number; rendVals: number[]; desvMax: number }>();
  for (const r of fuelData as any[]) {
    const p = matchPatente(r);
    if (!p) continue;
    const t = byCamion.get(p) || { litros: 0, rendVals: [], desvMax: 0 };
    t.litros += r.cantidadLt || 0;
    if (r.rendReal && r.rendReal > 0 && r.rendReal < 20) t.rendVals.push(r.rendReal);
    const dev = Math.abs(r.desviacion || 0);
    if (dev > t.desvMax) t.desvMax = dev;
    byCamion.set(p, t);
  }

  const stats = camiones.map(cam => {
    const d = byCamion.get(cam.patente) || { litros: 0, rendVals: [], desvMax: 0 };
    const rend = d.rendVals.length > 0 ? +(d.rendVals.reduce((a, b) => a + b, 0) / d.rendVals.length).toFixed(2) : 0;
    const estado = d.desvMax > 40 ? "CRITICO" : d.desvMax > 15 ? "ALERTA" : "NORMAL";
    return { camionId: cam.id, faenaId: cam.faenaId, patente: cam.patente, modelo: cam.modelo, conductor: cam.conductor, rend, estado, litros: d.litros };
  });

  const criticos = stats.filter(s => s.estado === "CRITICO").length;
  const rendValues = stats.map(s => s.rend).filter(r => r > 0);
  const rendPromedio = rendValues.length > 0 ? +(rendValues.reduce((a, b) => a + b, 0) / rendValues.length).toFixed(2) : 0;

  const rendPrevByPatente = new Map<string, number[]>();
  for (const r of fuelDataPrev as any[]) {
    const p = String(r.patente || "");
    if (r.rendReal && r.rendReal > 0 && r.rendReal < 20) {
      const arr = rendPrevByPatente.get(p) || [];
      arr.push(r.rendReal);
      rendPrevByPatente.set(p, arr);
    }
  }
  const rendPrevAvgs = [...rendPrevByPatente.values()].map(v => v.reduce((a, b) => a + b, 0) / v.length);
  const rendPrev = rendPrevAvgs.length > 0 ? rendPrevAvgs.reduce((a, b) => a + b, 0) / rendPrevAvgs.length : 0;
  const rendCambioPct = rendPrev > 0 ? +((rendPromedio - rendPrev) / rendPrev * 100).toFixed(1) : 0;

  const limiteKmh = parseFloat(params.find(p => p.clave === "vel_max_kmh")?.valor || "90");
  let excesosVel = 0;
  const cencosudVinsForSpeed = new Set(camiones.map(c => c.vin).filter(Boolean));
  for (const v of fleet) {
    if (!cencosudVinsForSpeed.has((v as any).vin)) continue;
    const speed = (v as any).wheelBasedSpeed ?? (v as any).gps?.speed ?? 0;
    if (speed > limiteKmh) excesosVel++;
  }

  const litrosMicro = parseFloat(params.find(p => p.clave === "litros_micro_carga")?.valor || "100");
  const cargasPequenas = fuelData.filter((r: any) => (r.cantidadLt || 0) <= litrosMicro && (r.cantidadLt || 0) > 0);
  const microSospechas = cargasPequenas.length;

  return {
    camiones, faenas, fleet, stats, fuelData, params,
    totals: {
      camionesTotal: camiones.length,
      camionesActivos,
      rendPromedio,
      rendCambioPct,
      litrosPeriodo: Math.round(litrosPeriodo),
      litrosCambioPct,
      alertasCriticas: criticos,
      excesosVel,
      microSospechas,
    }
  };
}

export function registerCEORoutes(app: Express) {

  app.get("/api/ceo/kpis", async (req: Request, res: Response) => {
    try {
      const dias = parsePeriodo((req.query.periodo as string) || "7d");
      const { totals } = await getCoreData(dias);
      res.json(totals);
    } catch (error: any) {
      console.error("[ceo/kpis] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/ceo/contratos-estado", async (_req: Request, res: Response) => {
    try {
      const { faenas, stats, camiones, fleet } = await getCoreData(7);
      const vinsOnline = new Set(fleet.map((v: any) => v.vin));

      const allRend = stats.map(s => s.rend).filter(r => r > 0).sort((a, b) => a - b);
      const p50 = allRend.length > 3 ? allRend[Math.floor(allRend.length * 0.5)] : 0;

      const result = faenas
        .map(f => {
          const fStats = stats.filter(s => s.faenaId === f.id);
          if (fStats.length === 0) return null;
          const alertas = fStats.filter(s => s.estado === "CRITICO").length;
          const rendVals = fStats.map(s => s.rend).filter(r => r > 0);
          const rendProm = rendVals.length > 0 ? +(rendVals.reduce((a, b) => a + b, 0) / rendVals.length).toFixed(2) : 0;

          const fCamiones = camiones.filter(c => c.faenaId === f.id);
          const camActivos = fCamiones.filter(c => c.vin && vinsOnline.has(c.vin)).length;

          const estado = alertas >= 3 ? "CRITICO"
            : (alertas >= 1 || (p50 > 0 && rendProm > 0 && rendProm < p50)) ? "ATENCION"
            : "NORMAL";

          return {
            nombre: f.nombre,
            color: f.color,
            camionesTotal: fStats.length,
            camionesActivos: camActivos,
            rendPromedio: rendProm,
            alertasCriticas: alertas,
            estado,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => {
          const order: Record<string, number> = { CRITICO: 0, ATENCION: 1, NORMAL: 2 };
          return (order[a.estado] ?? 2) - (order[b.estado] ?? 2);
        });
      res.json(result);
    } catch (error: any) {
      console.error("[ceo/contratos-estado] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/ceo/contrato-detalle", async (req: Request, res: Response) => {
    try {
      const nombre = (req.query.nombre as string) || "";
      if (!nombre) return res.status(400).json({ message: "Se requiere parametro 'nombre'" });

      const { camiones, faenas, fuelData, fleet, stats } = await getCoreData(1);
      const faena = faenas.find(f => f.nombre === nombre);
      if (!faena) return res.status(404).json({ message: "Contrato no encontrado" });

      const vinsOnline = new Set(fleet.map((v: any) => v.vin));
      const fCamiones = camiones.filter(c => c.faenaId === faena.id);
      const fStats = stats.filter(s => s.faenaId === faena.id);

      const now = new Date();
      const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const fuelHoy = (fuelData as any[]).filter(r => {
        const fecha = new Date(r.fechaConsumo || r.fecha);
        if (fecha < hace24h || fecha > now) return false;
        return fCamiones.some(c => c.patente === String(r.numVeh || ""));
      });

      const litrosHoy = fuelHoy.reduce((s: number, r: any) => s + (r.cantidadLt || 0), 0);
      const rendVals = fuelHoy.map((r: any) => r.rendReal).filter((v: any) => v > 0 && v < 20);
      const rendHoy = rendVals.length > 0 ? +(rendVals.reduce((a: number, b: number) => a + b, 0) / rendVals.length).toFixed(2) : 0;
      const cargasHoy = fuelHoy.length;

      const camionesDetalleRaw = await Promise.all(fCamiones.map(async c => {
        const st = fStats.find(s => s.patente === c.patente);
        const online = c.vin ? vinsOnline.has(c.vin) : false;
        const volvo = fleet.find((v: any) => v.vin === c.vin);
        const speed = volvo ? ((volvo as any).wheelBasedSpeed ?? (volvo as any).gps?.speed ?? 0) : 0;

        const fuelCam = fuelHoy.filter((r: any) => {
          return String(r.numVeh || "") === c.patente;
        });
        const litrosCam = fuelCam.reduce((s: number, r: any) => s + (r.cantidadLt || 0), 0);

        let horasDetenido: number | null = null;
        try {
          const gpsRes = await pool.query(`
            SELECT velocidad_kmh::float as vel, timestamp_punto, lat::float, lng::float
            FROM geo_puntos WHERE patente = $1
            ORDER BY timestamp_punto DESC LIMIT 1
          `, [c.patente]);
          if (gpsRes.rows.length > 0) {
            const p = gpsRes.rows[0];
            if (p.vel === 0 || p.vel === null) {
              const h = (Date.now() - new Date(p.timestamp_punto).getTime()) / (1000 * 60 * 60);
              if (h > 1) horasDetenido = Math.round(h * 10) / 10;
            }
          }
        } catch {}

        return {
          patente: c.patente,
          modelo: c.modelo,
          conductor: c.conductor || "Sin asignar",
          online,
          velocidad: Math.round(speed),
          rendimiento: st?.rend ?? 0,
          litrosHoy: Math.round(litrosCam),
          estado: st?.estado ?? "NORMAL",
          cargasHoy: fuelCam.length,
          horasDetenido,
        };
      }));

      const camionesDetalle = camionesDetalleRaw.sort((a, b) => {
        const order: Record<string, number> = { CRITICO: 0, ALERTA: 1, NORMAL: 2 };
        return (order[a.estado] ?? 2) - (order[b.estado] ?? 2);
      });

      const alertasCriticas = fStats.filter(s => s.estado === "CRITICO").length;
      const alertasAlerta = fStats.filter(s => s.estado === "ALERTA").length;

      res.json({
        nombre: faena.nombre,
        color: faena.color,
        camionesTotal: fCamiones.length,
        camionesOnline: camionesDetalle.filter(c => c.online).length,
        litrosHoy: Math.round(litrosHoy),
        rendHoy,
        cargasHoy,
        alertasCriticas,
        alertasAlerta,
        camiones: camionesDetalle,
      });
    } catch (error: any) {
      console.error("[ceo/contrato-detalle] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ceo/contrato-ia-resumen", async (req: Request, res: Response) => {
    try {
      const { nombre } = req.body;
      if (!nombre) return res.status(400).json({ message: "Se requiere 'nombre'" });

      const detailRes = await new Promise<any>((resolve, reject) => {
        const mockReq = { query: { nombre } } as any;
        const mockRes = {
          json: (data: any) => resolve(data),
          status: (code: number) => ({ json: (data: any) => reject(new Error(data.message || `Error ${code}`)) }),
        } as any;
        (async () => {
          const { camiones, faenas, fuelData, fleet, stats } = await getCoreData(1);
          const faena = faenas.find((f: any) => f.nombre === nombre);
          if (!faena) return reject(new Error("Contrato no encontrado"));

          const vinsOnline = new Set(fleet.map((v: any) => v.vin));
          const fCamiones = camiones.filter((c: any) => c.faenaId === faena.id);
          const fStats = stats.filter((s: any) => s.faenaId === faena.id);
          const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

          const fuelHoy = (fuelData as any[]).filter(r => {
            const fecha = new Date(r.fechaConsumo || r.fecha);
            if (fecha < hace24h) return false;
            return fCamiones.some((c: any) => c.patente === String(r.numVeh || ""));
          });

          const litrosHoy = fuelHoy.reduce((s: number, r: any) => s + (r.cantidadLt || 0), 0);
          const criticos = fStats.filter((s: any) => s.estado === "CRITICO");

          resolve({
            nombre: faena.nombre,
            camiones: fCamiones.length,
            online: fCamiones.filter((c: any) => c.vin && vinsOnline.has(c.vin)).length,
            litrosHoy: Math.round(litrosHoy),
            cargas: fuelHoy.length,
            criticos: criticos.map((c: any) => c.patente),
          });
        })();
      });

      const client = getClient();
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 600,
        messages: [{
          role: "user",
          content: `Eres un analista de flotas de camiones. Genera un resumen ejecutivo de 3-4 lineas sobre el contrato "${nombre}" basandote en estos datos de las ultimas 24 horas. Se directo, usa numeros concretos. Responde en espanol.

Datos del contrato "${nombre}" (ultimas 24h):
- Camiones asignados: ${detailRes.camiones} (${detailRes.online} en linea)
- Litros cargados hoy: ${detailRes.litrosHoy}
- Cargas realizadas: ${detailRes.cargas}
- Camiones criticos: ${detailRes.criticos.length > 0 ? detailRes.criticos.join(", ") : "Ninguno"}

Indica si hay algo preocupante o si la operacion esta normal.`
        }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      res.json({ resumen: text });
    } catch (error: any) {
      console.error("[ceo/contrato-ia-resumen] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/ceo/tendencia", async (req: Request, res: Response) => {
    try {
      const dias = parseInt((req.query.dias as string) || "7");
      const { fuelData } = await getCoreData(dias);

      const byDay = new Map<string, { litros: number; km: number; count: number }>();
      for (let i = 0; i < dias; i++) {
        const d = new Date(Date.now() - (dias - 1 - i) * 24 * 60 * 60 * 1000);
        const key = d.toISOString().split("T")[0];
        byDay.set(key, { litros: 0, km: 0, count: 0 });
      }

      for (const r of fuelData as any[]) {
        const dateStr = r.fechaConsumo || "";
        if (!dateStr) continue;
        const key = new Date(dateStr).toISOString().split("T")[0];
        const day = byDay.get(key);
        if (day) {
          day.litros += r.cantidadLt || 0;
          if (r.rendReal && r.rendReal > 0 && r.rendReal < 20) {
            day.km += r.rendReal;
            day.count++;
          }
        }
      }

      const tendencia = [...byDay.entries()].map(([fecha, d]) => ({
        fecha,
        litrosDia: Math.round(d.litros),
        rendimientoDia: d.count > 0 ? +(d.km / d.count).toFixed(2) : 0,
      }));

      res.json(tendencia);
    } catch (error: any) {
      console.error("[ceo/tendencia] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/ceo/alertas", async (req: Request, res: Response) => {
    try {
      const limite = parseInt((req.query.limite as string) || "5");
      const { stats, camiones, faenas, fleet, params } = await getCoreData(7);

      const faenaMap = new Map(faenas.map(f => [f.id, f.nombre]));
      const vinsOnline = new Set(fleet.map((v: any) => v.vin));

      const alertas: { tipo: string; nivel: string; titulo: string; detalle: string; hace: string; gravedad: number; patente?: string; contrato?: string }[] = [];

      // ALERTA GPS: camión detenido más de 12h
      try {
        const camionesConVin = camiones.filter(c => c.vin && (c as any).activo !== false);
        for (const cam of camionesConVin) {
          const ultimoPunto = await pool.query(`
            SELECT lat::float, lng::float, velocidad_kmh::float as vel, timestamp_punto
            FROM geo_puntos
            WHERE patente = $1
            ORDER BY timestamp_punto DESC
            LIMIT 1
          `, [cam.patente]);

          if (ultimoPunto.rows.length === 0) continue;
          const punto = ultimoPunto.rows[0];
          const msDetenido = Date.now() - new Date(punto.timestamp_punto).getTime();
          const horasDetenido = msDetenido / (1000 * 60 * 60);

          if ((punto.vel === 0 || punto.vel === null) && horasDetenido > 12) {
            const faena = faenaMap.get(cam.faenaId ?? 0) || "Sin faena";
            alertas.push({
              tipo: "detenido_prolongado",
              nivel: "CRITICO",
              titulo: `${cam.patente} — Detenido ${Math.floor(horasDetenido)}h sin GPS`,
              detalle: `El camion lleva ${Math.floor(horasDetenido)} horas detenido en el mismo punto. Sin movimiento detectado.`,
              hace: `hace ${Math.floor(horasDetenido)}h ${Math.floor((horasDetenido % 1) * 60)}min`,
              gravedad: horasDetenido > 24 ? 100 : 85,
              patente: cam.patente,
              contrato: faena,
            });
          }
        }
      } catch (e: any) {
        console.error("[ceo/alertas] Error checking detenido_prolongado:", e.message);
      }

      for (const s of stats) {
        if (s.estado === "CRITICO") {
          const faena = faenaMap.get(s.faenaId ?? 0) || "Sin faena";
          alertas.push({
            tipo: "desviacion",
            nivel: "CRITICO",
            titulo: `Cam ${s.patente} — ${faena}`,
            detalle: `Desviacion grave en consumo de combustible. Rendimiento: ${s.rend > 0 ? s.rend.toFixed(2) : "N/D"} km/L`,
            hace: "periodo actual",
            gravedad: 10,
            patente: s.patente,
            contrato: faena,
          });
        }
      }

      const limiteKmh = parseFloat(params.find(p => p.clave === "vel_max_kmh")?.valor || "90");
      for (const v of fleet) {
        const speed = (v as any).wheelBasedSpeed ?? (v as any).gps?.speed ?? 0;
        if (speed > 105) {
          const cam = camiones.find(c => c.vin === (v as any).vin);
          if (cam) {
            const faena = faenaMap.get(cam.faenaId ?? 0) || "Sin faena";
            alertas.push({
              tipo: "exceso_velocidad",
              nivel: "CRITICO",
              titulo: `Cam ${cam.patente} — ${faena}`,
              detalle: `Exceso de velocidad grave: ${speed.toFixed(0)} km/h (limite ${limiteKmh} km/h)`,
              hace: "en tiempo real",
              gravedad: 9,
              patente: cam.patente,
              contrato: faena,
            });
          }
        }
      }

      try {
        const microRes = await fetch("http://localhost:5000/api/datos/micro-cargas");
        if (microRes.ok) {
          const microData = await microRes.json();
          const sosp = (microData.registros || []).filter((r: any) => r.nivel === "CRITICO" || r.nivel === "SOSPECHOSO");
          for (const r of sosp.slice(0, 3)) {
            const faena = r.faena || "Sin faena";
            alertas.push({
              tipo: "micro_carga",
              nivel: r.nivel === "CRITICO" ? "CRITICO" : "ALERTA",
              titulo: `Cam ${r.patente} — ${faena}`,
              detalle: `Micro-carga sospechosa: ${r.litros}L con ${r.senales?.length || 0} senales de alerta`,
              hace: r.fecha || "periodo actual",
              gravedad: r.nivel === "CRITICO" ? 8 : 6,
              patente: r.patente,
              contrato: faena,
            });
          }
        }
      } catch {}

      for (const cam of camiones) {
        if (!cam.vin) continue;
        if (!vinsOnline.has(cam.vin)) {
          const faena = faenaMap.get(cam.faenaId ?? 0) || "Sin faena";
          if (cam.syncAt) {
            const horasOffline = (Date.now() - new Date(cam.syncAt).getTime()) / (1000 * 60 * 60);
            if (horasOffline > 12) {
              alertas.push({
                tipo: "offline",
                nivel: "ALERTA",
                titulo: `Cam ${cam.patente} — ${faena}`,
                detalle: `Camion sin conexion hace ${Math.round(horasOffline)} horas`,
                hace: `${Math.round(horasOffline)}h offline`,
                gravedad: 5,
                patente: cam.patente,
                contrato: faena,
              });
            }
          }
        }
      }

      const rendSorted = stats.map(s => s.rend).filter(r => r > 0).sort((a, b) => a - b);
      const p25 = rendSorted.length > 3 ? rendSorted[Math.floor(rendSorted.length * 0.25)] : 0;
      if (p25 > 0) {
        for (const s of stats) {
          if (s.rend > 0 && s.rend < p25) {
            const faena = faenaMap.get(s.faenaId ?? 0) || "Sin faena";
            alertas.push({
              tipo: "rendimiento_bajo",
              nivel: "ALERTA",
              titulo: `Cam ${s.patente} — ${faena}`,
              detalle: `Rendimiento bajo: ${s.rend.toFixed(2)} km/L (P25 = ${p25.toFixed(2)} km/L)`,
              hace: "periodo actual",
              gravedad: 3,
              patente: s.patente,
              contrato: faena,
            });
          }
        }
      }

      alertas.sort((a, b) => b.gravedad - a.gravedad);
      res.json(alertas.slice(0, limite));
    } catch (error: any) {
      console.error("[ceo/alertas] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/ceo/investigar/:patente", async (req: Request, res: Response) => {
    try {
      const { patente } = req.params;

      const camRes = await pool.query(`
        SELECT c.id, c.patente, c.vin, c.modelo, c.sync_at,
               f.nombre as contrato
        FROM camiones c
        JOIN faenas f ON c.faena_id = f.id
        WHERE c.patente = $1
        LIMIT 1
      `, [patente]);

      if (camRes.rows.length === 0) {
        return res.status(404).json({ message: "Camion no encontrado" });
      }
      const cam = camRes.rows[0];

      const from30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const toNow = new Date();
      const allFuel = await getCachedFuelData(from30, toNow);
      const cargasFiltradas = allFuel
        .filter(f => f.patente === patente)
        .sort((a, b) => new Date(b.fechaConsumo).getTime() - new Date(a.fechaConsumo).getTime())
        .slice(0, 15);

      const viajesRes = await pool.query(`
        SELECT va.fecha_inicio, va.fecha_fin, va.origen_nombre, va.destino_nombre,
               va.km_ecu::float, va.litros_consumidos_ecu::float as litros_ecu,
               va.litros_cargados_sigetra::float as litros_sigetra,
               va.rendimiento_real::float as rendimiento, va.conductor,
               va.score_anomalia::int as score, va.estado,
               va.duracion_minutos::int as duracion_min,
               va.velocidad_maxima::float as vel_max
        FROM viajes_aprendizaje va
        WHERE va.camion_id = $1
        ORDER BY va.fecha_inicio DESC
        LIMIT 10
      `, [cam.id]);

      let gpsUltimo = null;
      const gpsRes = await pool.query(`
        SELECT lat::float, lng::float, velocidad_kmh::float as vel, timestamp_punto
        FROM geo_puntos
        WHERE camion_id = $1
        ORDER BY timestamp_punto DESC
        LIMIT 1
      `, [cam.id]);
      if (gpsRes.rows.length > 0) {
        gpsUltimo = gpsRes.rows[0];
      }

      let snapshotEcu = null;
      if (cam.vin) {
        const snapRes = await pool.query(`
          SELECT total_fuel_used, total_distance, captured_at
          FROM volvo_fuel_snapshots
          WHERE vin = $1
          ORDER BY captured_at DESC
          LIMIT 2
        `, [cam.vin]);
        if (snapRes.rows.length >= 2) {
          const ultimo = snapRes.rows[0];
          const previo = snapRes.rows[1];
          snapshotEcu = {
            litrosAcumulados: Math.round((ultimo.total_fuel_used || 0) / 1000),
            kmAcumulados: Math.round((ultimo.total_distance || 0) / 1000),
            litrosDelta: Math.round(((ultimo.total_fuel_used || 0) - (previo.total_fuel_used || 0)) / 1000 * 100) / 100,
            kmDelta: Math.round(((ultimo.total_distance || 0) - (previo.total_distance || 0)) / 1000 * 10) / 10,
            ultimaCaptura: ultimo.captured_at,
          };
        }
      }

      const conductoresRes = await pool.query(`
        SELECT DISTINCT conductor FROM viajes_aprendizaje
        WHERE camion_id = $1 AND conductor IS NOT NULL AND conductor != ''
        ORDER BY conductor
      `, [cam.id]);

      const conductoresSigetra = [...new Set(cargasFiltradas.map(c => c.nombreConductor).filter(Boolean))];

      const totalCargas = cargasFiltradas.length;
      const totalLitrosCargados = cargasFiltradas.reduce((s, c) => s + (c.cantidadLt || 0), 0);

      res.json({
        camion: {
          patente: cam.patente,
          vin: cam.vin,
          modelo: cam.modelo,
          ano: null,
          contrato: cam.contrato,
          ultimaSync: cam.sync_at,
        },
        conductores: [...new Set([...conductoresRes.rows.map((r: any) => r.conductor), ...conductoresSigetra])].filter(Boolean),
        cargas: cargasFiltradas.map(c => ({
          fecha: c.fechaConsumo,
          litros: c.cantidadLt || 0,
          odometro: c.odometroActual || 0,
          odometroPrevio: c.odometroPrevio || 0,
          conductor: c.nombreConductor,
          estacion: c.lugarConsumo,
          ciudad: c.faena,
        })),
        viajes: viajesRes.rows,
        gpsUltimo,
        snapshotEcu,
        resumen: {
          totalCargas,
          totalLitrosCargados: Math.round(totalLitrosCargados),
          totalViajes: viajesRes.rows.length,
          rendimientoPromedio: viajesRes.rows.length > 0
            ? Math.round(viajesRes.rows.reduce((s: number, v: any) => s + (v.rendimiento || 0), 0) / viajesRes.rows.length * 100) / 100
            : null,
        },
      });
    } catch (error: any) {
      console.error("[ceo/investigar] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/ceo/diagnostico-ia", async (req: Request, res: Response) => {
    try {
      const force = req.query.force === "true";

      if (!force && ceoDiagCache && Date.now() - ceoDiagCache.timestamp < CEO_CACHE_TTL) {
        const minAgo = Math.round((Date.now() - ceoDiagCache.timestamp) / 60000);
        return res.json({ texto: ceoDiagCache.texto, generadoHaceMin: minAgo, cached: true });
      }

      const { totals } = await getCoreData(7);

      const prompt = `Eres el analista ejecutivo de SOTRASER, empresa de transporte de carga en Chile.
Genera diagnostico ejecutivo del contrato CENCOSUD para el CEO.

Datos actuales del contrato CENCOSUD:
- Camiones activos: ${totals.camionesActivos} de ${totals.camionesTotal}
- Rendimiento flota: ${totals.rendPromedio} km/L
- Cambio vs semana anterior: ${totals.rendCambioPct}%
- Litros periodo: ${totals.litrosPeriodo}L
- Alertas criticas: ${totals.alertasCriticas}
- Excesos velocidad detectados: ${totals.excesosVel}
- Micro-cargas sospechosas: ${totals.microSospechas}

Responde exactamente en 4 lineas en espanol:
ESTADO: [estado general de la operacion hoy]
POSITIVO: [algo concreto que esta funcionando bien]
ATENCION: [el problema mas urgente con datos]
ACCION: [una accion especifica recomendada para hoy]

Sin formato adicional. Solo las 4 lineas.`;

      const client = getClient();
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      });

      const texto = response.content[0].type === "text" ? response.content[0].text : "Sin datos disponibles.";
      ceoDiagCache = { texto, timestamp: Date.now() };
      res.json({ texto, generadoHaceMin: 0, cached: false });
    } catch (error: any) {
      console.error("[ceo/diagnostico-ia] Error:", error.message);
      if (ceoDiagCache) {
        const minAgo = Math.round((Date.now() - ceoDiagCache.timestamp) / 60000);
        return res.json({ texto: ceoDiagCache.texto, generadoHaceMin: minAgo, cached: true, error: error.message });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════
  // CUADRATURA POR CONTRATO — Endpoint Maestro
  // GET /api/contratos/cuadratura-mensual?contrato=X
  // ═══════════════════════════════════════════════════════
  app.get("/api/contratos/cuadratura-mensual", async (req: Request, res: Response) => {
    try {
      const contrato = (req.query.contrato as string) || "TODOS";

      const hoy = new Date();
      const ayer = new Date(hoy);
      ayer.setDate(ayer.getDate() - 1);
      ayer.setHours(23, 59, 59, 999);

      const { rows: [dateRange] } = await pool.query(`
        SELECT MIN(fecha_inicio)::text as min_fecha, MAX(fecha_inicio)::text as max_fecha
        FROM viajes_aprendizaje WHERE km_ecu > 0
      `);

      let query = `
        SELECT 
          va.id, va.contrato, c.patente, c.modelo, c.meta_km_l,
          va.km_ecu, va.litros_consumidos_ecu, va.litros_cargados_sigetra,
          va.rendimiento_real, va.conductor, va.delta_cuadratura,
          va.fecha_inicio, va.fecha_fin, va.duracion_minutos,
          va.origen_nombre, va.destino_nombre,
          va.sigetra_cruzado
        FROM viajes_aprendizaje va
        JOIN camiones c ON va.camion_id = c.id
        WHERE va.km_ecu > 0
          AND c.vin IS NOT NULL AND c.vin != ''
      `;
      const params: any[] = [];

      if (contrato && contrato !== "TODOS") {
        query += ` AND va.contrato = $1`;
        params.push(contrato);
      }

      query += ` ORDER BY va.fecha_inicio DESC`;

      const { rows: operaciones } = await pool.query(query, params);

      function getCalidadCierre(litrosEcu: number, litrosSigetra: number): string {
        if (litrosEcu <= 0 || litrosSigetra <= 0) return "PENDIENTE";
        const deltaPct = Math.abs(litrosSigetra - litrosEcu) / litrosEcu * 100;
        if (deltaPct < 5) return "PERFECTA";
        if (deltaPct < 15) return "BUENA";
        if (deltaPct < 25) return "ACEPTABLE";
        return "CON_ALERTA";
      }

      const porCamion: Record<string, {
        patente: string;
        conductor: string;
        contrato: string;
        modelo: string;
        meta_kmL: number;
        operaciones: any[];
        km_total: number;
        litros_ecu_total: number;
        litros_sigetra_total: number;
        rendimiento_promedio: number | null;
        operaciones_perfectas: number;
        operaciones_buenas: number;
        operaciones_aceptables: number;
        operaciones_con_alerta: number;
        balance_total: number;
        mejor_rendimiento: number | null;
        peor_rendimiento: number | null;
        tendencia: string;
      }> = {};

      const verificadas: any[] = [];

      for (const op of operaciones) {
        const litrosEcu = parseFloat(op.litros_consumidos_ecu) || 0;
        const litrosSigetra = parseFloat(op.litros_cargados_sigetra) || 0;
        const kmEcu = parseFloat(op.km_ecu) || 0;
        const rend = parseFloat(op.rendimiento_real) || 0;
        const calidad = getCalidadCierre(litrosEcu, litrosSigetra);

        if (calidad === "PENDIENTE" && litrosEcu <= 0) continue;
        verificadas.push({ ...op, calidad, litrosEcu, litrosSigetra, kmEcu, rend });

        const key = op.patente;
        if (!porCamion[key]) {
          porCamion[key] = {
            patente: op.patente,
            conductor: op.conductor || "Sin asignar",
            contrato: op.contrato || "",
            modelo: op.modelo || "",
            meta_kmL: op.meta_km_l || 2.85,
            operaciones: [],
            km_total: 0,
            litros_ecu_total: 0,
            litros_sigetra_total: 0,
            rendimiento_promedio: null,
            operaciones_perfectas: 0,
            operaciones_buenas: 0,
            operaciones_aceptables: 0,
            operaciones_con_alerta: 0,
            balance_total: 0,
            mejor_rendimiento: null,
            peor_rendimiento: null,
            tendencia: "ESTABLE",
          };
        }

        const c = porCamion[key];
        c.operaciones.push({ ...op, calidad });
        c.km_total += kmEcu;
        c.litros_ecu_total += litrosEcu;
        c.litros_sigetra_total += litrosSigetra;

        if (calidad === "PERFECTA") c.operaciones_perfectas++;
        else if (calidad === "BUENA") c.operaciones_buenas++;
        else if (calidad === "ACEPTABLE") c.operaciones_aceptables++;

        if (rend > 0) {
          if (c.mejor_rendimiento === null || rend > c.mejor_rendimiento) c.mejor_rendimiento = rend;
          if (c.peor_rendimiento === null || rend < c.peor_rendimiento) c.peor_rendimiento = rend;
        }
      }

      for (const cam of Object.values(porCamion)) {
        if (cam.litros_ecu_total > 0 && cam.km_total > 0) {
          cam.rendimiento_promedio = Math.round((cam.km_total / cam.litros_ecu_total) * 100) / 100;
        }
        cam.balance_total = Math.round(cam.litros_sigetra_total - cam.litros_ecu_total);

        const mitad = Math.floor(cam.operaciones.length / 2);
        if (mitad >= 2) {
          const primera = cam.operaciones.slice(0, mitad);
          const segunda = cam.operaciones.slice(mitad);
          const rendPrimera = primera.filter((o: any) => parseFloat(o.rendimiento_real) > 0);
          const rendSegunda = segunda.filter((o: any) => parseFloat(o.rendimiento_real) > 0);
          if (rendPrimera.length > 0 && rendSegunda.length > 0) {
            const avgP = rendPrimera.reduce((s: number, o: any) => s + parseFloat(o.rendimiento_real), 0) / rendPrimera.length;
            const avgS = rendSegunda.reduce((s: number, o: any) => s + parseFloat(o.rendimiento_real), 0) / rendSegunda.length;
            const diff = ((avgS - avgP) / avgP) * 100;
            cam.tendencia = diff > 5 ? "MEJORANDO" : diff < -5 ? "EMPEORANDO" : "ESTABLE";
          }
        }
      }

      const camionesArr = Object.values(porCamion);
      const totalKm = camionesArr.reduce((s, c) => s + c.km_total, 0);
      const totalLitrosEcu = camionesArr.reduce((s, c) => s + c.litros_ecu_total, 0);
      const totalLitrosSigetra = camionesArr.reduce((s, c) => s + c.litros_sigetra_total, 0);

      const resumen = {
        periodo: {
          desde: dateRange?.min_fecha ? dateRange.min_fecha.slice(0, 10) : hoy.toISOString().slice(0, 10),
          hasta: dateRange?.max_fecha ? dateRange.max_fecha.slice(0, 10) : hoy.toISOString().slice(0, 10),
          dias: dateRange?.min_fecha && dateRange?.max_fecha
            ? Math.max(1, Math.ceil((new Date(dateRange.max_fecha).getTime() - new Date(dateRange.min_fecha).getTime()) / (1000 * 60 * 60 * 24)))
            : 1,
        },
        total_operaciones: verificadas.length,
        camiones_activos: camionesArr.length,
        km_total: Math.round(totalKm),
        litros_ecu_total: Math.round(totalLitrosEcu),
        litros_sigetra_total: Math.round(totalLitrosSigetra),
        balance_total: Math.round(totalLitrosSigetra - totalLitrosEcu),
        rendimiento_promedio: totalLitrosEcu > 0 ? Math.round((totalKm / totalLitrosEcu) * 100) / 100 : null,
        calidad_distribucion: {
          perfectas: verificadas.filter(o => o.calidad === "PERFECTA").length,
          buenas: verificadas.filter(o => o.calidad === "BUENA").length,
          aceptables: verificadas.filter(o => o.calidad === "ACEPTABLE").length,
        },
        cobertura_pct: Math.round((verificadas.length / Math.max(1, camionesArr.length * 20)) * 100),
      };

      const camionesOrdenados = camionesArr.sort((a, b) => b.balance_total - a.balance_total);

      res.json({ resumen, camiones: camionesOrdenados });
    } catch (error: any) {
      console.error("[contratos/cuadratura-mensual] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════
  // CUADRATURA POR CAMION — Detalle individual
  // GET /api/contratos/cuadratura-camion?patente=X
  // ═══════════════════════════════════════════════════════
  app.get("/api/contratos/cuadratura-camion", async (req: Request, res: Response) => {
    try {
      const patente = req.query.patente as string;
      if (!patente) return res.status(400).json({ error: "patente requerida" });

      const { rows: operaciones } = await pool.query(`
        SELECT 
          va.id, va.contrato, c.patente, c.modelo, c.meta_km_l, c.conductor as cam_conductor,
          va.km_ecu, va.litros_consumidos_ecu, va.litros_cargados_sigetra,
          va.rendimiento_real, va.conductor, va.delta_cuadratura,
          va.fecha_inicio, va.fecha_fin, va.duracion_minutos,
          va.origen_nombre, va.destino_nombre, va.sigetra_cruzado
        FROM viajes_aprendizaje va
        JOIN camiones c ON va.camion_id = c.id
        WHERE c.patente = $1
          AND va.km_ecu > 0
        ORDER BY va.fecha_inicio DESC
      `, [patente]);

      const { rows: camionData } = await pool.query(
        `SELECT patente, modelo, meta_km_l, conductor FROM camiones WHERE patente = $1 LIMIT 1`,
        [patente]
      );

      const { rows: perfilData } = await pool.query(
        `SELECT total_jornadas, score_rendimiento, tendencia FROM camiones_perfil WHERE patente = $1 LIMIT 1`,
        [patente]
      );

      function getCalidadCierre(litrosEcu: number, litrosSigetra: number): string {
        if (litrosEcu <= 0 || litrosSigetra <= 0) return "PENDIENTE";
        const deltaPct = Math.abs(litrosSigetra - litrosEcu) / litrosEcu * 100;
        if (deltaPct < 5) return "PERFECTA";
        if (deltaPct < 15) return "BUENA";
        if (deltaPct < 25) return "ACEPTABLE";
        return "CON_ALERTA";
      }

      const opsProcesadas = operaciones.map(op => {
        const litrosEcu = parseFloat(op.litros_consumidos_ecu) || 0;
        const litrosSigetra = parseFloat(op.litros_cargados_sigetra) || 0;
        return { ...op, litrosEcu, litrosSigetra, calidad: getCalidadCierre(litrosEcu, litrosSigetra) };
      });

      const conAlerta = opsProcesadas.filter(o => o.calidad === "CON_ALERTA");

      const kmTotal = opsProcesadas.reduce((s, o) => s + (parseFloat(o.km_ecu) || 0), 0);
      const litrosEcuTotal = opsProcesadas.reduce((s, o) => s + o.litrosEcu, 0);
      const litrosSigetraTotal = opsProcesadas.reduce((s, o) => s + o.litrosSigetra, 0);

      function getSemanaLabel(fecha: Date): string {
        return `S${Math.ceil(fecha.getDate() / 7)}`;
      }

      const porSemana: Record<string, { km: number; litros: number; ops: number }> = {};
      for (const op of opsProcesadas) {
        const semana = getSemanaLabel(new Date(op.fecha_inicio));
        if (!porSemana[semana]) porSemana[semana] = { km: 0, litros: 0, ops: 0 };
        porSemana[semana].km += parseFloat(op.km_ecu) || 0;
        porSemana[semana].litros += op.litrosEcu;
        porSemana[semana].ops++;
      }

      const tendenciaSemanal = Object.entries(porSemana).map(([semana, d]) => ({
        semana,
        rendimiento: d.litros > 0 ? Math.round((d.km / d.litros) * 100) / 100 : null,
        km: Math.round(d.km),
        litros: Math.round(d.litros),
        operaciones: d.ops,
      }));

      const metaKmL = camionData[0]?.meta_km_l || 2.85;
      const rendimientoPromedio = litrosEcuTotal > 0 ? Math.round((kmTotal / litrosEcuTotal) * 100) / 100 : null;

      res.json({
        patente,
        conductor: operaciones[0]?.conductor || camionData[0]?.conductor || "Sin asignar",
        contrato: operaciones[0]?.contrato || "",
        modelo: camionData[0]?.modelo || "",
        meta_kmL: metaKmL,

        resumen_mes: {
          total_operaciones: opsProcesadas.length,
          operaciones_verificadas: opsProcesadas.length,
          operaciones_con_alerta: conAlerta.length,
          km_total: Math.round(kmTotal),
          litros_ecu_total: Math.round(litrosEcuTotal),
          litros_sigetra_total: Math.round(litrosSigetraTotal),
          balance_litros: Math.round(litrosSigetraTotal - litrosEcuTotal),
          balance_pct: litrosEcuTotal > 0 ? Math.round(((litrosSigetraTotal - litrosEcuTotal) / litrosEcuTotal) * 100) : null,
          rendimiento_promedio: rendimientoPromedio,
          vs_meta: metaKmL && litrosEcuTotal > 0
            ? Math.round(((kmTotal / litrosEcuTotal - metaKmL) / metaKmL) * 100)
            : null,
        },

        tendencia_semanal: tendenciaSemanal,

        perfil_aprendido: perfilData[0] ? {
          total_jornadas: perfilData[0].total_jornadas,
          score: parseFloat(perfilData[0].score_rendimiento) || 0,
          tendencia: perfilData[0].tendencia,
          confianza: (perfilData[0].total_jornadas >= 30 ? "ALTA" : perfilData[0].total_jornadas >= 10 ? "MEDIA" : "BAJA"),
        } : null,

        operaciones: opsProcesadas.map(op => ({
          id: op.id,
          fecha: op.fecha_inicio,
          origen: op.origen_nombre,
          destino: op.destino_nombre,
          km_ecu: parseFloat(op.km_ecu) || 0,
          litros_ecu: op.litrosEcu,
          litros_sigetra: op.litrosSigetra,
          rendimiento: parseFloat(op.rendimiento_real) || 0,
          duracion_horas: op.duracion_minutos ? Math.round((op.duracion_minutos / 60) * 10) / 10 : null,
          calidad: op.calidad,
          balance: op.litrosSigetra > 0 && op.litrosEcu > 0
            ? Math.round(op.litrosSigetra - op.litrosEcu)
            : null,
        })),
      });
    } catch (error: any) {
      console.error("[contratos/cuadratura-camion] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  // ── Dashboard maestro por contrato ──
  app.get("/api/contratos/dashboard/:contrato", async (req: Request, res: Response) => {
    try {
      const contrato = String(req.params.contrato);
      const hoy = new Date();
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
      const diaActual = hoy.getDate();
      const diasRestantes = diasMes - diaActual;

      // Camiones válidos del contrato
      const camR = await pool.query(`
        SELECT DISTINCT c.patente, c.vin, c.modelo
        FROM camiones c
        JOIN faenas f ON c.faena_id = f.id
        WHERE f.nombre = $1 AND c.vin IS NOT NULL AND c.vin != ''
          AND c.vin IN (SELECT DISTINCT vin FROM volvo_fuel_snapshots WHERE captured_at::timestamp >= NOW() - INTERVAL '30 days')
        ORDER BY c.patente
      `, [contrato]);

      const patentes = camR.rows.map((c: any) => c.patente);
      if (!patentes.length) {
        return res.json({ contrato, sin_datos: true, mensaje: "Sin camiones válidos" });
      }

      // KPIs por camión este mes
      const kpisR = await pool.query(`
        SELECT c.patente,
          COALESCE(SUM(va.km_ecu::float), 0) as km_total,
          COALESCE(SUM(va.litros_consumidos_ecu::float), 0) as litros_total,
          COUNT(*)::int as viajes
        FROM viajes_aprendizaje va
        JOIN camiones c ON va.camion_id = c.id
        WHERE va.contrato = $1 AND va.fecha_inicio >= $2 AND va.km_ecu::float > 0
          AND c.vin IS NOT NULL AND c.vin != ''
        GROUP BY c.patente
      `, [contrato, inicioMes]);

      const kmTotal = kpisR.rows.reduce((s: number, r: any) => s + parseFloat(r.km_total), 0);
      const litrosTotal = kpisR.rows.reduce((s: number, r: any) => s + parseFloat(r.litros_total), 0);
      const rendPromedio = litrosTotal > 0 ? Math.round(kmTotal / litrosTotal * 100) / 100 : null;
      const totalViajes = kpisR.rows.reduce((s: number, r: any) => s + r.viajes, 0);

      // Meta
      const META: Record<string, number> = {};
      const metaPorCamion = META[contrato] || null;
      const metaTotal = metaPorCamion ? metaPorCamion * patentes.length : null;
      const proyeccion = metaTotal && diaActual > 0 ? Math.round(kmTotal + (kmTotal / diaActual * diasRestantes)) : null;
      let estadoMeta = "SIN_META";
      if (proyeccion && metaTotal) {
        if (proyeccion >= metaTotal * 0.98) estadoMeta = "CUMPLIRA";
        else if (proyeccion >= metaTotal * 0.85) estadoMeta = "EN_RIESGO";
        else estadoMeta = "NO_CUMPLIRA";
      }

      // Corredores
      const corrR = await pool.query(`
        SELECT id, nombre, origen_nombre, destino_nombre, origen_lat, origen_lng, destino_lat, destino_lng,
          total_viajes, rendimiento_promedio, rendimiento_mejor, rendimiento_peor, km_total
        FROM corredores_operacionales WHERE contrato = $1 AND activo = true ORDER BY total_viajes DESC LIMIT 20
      `, [contrato]);

      // KPIs por camión
      const camiones = kpisR.rows.map((k: any) => {
        const km = parseFloat(k.km_total);
        const lit = parseFloat(k.litros_total);
        const rend = lit > 0 ? Math.round(km / lit * 100) / 100 : null;
        const metaPct = metaPorCamion ? Math.round(km / metaPorCamion * 100) : null;
        const proy = metaPorCamion && diaActual > 0 ? Math.round(km + (km / diaActual * diasRestantes)) : null;
        return {
          patente: k.patente, km_mes: Math.round(km), litros_mes: Math.round(lit),
          rendimiento: rend, viajes: k.viajes, meta_pct: metaPct, proyeccion: proy,
          estado_meta: metaPorCamion ? (proy! >= metaPorCamion * 0.98 ? "CUMPLIRA" : proy! >= metaPorCamion * 0.85 ? "EN_RIESGO" : "NO_CUMPLIRA") : "SIN_META",
        };
      }).sort((a: any, b: any) => b.km_mes - a.km_mes);

      // Anomalías
      const anomCombR = await pool.query(`
        SELECT COUNT(*)::int as total FROM operaciones_cerradas
        WHERE contrato = $1 AND nivel_anomalia IN ('CRITICO','SOSPECHOSO') AND km_ecu >= 200 AND snap_count >= 15 AND horas_periodo >= 24 AND revisado = false AND carga_a_fecha >= $2
      `, [contrato, inicioMes]);
      const anomVelR = await pool.query(`
        SELECT COUNT(DISTINCT gp.patente)::int as camiones, COUNT(*)::int as excesos
        FROM geo_puntos gp JOIN camiones c ON gp.camion_id = c.id
        WHERE gp.velocidad_kmh::float > 105 AND c.vin IS NOT NULL
          AND gp.timestamp_punto >= $1 AND c.patente = ANY($2)
      `, [inicioMes, patentes]);
      const bajoMeta = camiones.filter((c: any) => c.estado_meta === "NO_CUMPLIRA").length;

      res.json({
        contrato,
        periodo: { desde: inicioMes.toISOString().slice(0, 10), hasta: hoy.toISOString().slice(0, 10), dia_actual: diaActual, dias_mes: diasMes },
        kpis: {
          km_total: Math.round(kmTotal), litros_total: Math.round(litrosTotal), rendimiento_promedio: rendPromedio,
          total_camiones: patentes.length, total_viajes: totalViajes,
          meta_km_total: metaTotal, proyeccion_km: proyeccion, estado_meta: estadoMeta,
          km_diarios_necesarios: metaTotal && diasRestantes > 0 ? Math.ceil((metaTotal - kmTotal) / diasRestantes) : null,
        },
        corredores: corrR.rows,
        camiones,
        anomalias: {
          combustible_critico: anomCombR.rows[0]?.total || 0,
          velocidad_camiones: anomVelR.rows[0]?.camiones || 0,
          velocidad_excesos: anomVelR.rows[0]?.excesos || 0,
          rendimiento_bajo_meta: bajoMeta,
        },
      });
    } catch (error: any) {
      console.error("[contratos/dashboard] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  // Análisis de operaciones similares
  app.get("/api/contratos/analisis-operaciones/:contrato", async (req: Request, res: Response) => {
    try {
      const { contrato } = req.params;
      const dias = parseInt(req.query.dias as string || "30");
      const desde = new Date(); desde.setDate(desde.getDate() - dias);

      const viajesR = await pool.query(`
        SELECT va.id, c.patente, va.conductor, va.contrato, va.origen_nombre, va.destino_nombre,
          va.destino_lat::float as destino_lat, va.destino_lng::float as destino_lng,
          va.km_ecu::float as km_ecu, va.litros_consumidos_ecu::float as litros_ecu,
          va.rendimiento_real::float as rendimiento_ecu, va.duracion_minutos::float / 60.0 as duracion_horas,
          va.fecha_inicio
        FROM viajes_aprendizaje va
        JOIN camiones c ON va.camion_id = c.id
        WHERE va.contrato = $1 AND va.fecha_inicio >= $2 AND va.km_ecu::float > 50
          AND va.rendimiento_real::float > 0 AND va.destino_lat IS NOT NULL
          AND c.vin IS NOT NULL AND c.vin != ''
        ORDER BY va.fecha_inicio DESC
      `, [contrato, desde]);

      if (!viajesR.rows.length) return res.json({ grupos: [], total_viajes: 0, contrato });

      // Agrupación por similitud operacional
      const grupos: any[] = [];
      for (const v of viajesR.rows) {
        const km = v.km_ecu || 0;
        const dLat = v.destino_lat || 0;
        const dLng = v.destino_lng || 0;
        let matched = false;

        for (const g of grupos) {
          const distDest = Math.sqrt(Math.pow(dLat - g.cLat, 2) + Math.pow(dLng - g.cLng, 2)) * 111;
          if (distDest > 30) continue;
          const diffKm = Math.abs(km - g.kmProm) / (g.kmProm || 1);
          if (diffKm > 0.15) continue;
          g.viajes.push(v);
          const n = g.viajes.length;
          g.cLat = g.viajes.reduce((s: number, v: any) => s + (v.destino_lat || 0), 0) / n;
          g.cLng = g.viajes.reduce((s: number, v: any) => s + (v.destino_lng || 0), 0) / n;
          g.kmProm = g.viajes.reduce((s: number, v: any) => s + (v.km_ecu || 0), 0) / n;
          matched = true;
          break;
        }
        if (!matched) {
          grupos.push({ id: grupos.length + 1, nombre: v.destino_nombre || "?", cLat: dLat, cLng: dLng, kmProm: km, viajes: [v] });
        }
      }

      const result = grupos.filter(g => g.viajes.length >= 2).map(g => {
        const rends = g.viajes.map((v: any) => v.rendimiento_ecu).filter((r: number) => r > 0);
        const rendProm = rends.length ? rends.reduce((s: number, r: number) => s + r, 0) / rends.length : 0;
        const rendMejor = rends.length ? Math.max(...rends) : 0;
        const rendPeor = rends.length ? Math.min(...rends) : 0;
        const brecha = rendPeor > 0 ? Math.round((rendMejor - rendPeor) / rendPeor * 100) : 0;

        const porCamion: Record<string, any> = {};
        for (const v of g.viajes) {
          if (!porCamion[v.patente]) porCamion[v.patente] = { patente: v.patente, conductor: v.conductor, viajes: 0, rends: [], km: 0 };
          porCamion[v.patente].viajes++;
          if (v.rendimiento_ecu > 0) porCamion[v.patente].rends.push(v.rendimiento_ecu);
          porCamion[v.patente].km += v.km_ecu || 0;
        }
        const camiones = Object.values(porCamion).map((c: any) => ({
          patente: c.patente, conductor: c.conductor, viajes: c.viajes, km_total: Math.round(c.km),
          rend_promedio: c.rends.length ? Math.round(c.rends.reduce((s: number, r: number) => s + r, 0) / c.rends.length * 100) / 100 : null,
        })).sort((a: any, b: any) => (b.rend_promedio || 0) - (a.rend_promedio || 0));

        const mitad = Math.floor(g.viajes.length / 2);
        const recientes = g.viajes.slice(0, mitad);
        const anteriores = g.viajes.slice(mitad);
        const rendRec = recientes.length ? recientes.reduce((s: number, v: any) => s + (v.rendimiento_ecu || 0), 0) / recientes.length : 0;
        const rendAnt = anteriores.length ? anteriores.reduce((s: number, v: any) => s + (v.rendimiento_ecu || 0), 0) / anteriores.length : 0;
        const tendencia = rendAnt > 0 ? Math.round((rendRec - rendAnt) / rendAnt * 100) : 0;

        const kms = g.viajes.map((v: any) => v.km_ecu || 0);
        return {
          id: g.id, destino_nombre: g.nombre, km_promedio: Math.round(g.kmProm),
          km_min: Math.round(Math.min(...kms)), km_max: Math.round(Math.max(...kms)),
          total_viajes: g.viajes.length, total_camiones: camiones.length,
          rend_promedio: Math.round(rendProm * 100) / 100, rend_mejor: Math.round(rendMejor * 100) / 100,
          rend_peor: Math.round(rendPeor * 100) / 100, brecha_pct: brecha, tendencia_pct: tendencia,
          camiones, ultimo_viaje: g.viajes[0]?.fecha_inicio,
        };
      }).sort((a, b) => b.total_viajes - a.total_viajes);

      res.json({ contrato, periodo_dias: dias, total_viajes: viajesR.rows.length, total_grupos: result.length, grupos: result });
    } catch (error: any) {
      console.error("[analisis-ops] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });
}
