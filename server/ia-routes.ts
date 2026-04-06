import type { Express, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { storage } from "./storage";
import type { Carga } from "@shared/schema";
import { DATA_START } from "./db";

const MODEL = "claude-sonnet-4-20250514";

function getClient(): Anthropic {
  return new Anthropic();
}

const DATA_START_DATE = DATA_START;

async function getFusionContext(days: number = 7): Promise<string> {
  const to = new Date();
  let from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  if (from < DATA_START_DATE) from = new Date(DATA_START_DATE);

  const [fleetStatus, allCamionesRaw, faenas] = await Promise.all([
    Promise.resolve([]),
    storage.getCamiones(),
    storage.getFaenas(),
  ]);

  const allCamiones = allCamionesRaw.filter((c: any) => c.vin != null);
  const volvoByVin = new Map(fleetStatus.map((s: any) => [s.vin, s]));

  const allVins = allCamiones.map((c: any) => c.vin).filter((v: any): v is string => v != null);
  const historicalSnapshots = allVins.length > 0
    ? await storage.getVolvoFuelSnapshotsInRange(allVins, from, to)
    : [];

  const snapshotsByVin = new Map<string, typeof historicalSnapshots>();
  for (const snap of historicalSnapshots) {
    const arr = snapshotsByVin.get(snap.vin) || [];
    arr.push(snap);
    snapshotsByVin.set(snap.vin, arr);
  }
  for (const [vin, snaps] of snapshotsByVin) {
    snapshotsByVin.set(vin, snaps.sort((a: any, b: any) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()));
  }

  const faenaMap = new Map(faenas.map((f: any) => [f.id, f.nombre]));
  const hace2h = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const porContrato = new Map<string, { activos: number; total: number; rendimientos: number[]; alertas: string[] }>();
  const camionesActivos: string[] = [];
  const sinGps: string[] = [];
  const alertasActivas: string[] = [];
  let kmTotal = 0;

  for (const cam of allCamiones) {
    const contratoNombre = faenaMap.get(cam.faenaId) || "N/A";
    if (!porContrato.has(contratoNombre)) {
      porContrato.set(contratoNombre, { activos: 0, total: 0, rendimientos: [], alertas: [] });
    }
    const grupo = porContrato.get(contratoNombre)!;
    grupo.total++;

    const volvo = cam.vin ? volvoByVin.get(cam.vin) : null;
    const volvoTimestamp = volvo?.createdDateTime || volvo?.gps?.positionDateTime || null;
    const isActive = volvoTimestamp && new Date(volvoTimestamp) >= hace2h;
    if (isActive) {
      grupo.activos++;
      camionesActivos.push(cam.patente);
    } else {
      sinGps.push(cam.patente);
    }

    const snaps = cam.vin ? snapshotsByVin.get(cam.vin) : null;
    if (snaps && snaps.length >= 2) {
      const deltaFuel = snaps[snaps.length - 1].totalFuelUsed - snaps[0].totalFuelUsed;
      const deltaKm = ((snaps[snaps.length - 1] as any).totalDistance || 0) - ((snaps[0] as any).totalDistance || 0);
      const litros = deltaFuel / 1000;
      const km = deltaKm / 1000;
      kmTotal += km;
      if (litros > 0 && km > 0) {
        const rend = km / litros;
        grupo.rendimientos.push(rend);
        if (rend < (cam.metaKmL || 2.1) * 0.7) {
          const alerta = `${cam.patente}: Rendimiento ${rend.toFixed(2)} km/L (meta ${cam.metaKmL} km/L, ${Math.round(((rend - cam.metaKmL) / cam.metaKmL) * 100)}%)`;
          grupo.alertas.push(alerta);
          alertasActivas.push(alerta);
        }
      }
    }
  }

  const rendTotal = Array.from(porContrato.values()).flatMap(g => g.rendimientos);
  const rendProm = rendTotal.length > 0 ? rendTotal.reduce((s, r) => s + r, 0) / rendTotal.length : 0;

  let ctx = `DATOS DE FLOTA SOTRASER (ultimos ${days} dias):
- Total camiones con telemetria Volvo: ${allCamiones.length}
- Camiones activos hoy (GPS en ultimas 2h): ${camionesActivos.length}
- Km totales recorridos: ${Math.round(kmTotal).toLocaleString("es-CL")}
- Rendimiento promedio ECU: ${rendProm.toFixed(2)} km/L

POR CONTRATO:\n`;

  for (const [nombre, datos] of porContrato) {
    const rendAvg = datos.rendimientos.length > 0 ? datos.rendimientos.reduce((s, r) => s + r, 0) / datos.rendimientos.length : 0;
    ctx += `- ${nombre}: ${datos.activos}/${datos.total} activos, ${rendAvg.toFixed(2)} km/L promedio, ${datos.alertas.length} bajo meta\n`;
  }

  ctx += `\nALERTAS ACTIVAS:\n`;
  if (alertasActivas.length > 0) {
    ctx += alertasActivas.slice(0, 20).map(a => `- ${a}`).join("\n") + "\n";
  } else {
    ctx += "- Ninguna alerta activa\n";
  }

  ctx += `\nCAMIONES SIN GPS (>2h sin senal):\n`;
  if (sinGps.length > 0) {
    ctx += sinGps.slice(0, 30).join(", ") + "\n";
  } else {
    ctx += "- Todos los camiones con senal activa\n";
  }

  return ctx;
}

let dashboardInsightCache: { text: string; timestamp: number } | null = null;
const DASHBOARD_INSIGHT_TTL = 30 * 60 * 1000;

export function registerIARoutes(app: Express) {
  app.get("/api/ia/resumen-dashboard", async (_req: Request, res: Response) => {
    try {
      if (dashboardInsightCache && Date.now() - dashboardInsightCache.timestamp < DASHBOARD_INSIGHT_TTL) {
        return res.json({ resumen: dashboardInsightCache.text, cached: true });
      }

      const context = await getFusionContext(7);
      const client = getClient();
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 300,
        messages: [{
          role: "user",
          content: `Eres un analista de flotas de camiones de Sotraser en Chile. Tu fuente son GPS y Volvo Connect ECU. Genera exactamente 2 oraciones cortas resumiendo el estado actual de la flota basandote en los datos. Se directo, usa numeros concretos. No uses emojis. No menciones Sigetra ni cargas manuales. Responde solo con las 2 oraciones, sin formato adicional.

Datos:
${context}`
        }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "Sin datos disponibles para generar resumen.";
      dashboardInsightCache = { text, timestamp: Date.now() };
      res.json({ resumen: text, cached: false });
    } catch (error: any) {
      console.error("[ia/resumen-dashboard] Error:", error.message);
      if (dashboardInsightCache) {
        return res.json({ resumen: dashboardInsightCache.text, cached: true, error: error.message });
      }
      res.status(500).json({ message: error.message, resumen: "No se pudo generar el resumen de IA." });
    }
  });

  app.post("/api/ia/analizar", async (_req: Request, res: Response) => {
    try {
      const context = await getFusionContext(7);
      const client = getClient();
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: `Eres un analista experto en flotas de camiones en Chile. Analiza estos datos GPS y ECU (Volvo Connect) de la flota Sotraser y genera un JSON con exactamente esta estructura (sin texto adicional, solo JSON). Sistema de medicion activo desde 01-03-2026. No incluyas referencias a costos, CLP, Sigetra ni cargas manuales. Enfocate en rendimiento km/L ECU, velocidad, rutas GPS y estado de camiones.
{
  "resumen": "Resumen ejecutivo de 2-3 oraciones sobre el estado actual de la flota",
  "litros_en_riesgo": "Litros estimados en riesgo por desvios y cuadraturas bajas. Formato: X.XXX L",
  "alertas_criticas": [
    {"patente": "XXXX", "problema": "descripcion breve", "accion": "accion recomendada", "urgencia": "INMEDIATA|24H|SEMANA"}
  ],
  "recomendacion_principal": "La accion mas importante a tomar esta semana"
}

Datos:
${context}`
        }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        res.json(parsed);
      } else {
        res.json({ resumen: text, litros_en_riesgo: "No calculado", alertas_criticas: [], recomendacion_principal: text });
      }
    } catch (error: any) {
      console.error("[ia/analizar] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ia/chat", async (req: Request, res: Response) => {
    try {
      const { messages } = req.body;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ message: "Se requiere campo 'messages' (array)" });
      }

      const context = await getFusionContext(14);
      const client = getClient();

      const systemPrompt = `Eres SOTRA IA, el asistente inteligente de SOTRASER, empresa de transporte de carga en Chile. Tienes acceso a datos reales de la flota enfocada en el contrato CENCOSUD con Volvo Connect. Tu fuente de datos principal son GPS y Volvo Connect (ECU). Manejas rutas GPS, viajes diarios, rendimiento km/L desde ECU, velocidades y patrones de ruta historicos.

Cuando el usuario pregunte sobre la flota, responde con datos concretos si los tienes. Cuando no tengas datos exactos, dilo claramente. Siempre responde en espanol. Se directo y ejecutivo — maximo 4 parrafos.

Datos actuales de la flota:
${context}`;

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1500,
        system: systemPrompt,
        messages: messages.map((m: any) => ({
          role: m.role === "user" ? "user" as const : "assistant" as const,
          content: m.content,
        })),
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      res.json({ respuesta: text });
    } catch (error: any) {
      console.error("[ia/chat] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ia/consulta", async (req: Request, res: Response) => {
    try {
      const { pregunta } = req.body;
      if (!pregunta || typeof pregunta !== "string") {
        return res.status(400).json({ message: "Se requiere campo 'pregunta'" });
      }

      const context = await getFusionContext(14);
      const client = getClient();
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: `Eres un analista experto en flotas de camiones de la empresa Sotraser en Chile. Tu fuente de datos principal son los sistemas GPS y Volvo Connect (ECU). Tienes acceso a rutas GPS, viajes diarios, rendimiento km/L desde ECU, velocidades, y patrones de ruta historicos. Responde la pregunta del usuario basandote en estos datos reales. Responde en espanol, con datos concretos (numeros, porcentajes, patentes). Se directo y conciso. No hagas referencias a Sigetra ni a cargas manuales.

Pregunta del usuario: ${pregunta}

Datos actuales de la flota (GPS + Volvo Connect):
${context}`
        }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      res.json({ respuesta: text });
    } catch (error: any) {
      console.error("[ia/consulta] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ia/patrones", async (_req: Request, res: Response) => {
    try {
      const context = await getFusionContext(30);
      const client = getClient();
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: `Eres un detective de fraudes de combustible en flotas de camiones en Chile. Sistema de medicion activo desde 01-03-2026. No incluyas referencias a costos ni valores en CLP. Analiza estos datos buscando PATRONES SOSPECHOSOS de robo o fraude. Busca:
- Mismo conductor con desvios repetidos en misma ubicacion
- Cuadraturas consistentemente bajas en ciertos camiones
- Patrones de consumo anomalos (litros excesivos para la distancia)
- Conductores que siempre cargan en el mismo lugar con rendimiento bajo

Genera un JSON con exactamente esta estructura (sin texto adicional, solo JSON):
{
  "patrones": [
    {
      "descripcion": "Descripcion del patron detectado",
      "nivel_sospecha": "ALTO|MEDIO|BAJO",
      "evidencia": "Datos concretos que soportan la sospecha (fechas, litros, camiones involucrados)",
      "camiones_involucrados": ["N.XXXX"],
      "conductor": "Nombre si aplica",
      "litros_perdidos": "Litros estimados perdidos"
    }
  ],
  "resumen": "Resumen de hallazgos en 2-3 oraciones"
}

Datos de la flota (ultimos 30 dias):
${context}`
        }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        res.json(JSON.parse(jsonMatch[0]));
      } else {
        res.json({ patrones: [], resumen: text });
      }
    } catch (error: any) {
      console.error("[ia/patrones] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ia/resumen-semanal", async (_req: Request, res: Response) => {
    try {
      const context7 = await getFusionContext(7);
      const context14 = await getFusionContext(14);
      const client = getClient();
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: `Eres un analista de flotas que genera reportes ejecutivos semanales. Genera un resumen de los ultimos 7 dias de la flota Sotraser. Tienes datos de 7 y 14 dias para comparar. Sistema de medicion activo desde 01-03-2026. No incluyas referencias a costos ni valores en CLP.

Genera un JSON con exactamente esta estructura (sin texto adicional, solo JSON):
{
  "periodo": "DD/MM/YYYY - DD/MM/YYYY",
  "total_litros": 0,
  "litros_desviados": 0,
  "top3_camiones_problema": [
    {"interno": "XXXX", "problema": "descripcion", "litros_desviados": 0}
  ],
  "top3_conductores_problema": [
    {"nombre": "XXXX", "problema": "descripcion"}
  ],
  "comparativa_semana_anterior": "Texto comparando esta semana vs la anterior",
  "acciones_prioritarias": [
    "Accion 1",
    "Accion 2",
    "Accion 3"
  ],
  "resumen_ejecutivo": "Resumen de 3-4 oraciones para presentar a gerencia"
}

Datos ultima semana:
${context7}

Datos ultimas 2 semanas (para comparar):
${context14}`
        }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        res.json(JSON.parse(jsonMatch[0]));
      } else {
        res.json({ resumen_ejecutivo: text, acciones_prioritarias: [] });
      }
    } catch (error: any) {
      console.error("[ia/resumen-semanal] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ia/camion", async (req: Request, res: Response) => {
    try {
      const { camionId, dias } = req.body;
      if (!camionId) return res.status(400).json({ message: "camionId requerido" });
      const period = dias || 56;

      const camion = await storage.getCamion(camionId);
      if (!camion) return res.status(404).json({ message: "Camion no encontrado" });

      const to = new Date();
      const from = new Date(Date.now() - period * 24 * 60 * 60 * 1000);
      const faenas = await storage.getFaenas();
      const faena = faenas.find(f => f.id === camion.faenaId);

      const truckCargas = await storage.getCargasByDateRange(from, to).then(
        all => all.filter(c => c.camionId === camion.id)
      ).catch(() => []);

      let volvoSnaps: any[] = [];
      if (camion.vin) {
        volvoSnaps = await storage.getVolvoFuelSnapshotsInRange([camion.vin], from, to);
      }

      const weeklyData: any[] = [];
      for (let w = 0; w < 8; w++) {
        const weekEnd = new Date(to.getTime() - w * 7 * 24 * 60 * 60 * 1000);
        const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
        const weekCargas = truckCargas.filter((c: any) => {
          const d = new Date(c.fecha);
          return d >= weekStart && d < weekEnd;
        });
        const litrosSurtidor = weekCargas.reduce((s: number, c: any) => s + c.litrosSurtidor, 0);
        const validRend = weekCargas.filter((c: any) => c.rendReal != null && c.rendReal > 0 && c.rendReal < 100);
        const rendPromedio = validRend.length > 0 ? validRend.reduce((s: number, c: any) => s + c.rendReal, 0) / validRend.length : null;

        const weekSnaps = volvoSnaps.filter(s => {
          const d = new Date(s.capturedAt);
          return d >= weekStart && d < weekEnd;
        }).sort((a: any, b: any) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
        let litrosEcu = null;
        if (weekSnaps.length >= 2) {
          const delta = weekSnaps[weekSnaps.length - 1].totalFuelUsed - weekSnaps[0].totalFuelUsed;
          if (delta > 0) litrosEcu = Math.round(delta / 1000);
        }

        weeklyData.unshift({
          semana: `S${8 - w}`,
          desde: weekStart.toISOString().slice(0, 10),
          hasta: weekEnd.toISOString().slice(0, 10),
          litrosSurtidor: Math.round(litrosSurtidor),
          litrosEcu,
          rendimiento: rendPromedio ? Math.round(rendPromedio * 100) / 100 : null,
          cargas: weekCargas.length,
        });
      }

      const totalLitros = truckCargas.reduce((s: number, c: any) => s + c.litrosSurtidor, 0);
      const allRend = truckCargas.filter((c: any) => c.rendReal != null && c.rendReal > 0 && c.rendReal < 100);
      const rendGeneral = allRend.length > 0 ? allRend.reduce((s: number, c: any) => s + c.rendReal, 0) / allRend.length : null;
      const rendValues = allRend.map((c: any) => c.rendReal as number);
      const rendStdDev = rendValues.length > 1 ? Math.sqrt(rendValues.reduce((s, v) => s + Math.pow(v - (rendGeneral || 0), 2), 0) / rendValues.length) : 0;

      const truckContext = `CAMION N.${camion.patente} (${camion.modelo})
Faena: ${faena?.nombre || "N/A"}
Conductor: ${camion.conductor || "N/A"}
Meta: ${camion.metaKmL} km/L
Odometro: ${camion.odometro || "N/A"} km
Horas motor: ${camion.horasMotor || "N/A"}
Horas ralenti: ${camion.horasRalenti || "N/A"}

DATOS ULTIMAS 8 SEMANAS:
${weeklyData.map(w => `${w.semana} (${w.desde} a ${w.hasta}): Surt=${w.litrosSurtidor}L ECU=${w.litrosEcu ?? "N/A"}L Rend=${w.rendimiento ?? "N/A"}km/L Cargas=${w.cargas}`).join("\n")}

RESUMEN PERIODO:
- Total litros: ${Math.round(totalLitros)}L
- Rendimiento promedio: ${rendGeneral ? rendGeneral.toFixed(2) : "N/A"} km/L
- Variacion rendimiento (std): ${rendStdDev.toFixed(2)}
- Total cargas: ${truckCargas.length}
- Lugares frecuentes: ${[...new Set(truckCargas.map((c: any) => c.lugarConsumo).filter(Boolean))].slice(0, 5).join(", ")}`;

      const client = getClient();
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: `Eres un analista experto en flotas de camiones mineros en Chile. Analiza los datos de este camion individual y genera un JSON con exactamente esta estructura (sin texto adicional, solo JSON):
{
  "tendencia": "MEJORANDO|ESTABLE|EMPEORANDO|INSUFICIENTE",
  "resumen": "Resumen de 2-3 oraciones sobre el estado del camion",
  "anomalias": ["Lista de anomalias detectadas"],
  "causa_probable": "Causa mas probable de problemas (si hay)",
  "recomendacion": "Accion recomendada principal",
  "score_salud": 85,
  "detalle_semanas": "Analisis breve de la tendencia semanal"
}

score_salud: 0-100 donde 100=perfecto. Considera rendimiento vs meta, variacion, diferencia surtidor/ECU.

Datos del camion:
${truckContext}`
        }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      let iaAnalisis = { tendencia: "INSUFICIENTE", resumen: text, anomalias: [], causa_probable: "", recomendacion: "", score_salud: 0, detalle_semanas: "" };
      if (jsonMatch) {
        try { iaAnalisis = JSON.parse(jsonMatch[0]); } catch {}
      }

      res.json({
        camion: {
          id: camion.id,
          patente: camion.patente,
          modelo: camion.modelo,
          faena: faena?.nombre || null,
          conductor: camion.conductor,
          metaKmL: camion.metaKmL,
          odometro: camion.odometro,
          horasMotor: camion.horasMotor,
          horasRalenti: camion.horasRalenti,
        },
        weeklyData,
        metricas: {
          rendPromedio: rendGeneral ? Math.round(rendGeneral * 100) / 100 : null,
          variacion: Math.round(rendStdDev * 100) / 100,
          totalLitros: Math.round(totalLitros),
          totalCargas: truckCargas.length,
          eventosCriticos: weeklyData.filter(w => w.rendimiento !== null && w.rendimiento < (camion.metaKmL * 0.7)).length,
          horasRalenti: camion.horasRalenti,
        },
        ia: iaAnalisis,
      });
    } catch (error: any) {
      console.error("[ia/camion] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ia/contrato", async (req: Request, res: Response) => {
    try {
      const { faenaId, dias } = req.body;
      if (!faenaId) return res.status(400).json({ message: "faenaId requerido" });
      const period = dias || 56;

      const faenas = await storage.getFaenas();
      const faena = faenas.find(f => f.id === faenaId);
      if (!faena) return res.status(404).json({ message: "Contrato no encontrado" });

      const allCamiones = await storage.getCamiones();
      const camiones = allCamiones.filter(c => c.faenaId === faenaId && c.vin != null);
      if (camiones.length === 0) return res.json({ faena: faena.nombre, camiones: [], ia: null });

      const to = new Date();
      let from = new Date(Date.now() - period * 24 * 60 * 60 * 1000);
      if (from < DATA_START) from = new Date(DATA_START.getTime());

      const [allCargas, fleet] = await Promise.all([
        storage.getCargasByDateRange(from, to).catch(() => [] as Carga[]),
        Promise.resolve([]),
      ]);
      const vinsOnline = new Set(fleet.map((v: any) => v.vin));
      const cargasByCamionId = new Map<number, Carga[]>();
      for (const c of allCargas) {
        const arr = cargasByCamionId.get(c.camionId) || [];
        arr.push(c);
        cargasByCamionId.set(c.camionId, arr);
      }

      const camionResults = camiones.map(cam => {
        const truckCargas = cargasByCamionId.get(cam.id) || [];

        const totalLitros = truckCargas.reduce((s: number, c: any) => s + (c.litrosSurtidor || 0), 0);
        const allRend = truckCargas.filter((c: any) => c.rendReal != null && c.rendReal > 0 && c.rendReal < 100);
        const rendProm = allRend.length > 0 ? +(allRend.reduce((s: number, c: any) => s + c.rendReal, 0) / allRend.length).toFixed(2) : null;
        const online = cam.vin ? vinsOnline.has(cam.vin) : false;
        const cargas = truckCargas.length;

        const weeklyData: any[] = [];
        for (let w = 0; w < Math.min(8, Math.ceil(period / 7)); w++) {
          const weekEnd = new Date(to.getTime() - w * 7 * 24 * 60 * 60 * 1000);
          const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
          const weekCargas = truckCargas.filter((c: any) => {
            const d = new Date(c.fecha);
            return d >= weekStart && d < weekEnd;
          });
          const litros = weekCargas.reduce((s: number, c: any) => s + (c.litrosSurtidor || 0), 0);
          const validRend = weekCargas.filter((c: any) => c.rendReal > 0 && c.rendReal < 100);
          const rend = validRend.length > 0 ? +(validRend.reduce((s: number, c: any) => s + c.rendReal, 0) / validRend.length).toFixed(2) : null;
          weeklyData.unshift({
            semana: `S${Math.min(8, Math.ceil(period / 7)) - w}`,
            litros: Math.round(litros),
            rendimiento: rend,
            cargas: weekCargas.length,
          });
        }

        return {
          patente: cam.patente,
          modelo: cam.modelo,
          conductor: cam.conductor || "Sin asignar",
          metaKmL: cam.metaKmL,
          online,
          rendPromedio: rendProm,
          totalLitros: Math.round(totalLitros),
          cargas,
          estado: rendProm !== null && rendProm < cam.metaKmL * 0.7 ? "CRITICO" : rendProm !== null && rendProm < cam.metaKmL ? "ALERTA" : "NORMAL",
          weeklyData,
        };
      }).sort((a, b) => {
        const order: Record<string, number> = { CRITICO: 0, ALERTA: 1, NORMAL: 2 };
        return (order[a.estado] ?? 2) - (order[b.estado] ?? 2);
      });

      const totalLitrosContrato = camionResults.reduce((s, c) => s + c.totalLitros, 0);
      const rendVals = camionResults.filter(c => c.rendPromedio !== null).map(c => c.rendPromedio as number);
      const rendContratoAvg = rendVals.length > 0 ? +(rendVals.reduce((a, b) => a + b, 0) / rendVals.length).toFixed(2) : null;
      const criticos = camionResults.filter(c => c.estado === "CRITICO").length;

      const contratoContext = `CONTRATO: ${faena.nombre}
Camiones: ${camiones.length} (${camionResults.filter(c => c.online).length} en linea)
Periodo: ${period} dias
Rendimiento promedio contrato: ${rendContratoAvg ?? "N/A"} km/L
Total litros: ${totalLitrosContrato}
Camiones criticos: ${criticos}

DETALLE POR CAMION:
${camionResults.map(c => `- ${c.patente} (${c.modelo}) Conductor:${c.conductor} Rend:${c.rendPromedio ?? "N/A"}km/L Litros:${c.totalLitros}L Cargas:${c.cargas} Estado:${c.estado}`).join("\n")}`;

      const client = getClient();
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: `Eres un analista experto en flotas de camiones mineros en Chile. Analiza los datos de este CONTRATO completo y genera un JSON con exactamente esta estructura (sin texto adicional, solo JSON):
{
  "estado_general": "NORMAL|ATENCION|CRITICO",
  "resumen": "Resumen ejecutivo de 3-4 oraciones sobre el contrato",
  "rendimiento_contrato": "Evaluacion del rendimiento general",
  "camiones_problema": ["Lista de patentes con problemas y por que"],
  "camion_destacado": "Patente del mejor camion y por que",
  "riesgos": ["Riesgos detectados en el contrato"],
  "recomendaciones": ["3-4 acciones concretas priorizadas"],
  "score_contrato": 75
}

score_contrato: 0-100 donde 100=operacion perfecta. Considera rendimiento promedio, camiones criticos, variacion entre camiones.

${contratoContext}`
        }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      let iaResult = {
        estado_general: "NORMAL", resumen: text, rendimiento_contrato: "",
        camiones_problema: [] as string[], camion_destacado: "", riesgos: [] as string[],
        recomendaciones: [] as string[], score_contrato: 0
      };
      if (jsonMatch) {
        try { iaResult = JSON.parse(jsonMatch[0]); } catch {}
      }

      res.json({
        faena: faena.nombre,
        color: faena.color,
        camionesTotal: camiones.length,
        camionesOnline: camionResults.filter(c => c.online).length,
        totalLitros: totalLitrosContrato,
        rendPromedio: rendContratoAvg,
        criticos,
        camiones: camionResults,
        ia: iaResult,
      });
    } catch (error: any) {
      console.error("[ia/contrato] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ia/detectar-puntos", async (req: Request, res: Response) => {
    try {
      const { camionId } = req.body;
      if (!camionId) return res.status(400).json({ message: "camionId requerido" });

      const camion = await storage.getCamion(camionId);
      if (!camion) return res.status(404).json({ message: "Camion no encontrado" });

      const to = new Date();
      const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const truckCargas = await storage.getCargasByDateRange(from, to).then(
        all => all.filter(c => c.camionId === camion.id)
      ).catch(() => []);

      const locations = truckCargas.map((c: any) => ({
        fecha: c.fecha,
        lugar: c.lugarConsumo,
        litros: c.litrosSurtidor,
        odometro: c.kmActual,
      }));

      const client = getClient();
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: `Eres un analista de rutas de camiones mineros en Chile. Analiza los puntos de carga de combustible de este camion y detecta patrones de ruta (puntos frecuentes de carga, entrega, descanso).

Genera un JSON con exactamente esta estructura (sin texto adicional, solo JSON):
{
  "puntos": [
    {
      "tipo": "COMBUSTIBLE|CARGA|ENTREGA|DESCANSO",
      "nombreInferido": "Nombre del punto inferido (ej: Estacion Copec Antofagasta, Faena Spence, etc)",
      "frecuencia": 5,
      "litrosPromedio": 200
    }
  ],
  "resumen_ruta": "Descripcion de la ruta habitual del camion"
}

Datos de cargas del camion N.${camion.patente}:
${locations.map((l: any) => `Fecha:${l.fecha} Lugar:${l.lugar} Litros:${l.litros} Odo:${l.odometro}`).join("\n")}`
        }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const savedPuntos = [];
        for (const p of (parsed.puntos || [])) {
          const saved = await storage.createPuntoRuta({
            camionId,
            lat: "0",
            lng: "0",
            tipo: p.tipo,
            nombreInferido: p.nombreInferido,
            duracionMin: null,
            fecha: null,
            confirmado: false,
            confirmadoPor: null,
          });
          savedPuntos.push({ ...saved, frecuencia: p.frecuencia, litrosPromedio: p.litrosPromedio });
        }
        res.json({ puntos: savedPuntos, resumen: parsed.resumen_ruta });
      } else {
        res.json({ puntos: [], resumen: text });
      }
    } catch (error: any) {
      console.error("[ia/detectar-puntos] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/ia/proyeccion-mes", async (_req: Request, res: Response) => {
    try {
      const context = await getFusionContext(14);
      const client = getClient();
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: `Eres un analista de flotas que hace proyecciones de consumo. Con los datos de los ultimos 14 dias, proyecta el consumo del mes completo (30 dias). Sistema de medicion activo desde 01-03-2026. No incluyas referencias a costos ni valores en CLP.

Genera un JSON con exactamente esta estructura (sin texto adicional, solo JSON):
{
  "litros_14d": 0,
  "litros_proyectados_mes": 0,
  "camiones_empeorando": [
    {"interno": "XXXX", "tendencia": "descripcion de la tendencia negativa", "rendimiento_actual": 0}
  ],
  "camiones_mejorando": [
    {"interno": "XXXX", "tendencia": "descripcion positiva", "rendimiento_actual": 0}
  ],
  "proyeccion_texto": "Texto de 2-3 oraciones explicando la proyeccion"
}

Datos ultimos 14 dias:
${context}`
        }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        res.json(JSON.parse(jsonMatch[0]));
      } else {
        res.json({ proyeccion_texto: text });
      }
    } catch (error: any) {
      console.error("[ia/proyeccion-mes] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  interface RouteCluster {
    routeId: string;
    camionId: number;
    patente: string;
    faena: string;
    origenNombre: string;
    destinoNombre: string;
    origenLat: number;
    origenLng: number;
    destinoLat: number;
    destinoLng: number;
    viajes: {
      id: number;
      codigo: string;
      fecha: string;
      kmRecorridos: number;
      litrosSigetra: number;
      litrosEcu: number;
      rendimiento: number;
      desviacionPct: number;
      esAnomalia: boolean;
    }[];
    totalViajes: number;
    promedioRendimiento: number;
    promedioKm: number;
    promedioLitros: number;
    desviacionMax: number;
    anomalias: number;
  }

  app.get("/api/ia/combustibles-reales", async (_req: Request, res: Response) => {
    try {
      const contratos = await storage.getTmsContratos();
      const camiones = (await storage.getCamiones()).filter(c => c.vin != null);
      const faenas = await storage.getFaenas();

      const camionMap = new Map(camiones.map(c => [c.id, c]));
      const faenaMap = new Map(faenas.map(f => [f.id, f]));

      let allTrips: any[] = [];
      for (const contrato of contratos) {
        const viajes = await storage.getTmsViajes(contrato.id);
        allTrips.push(...viajes);
      }

      const validTrips = allTrips.filter(v =>
        v.origenLat && v.origenLng && v.destinoLat && v.destinoLng &&
        Number(v.kmRecorridos) > 10 &&
        (Number(v.litrosEcu) > 0 || Number(v.litrosSigetra) > 0) &&
        Number(v.rendimientoReal) > 0 && Number(v.rendimientoReal) < 15
      );

      const tripsByCamion = new Map<number, typeof validTrips>();
      for (const trip of validTrips) {
        const arr = tripsByCamion.get(trip.camionId) || [];
        arr.push(trip);
        tripsByCamion.set(trip.camionId, arr);
      }

      const ROUTE_TOLERANCE_KM = 5;
      const ANOMALY_THRESHOLD_PCT = 20;
      const MIN_TRIPS_FOR_BASELINE = 3;

      const clusters: RouteCluster[] = [];
      let clusterIdx = 0;

      for (const [camionId, trips] of tripsByCamion) {
        const cam = camionMap.get(camionId);
        if (!cam) continue;
        const faena = faenaMap.get(cam.faenaId);

        const assigned: boolean[] = new Array(trips.length).fill(false);

        for (let i = 0; i < trips.length; i++) {
          if (assigned[i]) continue;

          const group = [trips[i]];
          assigned[i] = true;

          const oLat = Number(trips[i].origenLat);
          const oLng = Number(trips[i].origenLng);
          const dLat = Number(trips[i].destinoLat);
          const dLng = Number(trips[i].destinoLng);

          for (let j = i + 1; j < trips.length; j++) {
            if (assigned[j]) continue;
            const distOrig = haversineKm(oLat, oLng, Number(trips[j].origenLat), Number(trips[j].origenLng));
            const distDest = haversineKm(dLat, dLng, Number(trips[j].destinoLat), Number(trips[j].destinoLng));
            if (distOrig < ROUTE_TOLERANCE_KM && distDest < ROUTE_TOLERANCE_KM) {
              group.push(trips[j]);
              assigned[j] = true;
            }
          }

          if (group.length < MIN_TRIPS_FOR_BASELINE) continue;

          const rendimientos = group.map(v => Number(v.rendimientoReal));
          const avgRend = rendimientos.reduce((a, b) => a + b, 0) / rendimientos.length;
          const avgKm = group.reduce((a, v) => a + Number(v.kmRecorridos), 0) / group.length;
          const avgLitros = group.reduce((a, v) => a + Number(v.litrosEcu || v.litrosSigetra), 0) / group.length;

          const viajesDetail = group.map(v => {
            const rend = Number(v.rendimientoReal);
            const desvPct = avgRend > 0 ? ((rend - avgRend) / avgRend) * 100 : 0;
            return {
              id: v.id,
              codigo: v.codigo,
              fecha: v.fechaSalida ? new Date(v.fechaSalida).toISOString().split("T")[0] : "",
              kmRecorridos: Math.round(Number(v.kmRecorridos)),
              litrosSigetra: Math.round(Number(v.litrosSigetra || 0)),
              litrosEcu: Math.round(Number(v.litrosEcu || 0)),
              rendimiento: Math.round(rend * 100) / 100,
              desviacionPct: Math.round(desvPct * 10) / 10,
              esAnomalia: Math.abs(desvPct) > ANOMALY_THRESHOLD_PCT,
            };
          });

          viajesDetail.sort((a, b) => a.fecha.localeCompare(b.fecha));

          const anomalias = viajesDetail.filter(v => v.esAnomalia).length;
          const maxDesv = Math.max(...viajesDetail.map(v => Math.abs(v.desviacionPct)));

          clusterIdx++;
          clusters.push({
            routeId: `R-${cam.patente}-${String(clusterIdx).padStart(3, "0")}`,
            camionId,
            patente: cam.patente,
            faena: faena?.nombre || "Sin asignar",
            origenNombre: group[0].origenNombre || "Origen desconocido",
            destinoNombre: group[0].destinoNombre || "Destino desconocido",
            origenLat: oLat,
            origenLng: oLng,
            destinoLat: dLat,
            destinoLng: dLng,
            viajes: viajesDetail,
            totalViajes: group.length,
            promedioRendimiento: Math.round(avgRend * 100) / 100,
            promedioKm: Math.round(avgKm),
            promedioLitros: Math.round(avgLitros),
            desviacionMax: Math.round(maxDesv * 10) / 10,
            anomalias,
          });
        }
      }

      clusters.sort((a, b) => b.anomalias - a.anomalias || b.desviacionMax - a.desviacionMax);

      const totalAnomalias = clusters.reduce((s, c) => s + c.anomalias, 0);
      const totalViajes = clusters.reduce((s, c) => s + c.totalViajes, 0);
      const rutasConAnomalias = clusters.filter(c => c.anomalias > 0).length;

      res.json({
        rutas: clusters,
        resumen: {
          totalRutas: clusters.length,
          totalViajes,
          totalAnomalias,
          rutasConAnomalias,
          camionesAnalizados: tripsByCamion.size,
          toleranciaKm: ROUTE_TOLERANCE_KM,
          umbralAnomaliaPct: ANOMALY_THRESHOLD_PCT,
          minimoViajes: MIN_TRIPS_FOR_BASELINE,
        },
      });
    } catch (error: any) {
      console.error("[ia/combustibles-reales] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ia/combustibles-reales/consulta", async (req: Request, res: Response) => {
    try {
      const { pregunta } = req.body;
      if (!pregunta || typeof pregunta !== "string") {
        return res.status(400).json({ message: "Se requiere campo 'pregunta'" });
      }

      const contratos = await storage.getTmsContratos();
      const camiones = (await storage.getCamiones()).filter(c => c.vin != null);
      const faenas = await storage.getFaenas();
      const camionMap = new Map(camiones.map(c => [c.id, c]));
      const faenaMap = new Map(faenas.map(f => [f.id, f]));

      let allTrips: any[] = [];
      for (const contrato of contratos) {
        const viajes = await storage.getTmsViajes(contrato.id);
        allTrips.push(...viajes);
      }

      const validTrips = allTrips.filter(v =>
        Number(v.kmRecorridos) > 10 &&
        (Number(v.litrosEcu) > 0 || Number(v.litrosSigetra) > 0) &&
        Number(v.rendimientoReal) > 0
      );

      const tripSummaries = validTrips.slice(0, 200).map(v => {
        const cam = camionMap.get(v.camionId);
        const faena = cam ? faenaMap.get(cam.faenaId) : null;
        return `Patente:${cam?.patente||"?"} Faena:${faena?.nombre||"?"} Ruta:${v.origenNombre||"?"}>${v.destinoNombre||"?"} Km:${Number(v.kmRecorridos).toFixed(0)} Lt_Surtidor:${Number(v.litrosSigetra||0).toFixed(0)} Lt_ECU:${Number(v.litrosEcu||0).toFixed(0)} Rend:${Number(v.rendimientoReal).toFixed(2)}km/L Fecha:${v.fechaSalida ? new Date(v.fechaSalida).toISOString().split("T")[0] : "?"}`;
      });

      const fusionCtx = await getFusionContext(14);

      const contextStr = `VIAJES TMS DETECTADOS (${validTrips.length} total, mostrando ${tripSummaries.length}):\n${tripSummaries.join("\n")}\n\nDATOS FUSION FLOTA (14 dias):\n${fusionCtx}`;

      const client = getClient();
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: `Eres un analista experto en combustibles de flotas de camiones de la empresa Sotraser en Chile. Tu especialidad es detectar anomalias comparando consumo real por ruta. 

REGLAS:
- Compara siempre el consumo de un camion con SU PROPIO historial en la MISMA ruta (origen-destino similar)
- Minimo 3 viajes en la misma ruta para establecer un baseline confiable
- Una desviacion mayor al 20% del baseline propio es sospechosa
- Considera diferencias entre litros Surtidor (manual) y litros ECU (telematica) como indicador de posible fraude
- Responde en espanol, con datos concretos (patentes, rutas, litros, porcentajes)
- No menciones costos ni valores en CLP
- Se directo y conciso

Pregunta del usuario: ${pregunta}

Datos disponibles:
${contextStr}`
        }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      res.json({ respuesta: text });
    } catch (error: any) {
      console.error("[ia/combustibles-reales/consulta] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });
}
