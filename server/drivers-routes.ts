import type { Express, Request, Response } from "express";
import { pool, DATA_START } from "./db";
import { calcularScoreAdaptativo, scoreNivelGlobal, type ScoreParam, type ScoreResult } from "./score-conduccion";
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const BASELINES_FILE = path.join(DATA_DIR, "driver_baselines.json");
const EVENTS_FILE = path.join(DATA_DIR, "driver_events.jsonl");
const START_DATE = DATA_START.toISOString().slice(0,10);

interface DriverBaseline {
  nombre: string;
  vin: string;
  patente: string;
  semanas: { semana: string; score: number; anticipacion: number; velocidad: number; motor: number; combustible: number }[];
  baseline: number;
  variabilidad: number;
  umbralAlerta: number;
  ultimaActualizacion: string;
}

interface DriverEvent {
  vin: string;
  tipo: string;
  lat?: number;
  lng?: number;
  fecha: string;
  velocidad?: number;
  descripcion: string;
}

function loadBaselines(): Record<string, DriverBaseline> {
  try {
    if (fs.existsSync(BASELINES_FILE)) {
      return JSON.parse(fs.readFileSync(BASELINES_FILE, "utf8"));
    }
  } catch (e) {
    console.warn("[drivers] Error loading baselines:", e);
  }
  return {};
}

function saveBaselines(data: Record<string, DriverBaseline>) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(BASELINES_FILE, JSON.stringify(data, null, 2));
}

function appendEvent(event: DriverEvent) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(EVENTS_FILE, JSON.stringify(event) + "\n");
}

function loadEvents(): DriverEvent[] {
  try {
    if (fs.existsSync(EVENTS_FILE)) {
      const lines = fs.readFileSync(EVENTS_FILE, "utf8").trim().split("\n").filter(Boolean);
      return lines.map(l => JSON.parse(l));
    }
  } catch (e) {
    console.warn("[drivers] Error loading events:", e);
  }
  return [];
}

