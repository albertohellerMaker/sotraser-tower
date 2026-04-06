import type { Express, Request, Response } from "express";
import { pool } from "./db";
import Anthropic from "@anthropic-ai/sdk";
import { CONTRATOS_ACTIVOS } from "./faena-filter";
import { validate } from "./middleware/validate";
import { z } from "zod";

const ContratoParam = z.object({ contrato: z.string().min(1) });
const BrainAnomaliasMacroQuery = z.object({ contrato: z.string().default("TODOS") });

const MODEL = "claude-sonnet-4-20250514";

function getContratos(contrato: string): string[] {
  return contrato === "TODOS" ? CONTRATOS_ACTIVOS : [contrato];
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

let anomaliasCache: { data: any[]; ts: number; contrato: string } = { data: [], ts: 0, contrato: "" };

async function detectarAnomaliasMacro(contrato: string) {
  if (contrato === anomaliasCache.contrato && Date.now() - anomaliasCache.ts < 10 * 60 * 1000) {
    return anomaliasCache.data;
  }

  const contratos = getContratos(contrato);
  const anomalias: any[] = [];

  try {
    const viajesR = await pool.query(`
      WITH viajes_recientes AS (
        SELECT va.id, c.patente, va.contrato, va.origen_nombre, va.destino_nombre,
          va.km_ecu::float as km_ecu, va.fecha_inicio,
          va.destino_lat::float as dest_lat, va.destino_lng::float as dest_lng
        FROM viajes_aprendizaje va
        JOIN camiones c ON c.id = va.camion_id
        WHERE va.fecha_inicio >= NOW() - INTERVAL '48 hours'
          AND va.contrato = ANY($1) AND va.km_ecu::float >= 100
      ),
      historico AS (
        SELECT c2.patente,
          MODE() WITHIN GROUP (ORDER BY va2.destino_nombre) as destino_habitual,
          AVG(va2.km_ecu::float) as km_prom,
          AVG(va2.destino_lat::float) as lat_prom,
          AVG(va2.destino_lng::float) as lng_prom
        FROM viajes_aprendizaje va2
        JOIN camiones c2 ON c2.id = va2.camion_id
        WHERE va2.fecha_inicio >= NOW() - INTERVAL '30 days'
          AND va2.fecha_inicio < NOW() - INTERVAL '48 hours'
          AND va2.km_ecu::float > 50
          AND va2.destino_nombre IS NOT NULL AND va2.destino_nombre != 'Punto desconocido'
          AND va2.contrato = ANY($1)
        GROUP BY c2.patente
        HAVING COUNT(*) >= 3
      )
      SELECT vr.*, h.destino_habitual, h.km_prom, h.lat_prom, h.lng_prom
      FROM viajes_recientes vr
      JOIN historico h ON h.patente = vr.patente
      WHERE h.km_prom > 0
    `, [contratos]);

    for (const v of viajesR.rows) {
      const diffKm = Math.abs(v.km_ecu - v.km_prom) / v.km_prom;
      let distDestino = 999;
      if (v.dest_lat && v.lat_prom) {
        distDestino = haversineKm(v.dest_lat, v.dest_lng, v.lat_prom, v.lng_prom);
      }

      if (distDestino > 50 && diffKm > 0.30) {
        anomalias.push({
          tipo: "RUTA_ANOMALA", severidad: diffKm > 0.5 ? "ALTA" : "MEDIA",
          patente: v.patente, contrato: v.contrato, fecha: v.fecha_inicio, viaje_id: v.id,
          detalle: {
            destino_habitual: v.destino_habitual, destino_actual: v.destino_nombre,
            km_habitual: Math.round(v.km_prom), km_actual: Math.round(v.km_ecu),
            diff_km_pct: Math.round(diffKm * 100), dist_destino_km: Math.round(distDestino),
          },
        });
      }
    }
  } catch (e: any) { console.error("[BRAIN] Error rutas anomalas:", e.message); }

  const sorted = anomalias.sort((a: any, b: any) => {
    const sev: Record<string, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };
    return (sev[a.severidad] || 2) - (sev[b.severidad] || 2);
  });

  anomaliasCache = { data: sorted, ts: Date.now(), contrato };
  return sorted;
}