function getCurrentWeekString(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const weekNum = Math.ceil(diff / (7 * 24 * 60 * 60 * 1000));
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function getWeekString(date: Date): string {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - start.getTime();
  const weekNum = Math.ceil(diff / (7 * 24 * 60 * 60 * 1000));
  return `${date.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

interface VinInfo {
  patente: string;
  conductor: string;
  contrato: string;
}

async function getVolvoVinsWithInfo(): Promise<Map<string, VinInfo>> {
  const vinMap = new Map<string, VinInfo>();
  try {
    const result = await pool.query(
      `SELECT c.vin, c.patente, c.conductor, COALESCE(f.nombre, '') as faena_nombre
       FROM camiones c
       LEFT JOIN faenas f ON c.faena_id = f.id
       WHERE c.vin IS NOT NULL AND c.vin != '' AND c.sync_ok = true`
    );
    for (const row of result.rows) {
      const faenaNombre = (row.faena_nombre || "").toUpperCase();
      let contrato = "X ASIGNAR";
      if (faenaNombre.includes("CENCOSUD")) contrato = "CENCOSUD";

      vinMap.set(row.vin, {
        patente: row.patente,
        conductor: row.conductor || "Sin asignar",
        contrato,
      });
    }
  } catch (e) {
    console.warn("[drivers] Error getting VINs:", e);
  }
  return vinMap;
}

async function buildDriverData(): Promise<{
  drivers: any[];
  kpis: any;
  porContrato: any[];
}> {
  const vinInfoMap = await getVolvoVinsWithInfo();
  const volvoEvals: any[] = [];
  const fleetStatus: any[] = [];

  const baselines = loadBaselines();
  const currentWeek = getCurrentWeekString();

  const activeVins = new Set<string>();
  for (const vs of fleetStatus) {
    if (vs.gps.latitude && vs.gps.longitude) {
      activeVins.add(vs.vin);
    }
  }

  const drivers: any[] = [];

  if (volvoEvals.length > 0) {
    const pilotVins = new Set(vinInfoMap.keys());
    for (const ev of volvoEvals) {
      if (!pilotVins.has(ev.vin)) continue;
      const info = vinInfoMap.get(ev.vin)!;
      const score = ev.overallScore || 0;
      const cats = ev.categories || {};
      const weekKey = ev.period?.startDate
        ? getWeekString(new Date(ev.period.startDate))
        : currentWeek;

      const antRaw = cats.anticipation?.score || 0;
      const velRaw = cats.speedAdaption?.score || 0;
      const motRaw = cats.engineAndMotor?.score || 0;
      const cmbRaw = cats.fuelEconomy?.score || 0;

      const [antInfo, velInfo, motInfo, cmbInfo] = await Promise.all([
        calcularScoreAdaptativo(info.patente, info.contrato, "ANT", antRaw),
        calcularScoreAdaptativo(info.patente, info.contrato, "VEL", velRaw),
        calcularScoreAdaptativo(info.patente, info.contrato, "MOT", motRaw),
        calcularScoreAdaptativo(info.patente, info.contrato, "CMB", cmbRaw),
      ]);

      const adaptiveScore = Math.round((antInfo.score + velInfo.score + motInfo.score + cmbInfo.score) / 4);

      const driver = await processDriverEval(
        ev.vin, info.patente, info.conductor, adaptiveScore,
        antInfo.score, velInfo.score, motInfo.score, cmbInfo.score,
        baselines, weekKey
      );
      driver.contrato = info.contrato;
      driver.scoreInfo = {
        anticipacion: antInfo,
        velocidad: velInfo,
        motor: motInfo,
        combustible: cmbInfo,
      };
      drivers.push(driver);
    }
  } else {
    const volvoCamiones = Array.from(vinInfoMap.entries()).filter(([vin]) => activeVins.has(vin));

    for (const [vin, info] of volvoCamiones) {
      const vs = fleetStatus.find(f => f.vin === vin);

      const fuelRaw = deriveFuelScore(vs);
      const speedRaw = deriveSpeedScore(vs);
      const motorRaw = deriveMotorScore(vs);
      const anticipationRaw = deriveAnticipationScore(vs);

      const [antInfo, velInfo, motInfo, cmbInfo] = await Promise.all([
        calcularScoreAdaptativo(info.patente, info.contrato, "ANT", anticipationRaw),
        calcularScoreAdaptativo(info.patente, info.contrato, "VEL", speedRaw),
        calcularScoreAdaptativo(info.patente, info.contrato, "MOT", motorRaw),
        calcularScoreAdaptativo(info.patente, info.contrato, "CMB", fuelRaw),
      ]);

      const adaptiveScore = Math.round((antInfo.score + velInfo.score + motInfo.score + cmbInfo.score) / 4);

      const driver = await processDriverEval(
        vin, info.patente, info.conductor, adaptiveScore,
        antInfo.score, velInfo.score, motInfo.score, cmbInfo.score,
        baselines, currentWeek
      );
      driver.contrato = info.contrato;
      driver.scoreInfo = {
        anticipacion: antInfo,
        velocidad: velInfo,
        motor: motInfo,
        combustible: cmbInfo,
      };
      drivers.push(driver);
    }
  }

  saveBaselines(baselines);
  drivers.sort((a, b) => b.score - a.score);

  const totalMonitoreados = drivers.length;
  const conAlerta = drivers.filter(d => d.badge === "alerta" || d.badge === "atencion").length;
  const scorePromedioFlota = drivers.length > 0 ? Math.round(drivers.reduce((s, d) => s + d.score, 0) / drivers.length) : 0;

  let scoreAnterior = 0;
  let semanasCount = 0;
  for (const d of drivers) {
    const b = baselines[d.vin];
    if (b && b.semanas.length >= 2) {
      const prevSemana = b.semanas[b.semanas.length - 2];
      scoreAnterior += prevSemana.score;
      semanasCount++;
    }
  }
  const scoreAnteriorPromedio = semanasCount > 0 ? Math.round(scoreAnterior / semanasCount) : scorePromedioFlota;

  let mayorMejora = { nombre: "--", delta: 0 };
  let mayorCaida = { nombre: "--", delta: 0 };
  for (const d of drivers) {
    if (d.tendenciaDelta > mayorMejora.delta) {
      mayorMejora = { nombre: d.conductor, delta: d.tendenciaDelta };
    }
    if (d.tendenciaDelta < mayorCaida.delta) {
      mayorCaida = { nombre: d.conductor, delta: d.tendenciaDelta };
    }
  }

  const contratosMap: Record<string, any[]> = {};
  for (const d of drivers) {
    const c = d.contrato || "X ASIGNAR";
    if (!contratosMap[c]) contratosMap[c] = [];
    contratosMap[c].push(d);
  }

  const contratoOrder = ["CENCOSUD", "X ASIGNAR"];
  const porContrato = contratoOrder
    .filter(c => contratosMap[c] && contratosMap[c].length > 0)
    .map(c => {
      const dd = contratosMap[c];
      const avg = Math.round(dd.reduce((s, d) => s + d.score, 0) / dd.length);
      const alertas = dd.filter(d => d.badge === "alerta" || d.badge === "atencion").length;
      return {
        contrato: c,
        total: dd.length,
        scorePromedio: avg,
        alertas,
      };
    });

  for (const c of Object.keys(contratosMap)) {
    if (!contratoOrder.includes(c)) {
      const dd = contratosMap[c];
      const avg = Math.round(dd.reduce((s, d) => s + d.score, 0) / dd.length);
      porContrato.push({
        contrato: c,
        total: dd.length,
        scorePromedio: avg,
        alertas: dd.filter(d => d.badge === "alerta" || d.badge === "atencion").length,
      });
    }
  }

  return {
    drivers,
    kpis: {
      totalMonitoreados,
      conAlerta,
      scorePromedioFlota,
      scoreAnteriorPromedio,
      deltaFlota: scorePromedioFlota - scoreAnteriorPromedio,
      mayorMejora,
      mayorCaida,
    },
    porContrato,
  };
}

async function processDriverEval(
  vin: string, patente: string, conductor: string, score: number,
  anticipacion: number, velocidad: number, motor: number, combustible: number,
  baselines: Record<string, DriverBaseline>, currentWeek: string
): Promise<any> {
  if (!baselines[vin]) {
    baselines[vin] = {
      nombre: conductor,
      vin,
      patente,
      semanas: [],
      baseline: 0,
      variabilidad: 0,
      umbralAlerta: 10,
      ultimaActualizacion: "",
    };
  }

  const bl = baselines[vin];
  bl.nombre = conductor;
  bl.patente = patente;

  const existingWeek = bl.semanas.find(s => s.semana === currentWeek);
  if (!existingWeek) {
    bl.semanas.push({
      semana: currentWeek,
      score,
      anticipacion,
      velocidad,
      motor,
      combustible,
    });
  } else {
    existingWeek.score = score;
    existingWeek.anticipacion = anticipacion;
    existingWeek.velocidad = velocidad;
    existingWeek.motor = motor;
    existingWeek.combustible = combustible;
  }

  if (bl.semanas.length >= 2) {
    const weights: number[] = [];
    let w = 1;
    for (let i = bl.semanas.length - 1; i >= 0; i--) {
      weights.unshift(w);
      w *= 0.85;
    }
    const totalW = weights.reduce((a, b) => a + b, 0);
    bl.baseline = Math.round(bl.semanas.reduce((s, sem, i) => s + sem.score * weights[i], 0) / totalW);

    const mean = bl.semanas.reduce((s, sem) => s + sem.score, 0) / bl.semanas.length;
    bl.variabilidad = Math.round(Math.sqrt(bl.semanas.reduce((s, sem) => s + Math.pow(sem.score - mean, 2), 0) / bl.semanas.length) * 10) / 10;

    if (bl.semanas.length >= 4) {
      bl.umbralAlerta = Math.max(5, Math.min(20, Math.round(bl.variabilidad * 2)));
    }
  } else {
    bl.baseline = score;
  }

  bl.ultimaActualizacion = new Date().toISOString();

  const prevScore = bl.semanas.length >= 2 ? bl.semanas[bl.semanas.length - 2].score : score;
  const delta = score - prevScore;

  let tendencia: "up" | "down" | "stable" = "stable";
  if (delta > 5) tendencia = "up";
  else if (delta < -5) tendencia = "down";

  const nivel = scoreNivelGlobal(score);
  let badge = nivel.nivel === "OPTIMO" ? "optimo"
    : nivel.nivel === "NORMAL" ? "estable"
    : nivel.nivel === "REVISAR" ? "atencion"
    : nivel.nivel === "ALERTA" ? "alerta"
    : "critico";

  if (bl.semanas.length < 2) {
    badge = badge === "optimo" || badge === "estable" ? "nuevo" : badge;
  } else if (delta > 5 && badge !== "alerta" && badge !== "critico") {
    badge = "mejoro";
  } else if (score < bl.baseline - bl.umbralAlerta) {
    badge = "alerta";
  } else if (score < bl.baseline - (bl.umbralAlerta / 2) && badge !== "optimo") {
    badge = "atencion";
  }

  const mejorSemana = bl.semanas.length > 0
    ? bl.semanas.reduce((best, s) => s.score > best.score ? s : best, bl.semanas[0])
    : null;
  const peorSemana = bl.semanas.length > 0
    ? bl.semanas.reduce((worst, s) => s.score < worst.score ? s : worst, bl.semanas[0])
    : null;

  let textoIA = "";
  if (bl.semanas.length >= 2) {
    const categorias = ["anticipacion", "velocidad", "motor", "combustible"] as const;
    const currentSem = bl.semanas[bl.semanas.length - 1];
    const avgCats = {
      anticipacion: Math.round(bl.semanas.reduce((s, sem) => s + sem.anticipacion, 0) / bl.semanas.length),
      velocidad: Math.round(bl.semanas.reduce((s, sem) => s + sem.velocidad, 0) / bl.semanas.length),
      motor: Math.round(bl.semanas.reduce((s, sem) => s + sem.motor, 0) / bl.semanas.length),
      combustible: Math.round(bl.semanas.reduce((s, sem) => s + sem.combustible, 0) / bl.semanas.length),
    };

    const bajoCats = categorias.filter(c => currentSem[c] < avgCats[c] - 10);
    const altoCats = categorias.filter(c => currentSem[c] > avgCats[c] + 10);

    if (bajoCats.length > 0) {
      const catNames: Record<string, string> = { anticipacion: "anticipacion", velocidad: "velocidad", motor: "motor", combustible: "combustible" };
      textoIA = `Este conductor esta por debajo de su promedio historico en ${bajoCats.map(c => catNames[c]).join(" y ")}.`;
    } else if (altoCats.length > 0) {
      textoIA = `Conductor con buen desempeno, superando su promedio en ${altoCats.length} categorias.`;
    } else {
      textoIA = `Conductor con desempeno estable, dentro de su rango historico.`;
    }

    if (mejorSemana) {
      textoIA += ` Su mejor periodo fue la semana ${mejorSemana.semana} (${mejorSemana.score} pts).`;
    }
  } else {
    textoIA = "Conductor en observacion, aun no hay suficientes datos para generar analisis de tendencia.";
  }

  return {
    vin,
    patente,
    conductor,
    score,
    anticipacion,
    velocidad,
    motor,
    combustible,
    tendencia,
    tendenciaDelta: delta,
    badge,
    nivel: nivel.nivel,
    nivelColor: nivel.color,
    baseline: bl.baseline,
    variabilidad: bl.variabilidad,
    umbralAlerta: bl.umbralAlerta,
    semanas: bl.semanas,
    mejorSemana,
    peorSemana,
    textoIA,
    semanasDisponibles: bl.semanas.length,
  };
}

function deriveFuelScore(vs: any): number {
  if (!vs) return 50;
  const fuelLevel = vs.fuelLevel;
  if (fuelLevel === null || fuelLevel === undefined) return 55;
  return Math.min(100, Math.max(0, 40 + Math.round(fuelLevel * 0.6)));
}

function deriveSpeedScore(vs: any): number {
  if (!vs) return 50;
  const speed = vs.wheelBasedSpeed || vs.gps?.speed;
  if (!speed) return 60;
  if (speed > 100) return 30;
  if (speed > 90) return 50;
  if (speed > 80) return 65;
  return 75;
}

function deriveMotorScore(vs: any): number {
  if (!vs) return 50;
  const rpm = vs.engineSpeed;
  if (!rpm) return 60;
  if (rpm > 2200) return 35;
  if (rpm > 1800) return 55;
  if (rpm > 1400) return 70;
  return 80;
}

function deriveAnticipationScore(vs: any): number {
  if (!vs) return 50;
  const speed = vs.wheelBasedSpeed || vs.gps?.speed || 0;
  const rpm = vs.engineSpeed || 0;
  let score = 60;
  if (speed > 0 && speed < 80) score += 10;
  if (rpm > 0 && rpm < 1600) score += 5;
  if (vs.fuelLevel !== null && vs.fuelLevel > 30) score += 3;
  return Math.min(100, Math.max(0, score));
}

async function getDriverGeoZone(vin: string): Promise<string> {
  try {
    const result = await pool.query(
      `SELECT gp.lat FROM geo_puntos gp
       JOIN camiones c ON c.patente = gp.patente
       WHERE c.vin = $1
       ORDER BY gp.timestamp DESC LIMIT 1`,
      [vin]
    );
    if (result.rows.length > 0) {
      const lat = parseFloat(result.rows[0].lat);
      if (lat > -30) return "NORTE";
      if (lat > -36) return "CENTRO";
      return "SUR";
    }
  } catch (e) {}

  try {
    const fleet: any[] = [];
    const vs = fleet.find(f => f.vin === vin);
    if (vs?.gps?.latitude) {
      const lat = vs.gps.latitude;
      if (lat > -30) return "NORTE";
      if (lat > -36) return "CENTRO";
      return "SUR";
    }
  } catch (e) {}

  return "CENTRO";
}

async function getDriverKmContext(vin: string): Promise<{ km: number; geocercas: number }> {
  try {
    const kmResult = await pool.query(
      `SELECT COALESCE(SUM(v.km_recorridos), 0) as km_total,
              COUNT(DISTINCT v.id) as viajes
       FROM tms_viajes v
       JOIN camiones c ON c.id = v.camion_id
       WHERE c.vin = $1
       AND v.fecha_inicio >= NOW() - INTERVAL '7 days'`,
      [vin]
    );
    const geocResult = await pool.query(
      `SELECT COUNT(DISTINCT gv.lugar_id) as geocercas
       FROM geo_visitas gv
       JOIN camiones c ON c.id = gv.camion_id
       WHERE c.vin = $1
       AND gv.llegada >= NOW() - INTERVAL '7 days'`,
      [vin]
    );
    return {
      km: Math.round(parseFloat(kmResult.rows[0]?.km_total || "0")),
      geocercas: parseInt(geocResult.rows[0]?.geocercas || "0"),
    };
  } catch (e) {
    return { km: 0, geocercas: 0 };
  }
}

export function registerDriversRoutes(app: Express) {

  app.get("/api/drivers/evaluaciones", async (_req: Request, res: Response) => {
    try {
      const data = await buildDriverData();
      res.json(data);
    } catch (error: any) {
      console.error("[drivers] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/drivers/:vin/detalle", async (req: Request, res: Response) => {
    try {
      const vin = String(req.params.vin);
      const data = await buildDriverData();
      const driver = data.drivers.find((d: any) => d.vin === vin);
      if (!driver) {
        return res.status(404).json({ message: "Conductor no encontrado" });
      }

      const zona = await getDriverGeoZone(vin);
      const events = loadEvents().filter(e => e.vin === vin);

      res.json({
        ...driver,
        zona,
        eventos: events.slice(-50),
      });
    } catch (error: any) {
      console.error("[drivers] Error detalle:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/drivers/comparativo-zona", async (_req: Request, res: Response) => {
    try {
      const data = await buildDriverData();
      const zonas: Record<string, { drivers: any[]; totalKm: number }> = {
        NORTE: { drivers: [], totalKm: 0 },
        CENTRO: { drivers: [], totalKm: 0 },
        SUR: { drivers: [], totalKm: 0 },
      };

      for (const d of data.drivers) {
        const zona = await getDriverGeoZone(d.vin);
        const kmData = await getDriverKmContext(d.vin);
        d._zona = zona;
        d._kmSemana = kmData.km;
        d._geocercasVisitadas = kmData.geocercas;
        zonas[zona].drivers.push(d);
        zonas[zona].totalKm += kmData.km;
      }

      const result = Object.entries(zonas).map(([zona, info]) => {
        const promedio = info.drivers.length > 0
          ? Math.round(info.drivers.reduce((s, d) => s + d.score, 0) / info.drivers.length)
          : 0;
        const avgKm = info.drivers.length > 0
          ? Math.round(info.totalKm / info.drivers.length)
          : 0;

        return {
          zona,
          totalConductores: info.drivers.length,
          scorePromedio: promedio,
          kmPromedioZona: avgKm,
          sobrePromedio: info.drivers.filter(d => d.score >= promedio).map(d => ({
            conductor: d.conductor, patente: d.patente, score: d.score, delta: d.score - promedio,
            km: d._kmSemana, geocercas: d._geocercasVisitadas,
          })),
          bajoPromedio: info.drivers.filter(d => d.score < promedio).map(d => {
            const rutaDificil = d._kmSemana > avgKm * 1.3 || d._geocercasVisitadas > 5;
            return {
              conductor: d.conductor, patente: d.patente, score: d.score, delta: d.score - promedio,
              km: d._kmSemana, geocercas: d._geocercasVisitadas,
              contexto: rutaDificil ? `Ruta mas exigente: ${d._kmSemana} km, ${d._geocercasVisitadas} geocercas` : null,
            };
          }),
        };
      }).filter(z => z.totalConductores > 0);

      res.json(result);
    } catch (error: any) {
      console.error("[drivers] Error comparativo:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/drivers/eventos", async (req: Request, res: Response) => {
    try {
      const { vin, tipo, semana } = req.query;
      let events = loadEvents();

      if (vin) events = events.filter(e => e.vin === String(vin));
      if (tipo) events = events.filter(e => e.tipo === String(tipo));
      if (semana) events = events.filter(e => getWeekString(new Date(e.fecha)) === String(semana));

      res.json(events.slice(-100));
    } catch (error: any) {
      console.error("[drivers] Error eventos:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  console.log("[drivers] Driver evaluation routes registered");
}