export function registerBrainRoutes(app: Express) {

  let resumenCache: { data: any; ts: number } = { data: null, ts: 0 };

  app.get("/api/brain/resumen-ejecutivo", async (_req: Request, res: Response) => {
    try {
      if (resumenCache.data && Date.now() - resumenCache.ts < 2 * 60 * 1000) {
        return res.json(resumenCache.data);
      }

      const [contratosR, billingR, tendenciaR, gpsR, totalCamR] = await Promise.all([
        pool.query(`
          SELECT va.contrato,
            COUNT(*) as viajes_mes,
            COUNT(DISTINCT va.camion_id) as camiones,
            ROUND(SUM(va.km_ecu::float) FILTER (WHERE va.km_ecu::float > 0)::numeric) as km_total,
            ROUND(AVG(va.km_ecu::float) FILTER (WHERE va.km_ecu::float > 0)::numeric) as km_prom,
            COUNT(*) FILTER (WHERE va.fecha_inicio >= NOW() - INTERVAL '24 hours') as viajes_hoy,
            COUNT(*) FILTER (WHERE va.fecha_inicio >= NOW() - INTERVAL '7 days') as viajes_semana
          FROM viajes_aprendizaje va
          WHERE va.fecha_inicio >= date_trunc('month', NOW()) AND va.km_ecu::float > 5
          GROUP BY va.contrato ORDER BY viajes_mes DESC
        `),
        pool.query(`
          SELECT va.contrato,
            COUNT(*) as total_viajes,
            COUNT(*) FILTER (WHERE va.estado = 'FACTURADO' OR va.estado = 'CONFIRMADO') as facturables,
            COALESCE(SUM(
              (SELECT MIN(crt.tarifa_clp) FROM contrato_rutas_tarifas crt
               WHERE crt.contrato = va.contrato AND crt.origen = va.origen_nombre
                 AND crt.destino = va.destino_nombre AND crt.activo = true)
            ) FILTER (WHERE va.estado = 'FACTURADO' OR va.estado = 'CONFIRMADO'), 0) as monto_clp
          FROM viajes_aprendizaje va
          WHERE va.fecha_inicio >= date_trunc('month', NOW())
            AND va.fuente_viaje = 'T1_RECONSTRUCTOR'
          GROUP BY va.contrato
        `),
        pool.query(`
          SELECT DATE(fecha_inicio) as dia,
            COUNT(*) as viajes,
            COUNT(DISTINCT camion_id) as camiones,
            ROUND(SUM(km_ecu::float) FILTER (WHERE km_ecu::float > 0)::numeric) as km
          FROM viajes_aprendizaje
          WHERE fecha_inicio >= NOW() - INTERVAL '7 days' AND km_ecu::float > 5
          GROUP BY DATE(fecha_inicio) ORDER BY dia
        `),
        pool.query(`
          SELECT COUNT(DISTINCT patente) as activos
          FROM wisetrack_posiciones WHERE fecha >= NOW() - INTERVAL '2 hours'
        `),
        pool.query(`SELECT COUNT(*) as total FROM camiones WHERE activo = true`),
      ]);

      const billingMap: Record<string, any> = {};
      for (const b of billingR.rows) {
        billingMap[b.contrato] = {
          facturables: parseInt(b.facturables || "0"),
          total: parseInt(b.total_viajes || "0"),
          monto: parseInt(b.monto_clp || "0"),
        };
      }

      const contratos = contratosR.rows.map((c: any) => ({
        contrato: c.contrato,
        camiones: parseInt(c.camiones || "0"),
        viajes_mes: parseInt(c.viajes_mes || "0"),
        viajes_hoy: parseInt(c.viajes_hoy || "0"),
        viajes_semana: parseInt(c.viajes_semana || "0"),
        km_total: parseInt(c.km_total || "0"),
        km_prom: parseInt(c.km_prom || "0"),
        billing: billingMap[c.contrato] || null,
      }));

      const totales = {
        camiones_activos: parseInt(gpsR.rows[0]?.activos || "0"),
        camiones_total: parseInt(totalCamR.rows[0]?.total || "0"),
        viajes_hoy: contratos.reduce((s: number, c: any) => s + c.viajes_hoy, 0),
        viajes_mes: contratos.reduce((s: number, c: any) => s + c.viajes_mes, 0),
        km_mes: contratos.reduce((s: number, c: any) => s + c.km_total, 0),
        contratos_activos: contratos.length,
      };

      const result = { totales, contratos, tendencia_7d: tendenciaR.rows };
      resumenCache = { data: result, ts: Date.now() };
      res.json(result);
    } catch (e: any) {
      console.error("[BRAIN] Error resumen-ejecutivo:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/brain/resumen-rapido", async (_req: Request, res: Response) => {
    try {
      const anomalias = await detectarAnomaliasMacro("TODOS");
      const cobR = await pool.query(`
        SELECT
          (SELECT COUNT(DISTINCT patente) FROM wisetrack_posiciones
           WHERE fecha >= NOW() - INTERVAL '7 days') as total_wt,
          (SELECT COUNT(DISTINCT patente) FROM wisetrack_posiciones
           WHERE fecha >= NOW() - INTERVAL '2 hours') as con_gps
      `);
      const total = parseInt(cobR.rows[0]?.total_wt || "1");
      const conGps = parseInt(cobR.rows[0]?.con_gps || "0");
      res.json({ anomalias_macro: anomalias.length, cobertura_sistema: total > 0 ? Math.round(conGps / total * 100) : 0 });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/brain/estado-sistema", async (_req: Request, res: Response) => {
    try {
      const cobR = await pool.query(`
        SELECT
          (SELECT COUNT(DISTINCT patente) FROM wisetrack_posiciones
           WHERE fecha >= NOW() - INTERVAL '7 days') as total,
          (SELECT COUNT(DISTINCT patente) FROM wisetrack_posiciones
           WHERE fecha >= NOW() - INTERVAL '2 hours') as con_gps
      `);
      const ecuR = await pool.query(`
        SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE rendimiento_real::float > 0) as con_ecu
        FROM viajes_aprendizaje WHERE fecha_inicio >= date_trunc('month', NOW()) AND contrato = ANY($1)
      `, [CONTRATOS_ACTIVOS]);
      const syncR = await pool.query(`
        SELECT MAX(fecha) as ultimo_wt FROM wisetrack_posiciones
      `);

      const totalCam = parseInt(cobR.rows[0]?.total || "1");
      const conGps = parseInt(cobR.rows[0]?.con_gps || "0");
      const totalViajes = parseInt(ecuR.rows[0]?.total || "1");
      const conEcu = parseInt(ecuR.rows[0]?.con_ecu || "0");

      res.json({
        cobertura_wisetrack: { activos: conGps, total: totalCam, pct: totalCam > 0 ? Math.round(conGps / totalCam * 100) : 0 },
        datos_telemetria: { con_datos: conEcu, total: totalViajes, pct: totalViajes > 0 ? Math.round(conEcu / totalViajes * 100) : 0 },
        ultimo_sync_wisetrack: syncR.rows[0]?.ultimo_wt || null,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/brain/predicciones/:contrato", validate({ params: ContratoParam }), async (req: Request, res: Response) => {
    try {
      const contratos = getContratos(String(req.params.contrato));
      const now = new Date();
      const diasRestantes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();

      const kmR = await pool.query(`
        SELECT COALESCE(SUM(km_ecu::float), 0) as km_mes
        FROM viajes_aprendizaje WHERE fecha_inicio >= date_trunc('month', NOW()) AND contrato = ANY($1) AND km_ecu::float > 0
      `, [contratos]);
      const promR = await pool.query(`
        SELECT AVG(km_dia) as km_dia_prom FROM (
          SELECT DATE(fecha_inicio) as dia, SUM(km_ecu::float) as km_dia
          FROM viajes_aprendizaje WHERE fecha_inicio >= NOW() - INTERVAL '7 days' AND contrato = ANY($1) AND km_ecu::float > 0
          GROUP BY DATE(fecha_inicio)
        ) d
      `, [contratos]);
      const tendR = await pool.query(`
        SELECT
          SUM(km_ecu::float) FILTER (WHERE fecha_inicio >= NOW() - INTERVAL '7 days') as km_semana_actual,
          SUM(km_ecu::float) FILTER (WHERE fecha_inicio >= NOW() - INTERVAL '14 days' AND fecha_inicio < NOW() - INTERVAL '7 days') as km_semana_anterior
        FROM viajes_aprendizaje WHERE contrato = ANY($1) AND km_ecu::float > 0
      `, [contratos]);
      const rendR = await pool.query(`
        SELECT AVG(rendimiento_real::float) as rend_prom
        FROM viajes_aprendizaje WHERE fecha_inicio >= NOW() - INTERVAL '14 days' AND contrato = ANY($1) AND rendimiento_real::float > 0.5
      `, [contratos]);
      const activosR = await pool.query(`
        SELECT COUNT(DISTINCT patente) as hoy FROM wisetrack_posiciones
        WHERE fecha >= NOW() - INTERVAL '4 hours'
      `);
      const histActivosR = await pool.query(`
        SELECT AVG(cnt) as prom FROM (
          SELECT DATE(fecha_inicio) as d, COUNT(DISTINCT camion_id) as cnt
          FROM viajes_aprendizaje WHERE EXTRACT(DOW FROM fecha_inicio) = EXTRACT(DOW FROM NOW())
            AND fecha_inicio >= NOW() - INTERVAL '30 days' AND contrato = ANY($1)
          GROUP BY DATE(fecha_inicio)
        ) x
      `, [contratos]);

      const kmMes = parseFloat(kmR.rows[0]?.km_mes || "0");
      const kmDiaProm = parseFloat(promR.rows[0]?.km_dia_prom || "0");
      const kmProyectado = kmMes + (kmDiaProm * diasRestantes);
      const semActual = parseFloat(tendR.rows[0]?.km_semana_actual || "0");
      const semAnterior = parseFloat(tendR.rows[0]?.km_semana_anterior || "0");
      const tendenciaPct = semAnterior > 0 ? Math.round((semActual - semAnterior) / semAnterior * 100) : 0;

      res.json({
        contrato: req.params.contrato,
        km_mes_actual: Math.round(kmMes),
        km_proyectado: Math.round(kmProyectado),
        km_dia_promedio: Math.round(kmDiaProm),
        dias_restantes: diasRestantes,
        tendencia_semanal_pct: tendenciaPct,
        rendimiento_proyectado: parseFloat(rendR.rows[0]?.rend_prom || "0").toFixed(2),
        camiones_activos_hoy: parseInt(activosR.rows[0]?.hoy || "0"),
        camiones_promedio_historico: Math.round(parseFloat(histActivosR.rows[0]?.prom || "0")),
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/brain/anomalias-macro", validate({ query: BrainAnomaliasMacroQuery }), async (req: Request, res: Response) => {
    try {
      const { contrato } = (req as any).validatedQuery as z.infer<typeof BrainAnomaliasMacroQuery>;
      const anomalias = await detectarAnomaliasMacro(contrato);
      res.json(anomalias);
    } catch (e: any) { res.status(500).json({ error: "Error interno del servidor" }); }
  });

  app.get("/api/brain/kpis-administrador/:contrato", validate({ params: ContratoParam }), async (req: Request, res: Response) => {
    try {
      const contratos = getContratos(String(req.params.contrato));

      const kpiR = await pool.query(`
        SELECT COUNT(*) as viajes, COUNT(DISTINCT camion_id) as camiones,
          ROUND(AVG(km_ecu::float)::numeric, 0) as km_prom,
          ROUND(AVG(rendimiento_real::float) FILTER (WHERE rendimiento_real::float > 0.5)::numeric, 2) as rend_prom,
          ROUND(SUM(km_ecu::float)::numeric) as km_total
        FROM viajes_aprendizaje WHERE fecha_inicio >= date_trunc('month', NOW()) AND contrato = ANY($1) AND km_ecu::float > 20
      `, [contratos]);

      const topR = await pool.query(`
        SELECT c.patente, COUNT(*) as viajes,
          ROUND(AVG(va.rendimiento_real::float)::numeric, 2) as rend,
          ROUND(SUM(va.km_ecu::float)::numeric) as km
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.fecha_inicio >= date_trunc('month', NOW()) AND va.contrato = ANY($1)
          AND va.rendimiento_real::float > 0.5 AND va.km_ecu::float > 20
        GROUP BY c.patente HAVING COUNT(*) >= 3 ORDER BY rend DESC LIMIT 5
      `, [contratos]);

      const bottomR = await pool.query(`
        SELECT c.patente, COUNT(*) as viajes,
          ROUND(AVG(va.rendimiento_real::float)::numeric, 2) as rend,
          ROUND(SUM(va.km_ecu::float)::numeric) as km
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.fecha_inicio >= date_trunc('month', NOW()) AND va.contrato = ANY($1)
          AND va.rendimiento_real::float > 0.5 AND va.km_ecu::float > 20
        GROUP BY c.patente HAVING COUNT(*) >= 2 ORDER BY rend ASC LIMIT 3
      `, [contratos]);

      const k = kpiR.rows[0] || {};
      res.json({
        viajes: parseInt(k.viajes || "0"), camiones: parseInt(k.camiones || "0"),
        km_prom: parseInt(k.km_prom || "0"), rend_prom: parseFloat(k.rend_prom || "0"),
        km_total: parseInt(k.km_total || "0"),
        top_camiones: topR.rows.map((r: any) => ({ patente: r.patente, viajes: parseInt(r.viajes), rend: parseFloat(r.rend), km: parseInt(r.km) })),
        bottom_camiones: bottomR.rows.map((r: any) => ({ patente: r.patente, viajes: parseInt(r.viajes), rend: parseFloat(r.rend), km: parseInt(r.km) })),
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  const BrainChatBody = z.object({
    mensaje: z.string().min(1).max(5000),
    contrato: z.string().default("TODOS"),
    historial: z.array(z.object({ role: z.string(), content: z.string() })).default([]),
  });

  app.post("/api/brain/chat", validate({ body: BrainChatBody }), async (req: Request, res: Response) => {
    try {
      const { mensaje, contrato, historial } = req.body as z.infer<typeof BrainChatBody>;
      const contratos = getContratos(contrato);

      const [flotaR, kpiR, predR, fuelR] = await Promise.all([
        pool.query(`SELECT COUNT(DISTINCT patente) as activos FROM wisetrack_posiciones WHERE fecha >= NOW() - INTERVAL '2 hours'`),
        pool.query(`
          SELECT COUNT(*) as viajes, COUNT(DISTINCT camion_id) as camiones,
            ROUND(AVG(rendimiento_real::float) FILTER (WHERE rendimiento_real::float > 0.5)::numeric, 2) as rend,
            ROUND(SUM(km_ecu::float)::numeric) as km
          FROM viajes_aprendizaje WHERE fecha_inicio >= date_trunc('month', NOW()) AND contrato = ANY($1) AND km_ecu::float > 20
        `, [contratos]),
        pool.query(`
          SELECT AVG(km_dia) as km_dia FROM (
            SELECT SUM(km_ecu::float) as km_dia FROM viajes_aprendizaje
            WHERE fecha_inicio >= NOW() - INTERVAL '7 days' AND contrato = ANY($1) AND km_ecu::float > 0
            GROUP BY DATE(fecha_inicio)
          ) d
        `, [contratos]),
        pool.query(`
          SELECT patente,
            MAX(nivel_estanque) - MIN(nivel_estanque) as delta_tank,
            MAX(consumo_litros) - MIN(consumo_litros) as litros_consumidos,
            MAX(kms_total) - MIN(kms_total) as kms_recorridos
          FROM wisetrack_posiciones
          WHERE fecha >= NOW() - INTERVAL '24 hours'
            AND kms_total > 0 AND consumo_litros > 0
          GROUP BY patente
          HAVING MAX(kms_total) - MIN(kms_total) > 10
          ORDER BY litros_consumidos DESC LIMIT 10
        `),
      ]);

      const anomalias = await detectarAnomaliasMacro(contrato);
      const k = kpiR.rows[0] || {};
      const diasRestantes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate();
      const kmProy = parseFloat(k.km || "0") + (parseFloat(predR.rows[0]?.km_dia || "0") * diasRestantes);

      const fuelContext = fuelR.rows.slice(0, 5).map((r: any) => {
        const rend = r.kms_recorridos > 0 && r.litros_consumidos > 0 ? (r.kms_recorridos / r.litros_consumidos).toFixed(2) : "N/D";
        return `${r.patente}: ${Math.round(r.kms_recorridos)}km, ${Math.round(r.litros_consumidos)}L, ${rend} km/L`;
      }).join("\n");

      const systemPrompt = `Eres el asistente ejecutivo de Sotraser Tower para gestion de flota Cencosud.
Respondes en español, conciso y tecnico. Siempre con numeros reales del sistema. Nunca inventas datos.
Fuente unica de datos: WiseTrack API (telemetria GPS en tiempo real cada 60 segundos).

DATOS REALES HOY ${new Date().toLocaleDateString("es-CL")}:
FLOTA: ${flotaR.rows[0]?.activos || 0} camiones con GPS activo (ultimas 2h)
KPIs MES (${contrato}): ${k.viajes || 0} viajes, ${k.camiones || 0} camiones, ${k.rend || 0} km/L prom, ${Math.round(parseFloat(k.km || "0")).toLocaleString()} km total
PROYECCION: ${Math.round(kmProy).toLocaleString()} km fin de mes, ${diasRestantes} dias restantes
ANOMALIAS: ${anomalias.length} activas
${anomalias.slice(0, 3).map((a: any) => `- ${a.tipo} camion ${a.patente}: ${a.detalle.diff_km_pct}% desviacion km`).join("\n")}
COMBUSTIBLE TOP 5 (ultimas 24h):
${fuelContext || "Sin datos de combustible recientes"}

Si no tienes la info, dilo. No inventes.`;

      const client = new Anthropic();
      const messages = [
        ...historial.slice(-4).map((h: any) => ({ role: h.role as "user" | "assistant", content: h.content })),
        { role: "user" as const, content: mensaje },
      ];

      const response = await client.messages.create({ model: MODEL, max_tokens: 500, system: systemPrompt, messages });
      const respuesta = response.content?.[0]?.type === "text" ? response.content[0].text : "No pude procesar tu consulta.";

      res.json({ respuesta, contexto_usado: { viajes: k.viajes, anomalias: anomalias.length, proyeccion_km: Math.round(kmProy) } });
    } catch (e: any) {
      console.error("[BRAIN-CHAT] Error:", e.message);
      res.json({ respuesta: "Error conectando con la IA. Verifica la API key.", contexto_usado: {} });
    }
  });

  app.get("/api/brain/comparacion-fuentes", async (_req: Request, res: Response) => {
    try {
      const r3 = await pool.query(`
        SELECT patente,
          ROUND(SUM(GREATEST(kms_total - LAG(kms_total) OVER (PARTITION BY patente ORDER BY fecha), 0))::numeric) as km_wisetrack,
          ROUND(SUM(GREATEST(consumo_litros - LAG(consumo_litros) OVER (PARTITION BY patente ORDER BY fecha), 0))::numeric) as litros_wt
        FROM wisetrack_posiciones
        WHERE fecha >= NOW() - INTERVAL '7 days' AND kms_total > 0
        GROUP BY patente
        HAVING SUM(GREATEST(kms_total - LAG(kms_total) OVER (PARTITION BY patente ORDER BY fecha), 0)) > 100
        ORDER BY km_wisetrack DESC
        LIMIT 20
      `);

      const r4 = await pool.query(`
        SELECT nivel, COUNT(*) as total, ROUND(AVG(radio_metros)::numeric) as radio_avg
        FROM geocercas_operacionales WHERE activa = true
        GROUP BY nivel ORDER BY nivel
      `);

      const r5 = await pool.query(`
        SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE veces >= 3) as listos_promover,
          COUNT(*) FILTER (WHERE promovido) as promovidos
        FROM geocerca_puntos_nuevos
      `);

      res.json({
        km_wisetrack: (r3.rows || []).map((r: any) => ({
          patente: r.patente,
          km: parseInt(r.km_wisetrack || "0"),
          litros: parseInt(r.litros_wt || "0"),
          rend: r.litros_wt > 0 ? +(parseInt(r.km_wisetrack) / parseInt(r.litros_wt)).toFixed(2) : 0,
        })),
        geocercas: { niveles: r4.rows, puntos_nuevos: r5.rows[0] || {} },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  console.log("[BRAIN] Brain routes registered (WiseTrack engine)");
}
