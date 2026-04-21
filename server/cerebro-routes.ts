import type { Express, Request, Response } from "express";
import { pool } from "./db";
import { getSistemaEstado } from "./sistema-estado";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-20250514";
function getClient(): Anthropic {
  return new Anthropic();
}

let resumenIACache: { data: any; timestamp: number } | null = null;
const RESUMEN_IA_TTL = 5 * 60 * 1000;

export function registerCerebroRoutes(app: Express) {

  app.get("/api/sistema/estado", async (_req: Request, res: Response) => {
    try {
      const estado = await getSistemaEstado();
      res.json(estado);
    } catch (error: any) {
      console.error("[SISTEMA-ESTADO] Error endpoint:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/sistema/resumen-ia", async (_req: Request, res: Response) => {
    try {
      if (resumenIACache && Date.now() - resumenIACache.timestamp < RESUMEN_IA_TTL) {
        return res.json(resumenIACache.data);
      }

      const estado = await getSistemaEstado();
      const client = getClient();
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `Eres SOTRA IA, el cerebro de SOTRASER.
Resume en 3 oraciones cortas y directas que ha aprendido el sistema hasta ahora.

Datos del sistema:
- Dias aprendiendo: ${estado.dias_aprendiendo}
- Viajes procesados: ${estado.total_viajes_procesados}
- Rutas conocidas: ${estado.total_corredores_conocidos}
- Conductores analizados: ${estado.total_conductores_analizados}
- Camiones perfilados: ${estado.total_camiones_perfilados}
- Posiciones WiseTrack: ${(estado as any).total_posiciones_wisetrack || 0}
- Confianza global: ${estado.confianza_global}
- Alertas de patron activas: ${estado.alertas_patron_activas}

Se directo, usa numeros concretos.
No uses emojis. Maximo 3 oraciones.`
        }],
      });

      const resumen = response.content[0].type === "text" ? response.content[0].text : "Sin datos suficientes.";
      const result = { resumen, estado, cached: false };
      resumenIACache = { data: { ...result, cached: true }, timestamp: Date.now() };
      res.json(result);
    } catch (error: any) {
      console.error("[SISTEMA-ESTADO] Error resumen-ia:", error.message);
      const estado = await getSistemaEstado().catch(() => null);
      res.json({ resumen: null, estado, error: error.message });
    }
  });

  app.post("/api/sistema/consulta", async (req: Request, res: Response) => {
    try {
      const { pregunta } = req.body;
      if (!pregunta || typeof pregunta !== "string") {
        return res.status(400).json({ message: "Se requiere una pregunta" });
      }

      const estado = await getSistemaEstado();

      const corredoresTopR = await pool.query(`
        SELECT nombre, total_viajes_base, rendimiento_promedio
        FROM corredores WHERE activo = true
        ORDER BY total_viajes_base DESC LIMIT 5
      `);

      const alertasActivasR = await pool.query(`
        SELECT entidad_nombre, descripcion FROM alertas_aprendizaje
        WHERE gestionado = false ORDER BY fecha DESC LIMIT 5
      `);

      const anomaliasR = await pool.query(`
        SELECT v.rendimiento_real, c2.patente, cor.nombre as corredor_nombre
        FROM viajes_aprendizaje v
        LEFT JOIN camiones c2 ON v.camion_id = c2.id
        LEFT JOIN corredores cor ON v.corredor_id = cor.id
        WHERE v.estado = 'ANOMALIA'
        ORDER BY v.creado_at DESC LIMIT 5
      `);

      const systemPrompt = `Eres SOTRA IA, el cerebro adaptativo de SOTRASER.
Tu especialidad es explicar que ha aprendido el sistema y que patrones ha detectado.

ESTADO ACTUAL DEL SISTEMA:
- Dias aprendiendo: ${estado.dias_aprendiendo}
- Viajes analizados: ${estado.total_viajes_procesados}
- Rutas conocidas: ${estado.total_corredores_conocidos}
- Conductores perfilados: ${estado.total_conductores_analizados}
- Confianza global: ${estado.confianza_global}
- Madurez: ${estado.madurez_pct}%

RUTAS MAS CONOCIDAS:
${corredoresTopR.rows.map((c: any) =>
  `- ${c.nombre}: ${c.total_viajes_base} viajes, ${c.rendimiento_promedio || '?'} km/L promedio`
).join('\n') || 'Sin rutas conocidas aun'}

ALERTAS DE PATRON ACTIVAS:
${alertasActivasR.rows.map((a: any) =>
  `- ${a.entidad_nombre}: ${a.descripcion}`
).join('\n') || 'Sin alertas activas'}

ULTIMAS ANOMALIAS:
${anomaliasR.rows.map((v: any) =>
  `- ${v.patente || '?'} en ${v.corredor_nombre || '?'}: ${v.rendimiento_real} km/L`
).join('\n') || 'Sin anomalias recientes'}

Responde en espanol, directo, con datos concretos.
Si el sistema tiene poca data dilo claramente.
Maximo 3 parrafos.`;

      const client = getClient();
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: "user", content: pregunta }],
      });

      const respuesta = response.content[0].type === "text" ? response.content[0].text : "No pude procesar la consulta.";
      res.json({ respuesta });
    } catch (error: any) {
      console.error("[SISTEMA-ESTADO] Error consulta:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/aprendizaje/objetivos", async (_req: Request, res: Response) => {
    try {
      const [corredoresR, patronesR, perfilesCamR, perfilesCondR, parametrosR, viajesR] = await Promise.all([
        pool.query(`SELECT COUNT(*) as total, COUNT(CASE WHEN total_viajes_base >= 5 THEN 1 END) as con_datos FROM corredores WHERE activo = true`),
        pool.query(`SELECT COUNT(*) as total, COUNT(CASE WHEN confianza IN ('ALTA','EXPERTA') THEN 1 END) as maduros FROM patrones_carga_combustible`),
        pool.query(`SELECT COUNT(*) as total, COUNT(CASE WHEN total_jornadas >= 5 THEN 1 END) as con_datos FROM camiones_perfil`),
        pool.query(`SELECT COUNT(*) as total, COUNT(CASE WHEN total_jornadas >= 5 THEN 1 END) as con_datos FROM conductores_perfil`),
        pool.query(`SELECT COUNT(*) as total, COUNT(CASE WHEN confianza IN ('ALTA','EXPERTA') THEN 1 END) as maduros FROM parametros_adaptativos WHERE activo = true`),
        pool.query(`SELECT COUNT(*) as total FROM viajes_aprendizaje`),
      ]);

      const totalCamiones = parseInt(perfilesCamR.rows[0]?.total || "0");
      const totalCorredores = parseInt(corredoresR.rows[0]?.total || "0");
      const corredoresConDatos = parseInt(corredoresR.rows[0]?.con_datos || "0");
      const totalPatrones = parseInt(patronesR.rows[0]?.total || "0");
      const patronesMaduros = parseInt(patronesR.rows[0]?.maduros || "0");
      const camionesConDatos = parseInt(perfilesCamR.rows[0]?.con_datos || "0");
      const conductoresTotal = parseInt(perfilesCondR.rows[0]?.total || "0");
      const conductoresConDatos = parseInt(perfilesCondR.rows[0]?.con_datos || "0");
      const parametrosTotal = parseInt(parametrosR.rows[0]?.total || "0");
      const parametrosMaduros = parseInt(parametrosR.rows[0]?.maduros || "0");
      const totalViajes = parseInt(viajesR.rows[0]?.total || "0");

      const pctCorredores = totalCorredores > 0 ? Math.round((corredoresConDatos / totalCorredores) * 100) : 0;
      const pctPatrones = totalPatrones > 0 ? Math.round((patronesMaduros / totalPatrones) * 100) : (totalCamiones > 0 ? Math.round((totalPatrones / totalCamiones) * 100) : 0);
      const pctCamiones = totalCamiones > 0 ? Math.round((camionesConDatos / totalCamiones) * 100) : 0;
      const pctConductores = conductoresTotal > 0 ? Math.round((conductoresConDatos / conductoresTotal) * 100) : 0;
      const pctParametros = parametrosTotal > 0 ? Math.round((parametrosMaduros / parametrosTotal) * 100) : 0;

      const objetivos = [
        {
          id: "eficiencia_corredor",
          nombre: "EFICIENCIA COMBUSTIBLE POR CORREDOR",
          descripcion: "Aprender rendimiento km/L esperado por cada ruta para detectar desviaciones",
          progreso: Math.min(pctCorredores, 100),
          datos: `${corredoresConDatos}/${totalCorredores} corredores con baseline`,
          estado: pctCorredores >= 80 ? "ACTIVO" : pctCorredores >= 30 ? "APRENDIENDO" : "OBSERVANDO",
          dia_inicio: 1,
        },
        {
          id: "patron_carga",
          nombre: "PATRON DE CARGA EN ESTACIONES",
          descripcion: "Aprender litros tipicos por camion y estacion para detectar cargas anomalas",
          progreso: Math.min(pctPatrones, 100),
          datos: `${patronesMaduros}/${totalPatrones} patrones maduros`,
          estado: pctPatrones >= 80 ? "ACTIVO" : pctPatrones >= 30 ? "APRENDIENDO" : "OBSERVANDO",
          dia_inicio: 1,
        },
        {
          id: "tiempo_geocerca",
          nombre: "TIEMPO EN GEOCERCA",
          descripcion: "Aprender permanencia tipica en cada punto para detectar tiempos excesivos",
          progreso: Math.min(Math.round((totalViajes / Math.max(totalCamiones * 7, 1)) * 100), 100),
          datos: `${totalViajes} viajes procesados`,
          estado: totalViajes > totalCamiones * 5 ? "APRENDIENDO" : "OBSERVANDO",
          dia_inicio: 3,
        },
        {
          id: "degradacion_conductor",
          nombre: "DEGRADACION DE CONDUCTOR",
          descripcion: "Comparar rendimiento reciente vs historico por conductor para detectar caidas >20%",
          progreso: Math.min(pctConductores, 100),
          datos: `${conductoresConDatos}/${conductoresTotal} conductores perfilados`,
          estado: pctConductores >= 60 ? "ACTIVO" : pctConductores >= 20 ? "APRENDIENDO" : "OBSERVANDO",
          dia_inicio: 5,
        },
        {
          id: "ciclo_contrato",
          nombre: "CICLO OPERATIVO POR CONTRATO",
          descripcion: "Aprender patrones semanales de actividad por contrato para detectar desviaciones",
          progreso: Math.min(pctParametros, 100),
          datos: `${parametrosMaduros}/${parametrosTotal} parametros maduros`,
          estado: pctParametros >= 70 ? "ACTIVO" : pctParametros >= 20 ? "APRENDIENDO" : "OBSERVANDO",
          dia_inicio: 7,
        },
      ];

      res.json({ objetivos, meta: { totalViajes, totalCamiones, totalCorredores, totalPatrones, conductoresTotal } });
    } catch (error: any) {
      console.error("[APRENDIZAJE] Error objetivos:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/aprendizaje/parametros", async (_req: Request, res: Response) => {
    try {
      const result = await pool.query(`
        SELECT * FROM parametros_adaptativos
        WHERE activo = true
        ORDER BY scope_tipo, scope_id
      `);

      const grouped: Record<string, any[]> = {};
      for (const row of result.rows) {
        const key = row.scope_tipo;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(row);
      }

      res.json({ parametros: grouped, total: result.rows.length });
    } catch (error: any) {
      console.error("[SISTEMA-ESTADO] Error parametros:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/aprendizaje/alertas/:id/gestionar", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const idNum = parseInt(String(id));
      if (isNaN(idNum)) return res.status(400).json({ message: "ID invalido" });
      const { nota } = req.body;

      const result = await pool.query(`
        UPDATE alertas_aprendizaje SET gestionado = true, nota = $1 WHERE id = $2 RETURNING *
      `, [nota || null, id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Alerta no encontrada" });
      }

      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("[SISTEMA-ESTADO] Error gestionar alerta:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/cerebro/estado-general", async (_req: Request, res: Response) => {
    try {
      const hoyStr = new Date().toISOString().split("T")[0];

      // All from gps_unificado - single efficient query
      const mainR = await pool.query(`
        SELECT
          COUNT(DISTINCT patente)::int as total_camiones,
          COUNT(DISTINCT patente) FILTER (WHERE timestamp_gps >= NOW() - INTERVAL '2 hours')::int as activos,
          COUNT(DISTINCT patente) FILTER (WHERE timestamp_gps < NOW() - INTERVAL '2 hours')::int as sin_gps,
          COUNT(DISTINCT patente) FILTER (WHERE velocidad > 105 AND DATE(timestamp_gps) = CURRENT_DATE)::int as excesos_vel
        FROM ultima_posicion_camion
      `);
      const m = mainR.rows[0];

      // KM hoy from gps_unificado
      const kmR = await pool.query(`
        SELECT SUM(km_d)::int as km FROM (
          SELECT patente, COALESCE(MAX(odometro) - MIN(odometro), 0) as km_d
          FROM gps_unificado WHERE DATE(timestamp_gps) = CURRENT_DATE AND odometro > 0
          GROUP BY patente HAVING MAX(odometro) - MIN(odometro) > 0 AND MAX(odometro) - MIN(odometro) < 5000
        ) sub
      `);

      const rendR = await pool.query(`
        SELECT AVG(CASE WHEN kms_total > 0 AND consumo_litros > 0 THEN kms_total / consumo_litros END)::numeric(6,2) as rend FROM (
          SELECT patente, MAX(kms_total) - MIN(kms_total) as kms_total, MAX(consumo_litros) - MIN(consumo_litros) as consumo_litros
          FROM wisetrack_posiciones WHERE DATE(creado_at) = $1::date
          GROUP BY patente HAVING MAX(kms_total) > MIN(kms_total) AND MAX(consumo_litros) > MIN(consumo_litros)
        ) sub
      `, [hoyStr]);

      // Por contrato from gps_unificado
      const pcR = await pool.query(`
        SELECT contrato, COUNT(DISTINCT patente)::int as total_camiones,
          COUNT(DISTINCT patente) FILTER (WHERE timestamp_gps >= NOW() - INTERVAL '2 hours')::int as activos,
          COUNT(DISTINCT patente) FILTER (WHERE velocidad > 105 AND DATE(timestamp_gps) = CURRENT_DATE)::int as alertas
        FROM ultima_posicion_camion
        WHERE contrato IS NOT NULL AND contrato != ''
        GROUP BY contrato ORDER BY total_camiones DESC
      `);

      // KM por contrato
      const kmcR = await pool.query(`
        SELECT contrato, SUM(km_d)::int as km FROM (
          SELECT contrato, patente, COALESCE(MAX(odometro)-MIN(odometro),0) as km_d
          FROM gps_unificado WHERE DATE(timestamp_gps) = CURRENT_DATE AND odometro > 0 AND contrato IS NOT NULL
          GROUP BY contrato, patente HAVING MAX(odometro)-MIN(odometro) > 0 AND MAX(odometro)-MIN(odometro) < 5000
        ) sub GROUP BY contrato
      `);
      const kmByContrato = new Map(kmcR.rows.map((r: any) => [r.contrato, r.km]));

      const porContrato = pcR.rows.map((r: any) => ({
        contrato: r.contrato, total_camiones: r.total_camiones, activos: r.activos,
        km_hoy: kmByContrato.get(r.contrato) || 0, rendimiento: null, alertas: r.alertas,
      }));

      const alertasCriticas = (m.sin_gps || 0) + (m.excesos_vel || 0);

      res.json({
        camiones_activos: m.activos || 0,
        total_camiones: m.total_camiones || 0,
        km_hoy: kmR.rows[0]?.km || 0,
        rendimiento_promedio: rendR.rows[0]?.rend ? parseFloat(rendR.rows[0].rend) : null,
        alertas_criticas: alertasCriticas,
        sin_gps: m.sin_gps || 0,
        excesos_velocidad: m.excesos_vel || 0,
        semaforo: alertasCriticas === 0 ? "NORMAL" : alertasCriticas <= 3 ? "ATENCION" : "ALERTA",
        por_contrato: porContrato,
        fecha: hoyStr,
      });
    } catch (error: any) {
      console.error("[cerebro] Error estado-general:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/cerebro/camiones-alerta", async (_req: Request, res: Response) => {
    try {
      const ahora = new Date();
      const hace2h = new Date(ahora.getTime() - 2 * 60 * 60 * 1000);
      const hoyStr = ahora.toISOString().split("T")[0];
      const alertas: any[] = [];

      const velResult = await pool.query(`
        SELECT g.patente, f.nombre as contrato,
          MAX(g.velocidad_kmh)::int as vel_max,
          MAX(g.timestamp_punto) as ultimo_gps,
          (SELECT ARRAY[g2.lat::text, g2.lng::text] FROM geo_puntos g2
           WHERE g2.patente = g.patente ORDER BY g2.timestamp_punto DESC LIMIT 1) as ultima_pos
        FROM geo_puntos g
        JOIN camiones c ON g.camion_id = c.id
        JOIN faenas f ON c.faena_id = f.id
        WHERE g.timestamp_punto >= $1::date AND g.timestamp_punto < ($1::date + interval '1 day')
          AND g.velocidad_kmh > 105
          AND c.vin IS NOT NULL AND c.vin != ''
        GROUP BY g.patente, f.nombre
        ORDER BY vel_max DESC
        LIMIT 10
      `, [hoyStr]);
      const conductorBatchAlerta = await pool.query(`
        SELECT DISTINCT ON (ca.camion_id) ca.camion_id, ca.conductor, c.patente
        FROM cargas ca
        JOIN camiones c ON ca.camion_id = c.id
        WHERE ca.conductor IS NOT NULL AND ca.conductor != ''
        ORDER BY ca.camion_id, ca.fecha DESC
      `);
      const conductorByPatente = new Map<string, string>();
      for (const r of conductorBatchAlerta.rows) {
        conductorByPatente.set(r.patente, r.conductor);
      }
      const getConductor = (patente: string) => conductorByPatente.get(patente) || "Sin asignar";

      for (const r of velResult.rows) {
        alertas.push({
          patente: r.patente,
          contrato: r.contrato,
          conductor: getConductor(r.patente),
          tipo: "VELOCIDAD",
          descripcion: `Velocidad maxima ${r.vel_max} km/h registrada hoy`,
          dato: `${r.vel_max} km/h`,
          severidad: r.vel_max > 140 ? "CRITICA" : "ALTA",
          ultimo_gps: r.ultimo_gps,
          ultima_pos: r.ultima_pos,
        });
      }

      const sinGpsResult = await pool.query(`
        SELECT c.patente, f.nombre as contrato,
          (SELECT MAX(g2.timestamp_punto) FROM geo_puntos g2 WHERE g2.patente = c.patente) as ultimo_gps,
          (SELECT ARRAY[g2.lat::text, g2.lng::text] FROM geo_puntos g2
           WHERE g2.patente = c.patente ORDER BY g2.timestamp_punto DESC LIMIT 1) as ultima_pos
        FROM camiones c
        JOIN faenas f ON c.faena_id = f.id
        WHERE c.vin IS NOT NULL AND c.vin != ''
          AND c.patente NOT IN (
            SELECT DISTINCT g3.patente FROM geo_puntos g3
            WHERE g3.timestamp_punto >= $1
          )
        LIMIT 10
      `, [hace2h]);
      for (const r of sinGpsResult.rows) {
        const hace = r.ultimo_gps
          ? Math.round((ahora.getTime() - new Date(r.ultimo_gps).getTime()) / 3600000)
          : null;
        alertas.push({
          patente: r.patente,
          contrato: r.contrato,
          conductor: getConductor(r.patente),
          tipo: "SIN_GPS",
          descripcion: `Sin senal GPS hace ${hace ? hace + " horas" : "mucho tiempo"}`,
          dato: hace ? `${hace}h sin GPS` : "Sin datos",
          severidad: (hace || 999) > 12 ? "CRITICA" : "ALTA",
          ultimo_gps: r.ultimo_gps,
          ultima_pos: r.ultima_pos,
        });
      }

      const rendBajoResult = await pool.query(`
        SELECT w.patente, COALESCE(f.nombre, 'N/A') as contrato,
          MAX(w.kms_total) - MIN(w.kms_total) as km_delta,
          MAX(w.consumo_litros) - MIN(w.consumo_litros) as litros_delta
        FROM wisetrack_posiciones w
        JOIN camiones c ON w.patente = c.patente
        JOIN faenas f ON c.faena_id = f.id
        WHERE DATE(w.creado_at) = $1::date
        GROUP BY w.patente, f.nombre
        HAVING MAX(w.kms_total) > MIN(w.kms_total)
          AND MAX(w.consumo_litros) > MIN(w.consumo_litros)
          AND (MAX(w.kms_total) - MIN(w.kms_total)) / NULLIF(MAX(w.consumo_litros) - MIN(w.consumo_litros), 0) < 1.5
        ORDER BY (MAX(w.kms_total) - MIN(w.kms_total)) / NULLIF(MAX(w.consumo_litros) - MIN(w.consumo_litros), 0)
        LIMIT 10
      `, [hoyStr]);
      for (const r of rendBajoResult.rows) {
        const rend = parseFloat(r.km_delta) > 0 && parseFloat(r.litros_delta) > 0
          ? (parseFloat(r.km_delta) / parseFloat(r.litros_delta)).toFixed(2)
          : null;
        if (rend) {
          const lastPos = await pool.query(`
            SELECT ARRAY[lat::text, lng::text] as pos, timestamp_punto
            FROM geo_puntos WHERE patente = $1 ORDER BY timestamp_punto DESC LIMIT 1
          `, [r.patente]);
          alertas.push({
            patente: r.patente,
            contrato: r.contrato,
            conductor: getConductor(r.patente),
            tipo: "RENDIMIENTO",
            descripcion: `Rendimiento ${rend} km/L (bajo meta)`,
            dato: `${rend} km/L`,
            severidad: parseFloat(rend) < 1.0 ? "CRITICA" : "ALTA",
            ultimo_gps: lastPos.rows[0]?.timestamp_punto || null,
            ultima_pos: lastPos.rows[0]?.pos || null,
          });
        }
      }

      alertas.sort((a, b) => {
        const sev = { CRITICA: 0, ALTA: 1, MEDIA: 2 };
        return (sev[a.severidad as keyof typeof sev] || 2) - (sev[b.severidad as keyof typeof sev] || 2);
      });

      // Filtrar alertas ya gestionadas (feedback dado hoy)
      const gestionadasR = await pool.query(`
        SELECT DISTINCT entidad_id FROM feedback_alertas
        WHERE creado_en >= $1::date AND creado_en < ($1::date + interval '1 day')
      `, [hoyStr]);
      const gestionadas = new Set(gestionadasR.rows.map((r: any) => r.entidad_id));
      const alertasFiltradas = alertas.filter(a => !gestionadas.has(a.patente));

      res.json(alertasFiltradas.slice(0, 10));
    } catch (error: any) {
      console.error("[cerebro] Error camiones-alerta:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/cerebro/contrato/:nombre", async (req: Request, res: Response) => {
    try {
      const { nombre } = req.params;
      const ahora = new Date();
      const hace2h = new Date(ahora.getTime() - 2 * 60 * 60 * 1000);
      const hoyStr = ahora.toISOString().split("T")[0];

      const camionesResult = await pool.query(`
        SELECT c.id as cam_id, c.patente, c.vin,
          (SELECT MAX(g.timestamp_punto) FROM geo_puntos g WHERE g.patente = c.patente) as ultimo_gps,
          (SELECT g.velocidad_kmh FROM geo_puntos g WHERE g.patente = c.patente ORDER BY g.timestamp_punto DESC LIMIT 1) as vel_actual,
          (SELECT ARRAY[g.lat::text, g.lng::text] FROM geo_puntos g WHERE g.patente = c.patente ORDER BY g.timestamp_punto DESC LIMIT 1) as ultima_pos
        FROM camiones c
        JOIN faenas f ON c.faena_id = f.id
        WHERE f.nombre = $1 AND c.vin IS NOT NULL
        ORDER BY c.patente
      `, [nombre]);

      const conductorBatch = await pool.query(`
        SELECT DISTINCT ON (camion_id) camion_id, conductor
        FROM cargas
        WHERE conductor IS NOT NULL AND conductor != ''
        ORDER BY camion_id, fecha DESC
      `);
      const conductorMap = new Map<number, string>();
      for (const r of conductorBatch.rows) {
        conductorMap.set(r.camion_id, r.conductor);
      }

      const camiones = [];
      for (const cam of camionesResult.rows) {
        const ultimoGps = cam.ultimo_gps ? new Date(cam.ultimo_gps) : null;
        let estado = "INACTIVO";
        if (ultimoGps) {
          const diffH = (ahora.getTime() - ultimoGps.getTime()) / 3600000;
          const vel = parseFloat(cam.vel_actual || 0);
          if (diffH > 2) estado = "SIN_SENAL";
          else if (vel > 5) estado = "EN_RUTA";
          else estado = "DETENIDO";
        }

        let kmHoy = 0;
        const kmRes = await pool.query(`
          SELECT MAX(km_odometro) - MIN(km_odometro) as km
          FROM geo_puntos
          WHERE patente = $1
            AND timestamp_punto >= $2::date AND timestamp_punto < ($2::date + interval '1 day')
            AND km_odometro > 0
        `, [cam.patente, hoyStr]);
        kmHoy = Math.round(parseFloat(kmRes.rows[0]?.km || 0));

        let rendHoy: number | null = null;
        if (cam.patente) {
          const rendRes = await pool.query(`
            SELECT
              MAX(kms_total) - MIN(kms_total) as km_d,
              MAX(consumo_litros) - MIN(consumo_litros) as l_d
            FROM wisetrack_posiciones
            WHERE patente = $1
              AND DATE(creado_at) = $2::date
          `, [cam.patente, hoyStr]);
          const kd = parseFloat(rendRes.rows[0]?.km_d || 0);
          const ld = parseFloat(rendRes.rows[0]?.l_d || 0);
          if (kd > 0 && ld > 0) rendHoy = Math.round((kd / ld) * 100) / 100;
        }

        const haceCuanto = ultimoGps
          ? (() => {
              const diffMin = Math.round((ahora.getTime() - ultimoGps.getTime()) / 60000);
              if (diffMin < 60) return `${diffMin} min`;
              const diffH = Math.round(diffMin / 60);
              if (diffH < 24) return `${diffH}h`;
              return `${Math.round(diffH / 24)}d`;
            })()
          : null;

        const conductor = conductorMap.get(cam.cam_id) || "Sin asignar";

        camiones.push({
          patente: cam.patente,
          conductor,
          estado,
          km_hoy: kmHoy,
          rendimiento: rendHoy,
          vel_actual: parseFloat(cam.vel_actual || 0),
          ultima_pos: cam.ultima_pos,
          ultimo_gps: cam.ultimo_gps,
          hace_cuanto: haceCuanto,
        });
      }

      const totalKm = camiones.reduce((s, c) => s + c.km_hoy, 0);
      const activos = camiones.filter(c => c.estado === "EN_RUTA" || c.estado === "DETENIDO").length;
      const conRend = camiones.filter(c => c.rendimiento !== null);
      const rendProm = conRend.length > 0
        ? Math.round((conRend.reduce((s, c) => s + (c.rendimiento || 0), 0) / conRend.length) * 100) / 100
        : null;
      const alertas = camiones.filter(c => c.estado === "SIN_SENAL").length;

      const rutasResult = await pool.query(`
        SELECT nombre_viaje as ruta, COUNT(*)::int as viajes,
          ROUND(AVG(km_total))::int as km_prom
        FROM viajes_diarios
        WHERE contrato = $1
        GROUP BY nombre_viaje
        HAVING COUNT(*) >= 2
        ORDER BY viajes DESC LIMIT 10
      `, [nombre]);

      res.json({
        contrato: nombre,
        camiones,
        kpis: {
          total: camiones.length,
          activos,
          km_hoy: totalKm,
          rendimiento: rendProm,
          alertas,
        },
        rutas_frecuentes: rutasResult.rows,
      });
    } catch (error: any) {
      console.error("[cerebro] Error contrato:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/feedback/alerta", async (req: Request, res: Response) => {
    try {
      const { alertaTipo, entidadTipo, entidadId, contrato, decision, nota, valorDetectado, umbralUsado, parametroAfectado } = req.body;
      if (!alertaTipo || !entidadId || !decision) {
        return res.status(400).json({ error: "alertaTipo, entidadId y decision son requeridos" });
      }
      if (!["CONFIRMADO", "FALSA_ALARMA"].includes(decision)) {
        return res.status(400).json({ error: "decision debe ser CONFIRMADO o FALSA_ALARMA" });
      }
      await pool.query(
        `INSERT INTO feedback_alertas (alerta_tipo, entidad_tipo, entidad_id, contrato, decision, nota, valor_detectado, umbral_usado, parametro_afectado)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [alertaTipo, entidadTipo || "CAMION", entidadId, contrato || null, decision, nota || null, String(valorDetectado ?? ""), String(umbralUsado ?? ""), parametroAfectado || "rendimiento_kmL"]
      );

      // Aplicar feedback al sistema
      try {
        if (decision === "FALSA_ALARMA") {
          // Bajar umbral 8% para esta entidad
          await pool.query(`
            UPDATE parametros_adaptativos
            SET umbral_anomalia = umbral_anomalia * 0.92, ultima_actualizacion = NOW()
            WHERE scope_tipo = $1 AND scope_id = $2 AND parametro = $3
          `, [entidadTipo || "CAMION", entidadId, parametroAfectado || "rendimiento_kmL"]);
        } else if (decision === "CONFIRMADO") {
          // Subir sensibilidad 3%
          await pool.query(`
            UPDATE parametros_adaptativos
            SET umbral_anomalia = umbral_anomalia * 1.03, ultima_actualizacion = NOW()
            WHERE scope_tipo = $1 AND scope_id = $2 AND parametro = $3
          `, [entidadTipo || "CAMION", entidadId, parametroAfectado || "rendimiento_kmL"]);
        }

        // Marcar alertas_aprendizaje como gestionadas
        await pool.query(`
          UPDATE alertas_aprendizaje SET gestionado = true, nota = $1
          WHERE entidad_nombre = $2 AND gestionado = false
        `, [nota || decision || null, entidadId]);

        // Marcar operaciones_cerradas como revisadas
        if (alertaTipo === "BALANCE_ANOMALO" || alertaTipo === "BALANCE_COMBUSTIBLE") {
          await pool.query(`
            UPDATE operaciones_cerradas SET revisado = true, decision_ceo = $1
            WHERE patente = $2 AND revisado = false AND nivel_anomalia != 'NORMAL'
          `, [decision, entidadId]);
        }
      } catch (e: any) {
        console.error("[FEEDBACK] Error aplicando:", e.message);
      }

      // Contar feedbacks del mes
      const countR = await pool.query(`SELECT count(*) as c FROM feedback_alertas WHERE creado_en >= NOW() - INTERVAL '30 days'`);
      const feedbackCount = parseInt(countR.rows[0]?.c || "0");

      console.log(`[FEEDBACK] ${decision} para ${alertaTipo} ${entidadId} (${contrato || "sin contrato"}) — total feedbacks: ${feedbackCount}`);
      res.json({ ok: true, feedbacks_mes: feedbackCount });
    } catch (error: any) {
      console.error("[FEEDBACK] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/recalibrar-corredores", async (_req: Request, res: Response) => {
    try {
      const corredoresAntesR = await pool.query(`SELECT COUNT(*)::int as total FROM corredores`);
      const corredoresAntes = corredoresAntesR.rows[0].total;

      await pool.query(`UPDATE viajes_aprendizaje SET corredor_id = NULL`);
      await pool.query(`DELETE FROM corredores`);

      function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.asin(Math.sqrt(a));
      }

      function getRadioCorredor(kmViaje: number | null): number {
        if (!kmViaje || kmViaje === 0) return 3;
        if (kmViaje < 50) return 1;
        if (kmViaje < 200) return 3;
        if (kmViaje < 500) return 5;
        return 8;
      }

      function geocodearLugar(lat: number, lng: number): string {
        return `${lat.toFixed(2)},${lng.toFixed(2)}`;
      }

      const viajesR = await pool.query(`
        SELECT * FROM viajes_aprendizaje
        WHERE origen_lat IS NOT NULL AND destino_lat IS NOT NULL
        ORDER BY fecha_inicio
      `);

      let procesados = 0;
      for (const viaje of viajesR.rows) {
        const kmViaje = parseFloat(viaje.km_gps) || parseFloat(viaje.km_ecu) || null;
        const radioKm = getRadioCorredor(kmViaje);

        const corredoresR2 = await pool.query(`
          SELECT * FROM corredores WHERE activo = true AND contrato = $1
        `, [viaje.contrato || '']);

        let corredorMatch: any = null;
        for (const c of corredoresR2.rows) {
          if (!c.origen_lat || !c.destino_lat) continue;
          const distO = haversineKm(
            parseFloat(viaje.origen_lat), parseFloat(viaje.origen_lng),
            parseFloat(c.origen_lat), parseFloat(c.origen_lng)
          );
          const distD = haversineKm(
            parseFloat(viaje.destino_lat), parseFloat(viaje.destino_lng),
            parseFloat(c.destino_lat), parseFloat(c.destino_lng)
          );
          if (distO < radioKm && distD < radioKm) {
            corredorMatch = c;
            break;
          }
        }

        if (corredorMatch) {
          await pool.query(`UPDATE viajes_aprendizaje SET corredor_id = $1 WHERE id = $2`, [corredorMatch.id, viaje.id]);
          const statsR = await pool.query(`
            SELECT COUNT(*)::int as total,
              AVG(rendimiento_real::float) FILTER (WHERE rendimiento_real::float > 0 AND rendimiento_real::float < 15) as rend_prom,
              STDDEV(rendimiento_real::float) FILTER (WHERE rendimiento_real::float > 0 AND rendimiento_real::float < 15) as rend_desv
            FROM viajes_aprendizaje WHERE corredor_id = $1
          `, [corredorMatch.id]);
          const stats = statsR.rows[0];
          await pool.query(`
            UPDATE corredores SET total_viajes_base = $1, rendimiento_promedio = $2,
              rendimiento_desviacion = $3, actualizado_at = NOW()
            WHERE id = $4
          `, [stats.total || 0, stats.rend_prom || null, stats.rend_desv || null, corredorMatch.id]);
        } else {
          const nombreO = geocodearLugar(parseFloat(viaje.origen_lat), parseFloat(viaje.origen_lng));
          const nombreD = geocodearLugar(parseFloat(viaje.destino_lat), parseFloat(viaje.destino_lng));
          const nombre = (nombreO === nombreD)
            ? `${nombreO} → [circular]`
            : `${nombreO} → ${nombreD}`;

          const insertR = await pool.query(`
            INSERT INTO corredores (nombre, contrato, origen_nombre, destino_nombre,
              origen_lat, origen_lng, destino_lat, destino_lng,
              radio_tolerancia_km, total_viajes_base, activo, actualizado_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, true, NOW())
            RETURNING id
          `, [nombre, viaje.contrato || '', nombreO, nombreD,
              viaje.origen_lat, viaje.origen_lng, viaje.destino_lat, viaje.destino_lng,
              radioKm]);
          await pool.query(`UPDATE viajes_aprendizaje SET corredor_id = $1 WHERE id = $2`, [insertR.rows[0].id, viaje.id]);
        }
        procesados++;
      }

      const corredoresNuevosR = await pool.query(`SELECT COUNT(*)::int as total FROM corredores`);
      res.json({
        corredores_anteriores: corredoresAntes,
        corredores_nuevos: corredoresNuevosR.rows[0].total,
        viajes_reprocesados: procesados
      });
    } catch (error: any) {
      console.error("[RECALIBRAR] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/sistema/inconsistencias", async (_req: Request, res: Response) => {
    try {
      const items: any[] = [];

      const feedbackR = await pool.query(`SELECT inconsistencia_id FROM aprendizaje_feedback`);
      const yaResueltos = new Set(feedbackR.rows.map((f: any) => f.inconsistencia_id));

      // Anomalías verificadas: leer desde operaciones_cerradas (pre-calculado)
      try {
        const anomR = await pool.query(`
          SELECT id, patente, conductor, contrato,
            carga_a_litros, litros_consumidos_ecu, km_ecu, horas_periodo,
            balance_pct, balance_litros, snap_count, nivel_anomalia,
            carga_a_fecha
          FROM operaciones_cerradas
          WHERE nivel_anomalia IN ('CRITICO', 'SOSPECHOSO')
            AND revisado = false
            AND creado_at >= NOW() - INTERVAL '14 days'
          ORDER BY balance_pct DESC
          LIMIT 20
        `);

        for (const row of anomR.rows) {
          const itemId = `balance_${row.patente}_${row.id}`;
          if (yaResueltos.has(itemId)) continue;

          items.push({
            id: itemId,
            tipo: "BALANCE_ANOMALO",
            nivel: row.nivel_anomalia === "CRITICO" ? "CRITICO" : "SOSPECHOSO",
            titulo: `${row.patente} cargo ${Math.round(row.carga_a_litros || 0)}L`,
            descripcion: `ECU registra ${Math.round(row.litros_consumidos_ecu || 0)}L consumidos en ${Math.round(row.km_ecu || 0)}km (${Math.round(row.horas_periodo || 0)}h). Exceso: +${Math.round(row.balance_pct || 0)}%`,
            contrato: row.contrato || null,
            valor: Math.round(row.balance_pct || 0),
            km_ecu: row.km_ecu,
            snap_count: row.snap_count,
            acciones: ["INVESTIGAR", "FALSA_ALARMA"],
          });
        }
      } catch (e: any) {
        console.error("[INCONSISTENCIAS] Error leyendo operaciones_cerradas:", e.message);
      }

      const sinNombreR = await pool.query(`
        SELECT id, nombre, origen_nombre, destino_nombre, total_viajes_base
        FROM corredores WHERE activo = true AND (nombre IS NULL OR nombre = '' OR nombre LIKE '%null%')
      `);
      for (const row of sinNombreR.rows) {
        const itemId = `nombre_${row.id}`;
        if (yaResueltos.has(itemId)) continue;
        items.push({
          id: itemId,
          tipo: "CORREDOR_SIN_NOMBRE",
          nivel: "REVISAR",
          titulo: `Corredor #${row.id} sin nombre legible`,
          descripcion: `Origen: ${row.origen_nombre || '?'}, Destino: ${row.destino_nombre || '?'}. ${row.total_viajes_base} viajes.`,
          contrato: null,
          valor: row.total_viajes_base,
          acciones: ["ASIGNAR_NOMBRE", "IGNORAR"],
        });
      }

      const alertasNoGestionadasR = await pool.query(`
        SELECT id, entidad_nombre, descripcion, tipo, contrato, diferencia_pct
        FROM alertas_aprendizaje WHERE gestionado = false ORDER BY fecha DESC LIMIT 20
      `);
      for (const row of alertasNoGestionadasR.rows) {
        const diffPct = parseFloat(row.diferencia_pct || "0");
        const nivel = Math.abs(diffPct) > 40 ? "CRITICO" : Math.abs(diffPct) > 20 ? "SOSPECHOSO" : "INFO";
        items.push({
          id: `alerta_${row.id}`,
          tipo: row.tipo || "ALERTA_PATRON",
          nivel,
          titulo: row.entidad_nombre,
          descripcion: row.descripcion,
          contrato: row.contrato || null,
          valor: diffPct !== 0 ? Math.round(diffPct) : null,
          acciones: ["CONFIRMAR", "FALSA_ALARMA", "ESCALAR"],
        });
      }

      items.sort((a, b) => {
        const order: Record<string, number> = { CRITICO: 0, SOSPECHOSO: 1, REVISAR: 2, INFO: 3 };
        return (order[a.nivel] ?? 9) - (order[b.nivel] ?? 9);
      });

      res.json({
        items,
        total: items.length,
        criticos: items.filter(i => i.nivel === "CRITICO").length,
      });
    } catch (error: any) {
      console.error("[INCONSISTENCIAS] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/sistema/resolver-inconsistencia", async (req: Request, res: Response) => {
    try {
      const { id, tipo, accion, nota, valor_nuevo, contrato } = req.body;
      if (!id || !accion) return res.status(400).json({ message: "id y accion requeridos" });

      await pool.query(`
        INSERT INTO aprendizaje_feedback (inconsistencia_id, tipo, accion, nota, valor_nuevo, contrato, aplicado)
        VALUES ($1, $2, $3, $4, $5, $6, false)
      `, [id, tipo || "INCONSISTENCIA", accion, nota || null, valor_nuevo ? JSON.stringify(valor_nuevo) : null, contrato || null]);

      if (id.startsWith("alerta_")) {
        const alertaId = parseInt(id.replace("alerta_", ""));
        if (!isNaN(alertaId)) {
          await pool.query(`UPDATE alertas_aprendizaje SET gestionado = true, nota = $2 WHERE id = $1`, [alertaId, `[${accion}] ${nota || ''}`]);
        }
      }

      const totalFeedback = await pool.query(`SELECT COUNT(*)::int as total FROM aprendizaje_feedback WHERE aplicado = false`);
      const pendientes = totalFeedback.rows[0]?.total || 0;

      console.log(`[FEEDBACK] Guardado: ${id} -> ${accion}${nota ? ` (${nota})` : ''}. Feedback acumulado sin aplicar: ${pendientes}`);

      res.json({
        ok: true,
        message: `Feedback guardado como aprendizaje. La alerta fue cerrada.`,
        feedback_acumulado: pendientes,
      });
    } catch (error: any) {
      console.error("[RESOLVER-INCONSISTENCIA] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/sistema/feedback-acumulado", async (_req: Request, res: Response) => {
    try {
      const r = await pool.query(`
        SELECT id, inconsistencia_id, tipo, accion, nota, valor_nuevo, contrato, aplicado, creado_en
        FROM aprendizaje_feedback
        ORDER BY creado_en DESC
      `);
      const totalSinAplicar = r.rows.filter((f: any) => !f.aplicado).length;
      res.json({
        items: r.rows,
        total: r.rows.length,
        sin_aplicar: totalSinAplicar,
      });
    } catch (error: any) {
      console.error("[FEEDBACK-ACUMULADO] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/sistema/reporte-semanal", async (_req: Request, res: Response) => {
    try {
      const r = await pool.query(`
        SELECT * FROM reportes_sistema ORDER BY generado_en DESC LIMIT 1
      `);
      if (r.rows.length === 0) return res.json(null);
      const row = r.rows[0];
      res.json({
        semana: row.semana,
        aprendi: row.aprendi,
        corregi: row.corregi,
        preocupa: row.preocupa,
        necesito: row.necesito,
        proximos: row.proximos,
        fecha: row.generado_en,
      });
    } catch (error: any) {
      console.error("[REPORTE-SEMANAL] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/sistema/generar-reporte-semanal", async (_req: Request, res: Response) => {
    try {
      const estado = await getSistemaEstado();

      const corredoresR = await pool.query(`
        SELECT nombre, total_viajes_base, rendimiento_promedio, contrato
        FROM corredores WHERE activo = true
        ORDER BY total_viajes_base DESC LIMIT 10
      `);

      const alertasR = await pool.query(`
        SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE gestionado = false)::int as pendientes
        FROM alertas_aprendizaje
      `);

      const feedbackR = await pool.query(`
        SELECT decision, COUNT(*)::int as n FROM feedback_alertas
        WHERE creado_en > NOW() - INTERVAL '7 days'
        GROUP BY decision
      `);

      const anomaliasR = await pool.query(`
        SELECT COUNT(*)::int as total FROM viajes_aprendizaje
        WHERE estado = 'ANOMALIA' AND creado_at > NOW() - INTERVAL '7 days'
      `);

      const client = getClient();
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 800,
        messages: [{
          role: "user",
          content: `Eres SOTRA IA, el sistema adaptativo de SOTRASER. Genera un reporte semanal con 5 secciones.

DATOS DE ESTA SEMANA:
- Dias activo: ${estado.dias_aprendiendo}
- Viajes procesados total: ${estado.total_viajes_procesados}
- Rutas conocidas: ${estado.total_corredores_conocidos}
- Conductores analizados: ${estado.total_conductores_analizados}
- Confianza global: ${estado.confianza_global}
- Madurez: ${estado.madurez_pct}%
- Alertas totales: ${alertasR.rows[0]?.total || 0} (pendientes: ${alertasR.rows[0]?.pendientes || 0})
- Anomalias esta semana: ${anomaliasR.rows[0]?.total || 0}
- Feedback CEO esta semana: ${feedbackR.rows.map((f: any) => `${f.decision}: ${f.n}`).join(', ') || 'Sin feedback'}

TOP RUTAS:
${corredoresR.rows.map((c: any) => `- ${c.nombre} (${c.contrato}): ${c.total_viajes_base} viajes, ${c.rendimiento_promedio?.toFixed(2) || '?'} km/L`).join('\n')}

Genera EXACTAMENTE este JSON (sin markdown, sin backticks):
{"aprendi":"...","corregi":"...","preocupa":"...","necesito":"...","proximos":"..."}

Cada campo: 2-4 oraciones directas, con numeros concretos. Sin emojis. Habla en primera persona como el sistema.`
        }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "{}";
      let parsed;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
      } catch {
        parsed = { aprendi: text, corregi: null, preocupa: null, necesito: null, proximos: null };
      }

      const now = new Date();
      const weekNum = Math.ceil(((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000 + new Date(now.getFullYear(), 0, 1).getDay() + 1) / 7);
      const semana = `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;

      await pool.query(`DELETE FROM reportes_sistema WHERE semana = $1`, [semana]);
      await pool.query(`
        INSERT INTO reportes_sistema (semana, aprendi, corregi, preocupa, necesito, proximos)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [semana, parsed.aprendi, parsed.corregi, parsed.preocupa, parsed.necesito, parsed.proximos]);

      res.json({
        semana,
        aprendi: parsed.aprendi,
        corregi: parsed.corregi,
        preocupa: parsed.preocupa,
        necesito: parsed.necesito,
        proximos: parsed.proximos,
        fecha: now,
      });
    } catch (error: any) {
      console.error("[GENERAR-REPORTE] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  // ── Detalle de alerta de velocidad ──
  app.get("/api/alertas/detalle-velocidad/:patente", async (req: Request, res: Response) => {
    try {
      const { patente } = req.params;
      const hoyStr = new Date().toISOString().split("T")[0];

      // Puntos GPS con exceso hoy
      const puntosR = await pool.query(`
        SELECT gp.lat::float as lat, gp.lng::float as lng,
          gp.velocidad_kmh::float as velocidad,
          gp.timestamp_punto,
          (SELECT gb.nombre FROM geo_bases gb
           WHERE gb.activa = true
           AND (6371 * acos(LEAST(1.0,
             cos(radians(gp.lat::float)) * cos(radians(gb.lat::float)) *
             cos(radians(gb.lng::float) - radians(gp.lng::float)) +
             sin(radians(gp.lat::float)) * sin(radians(gb.lat::float))
           ))) < 5
           ORDER BY (6371 * acos(LEAST(1.0,
             cos(radians(gp.lat::float)) * cos(radians(gb.lat::float)) *
             cos(radians(gb.lng::float) - radians(gp.lng::float)) +
             sin(radians(gp.lat::float)) * sin(radians(gb.lat::float))
           ))) ASC LIMIT 1
          ) as lugar_cercano
        FROM geo_puntos gp
        WHERE gp.patente = $1
          AND gp.timestamp_punto >= $2::date
          AND gp.timestamp_punto < ($2::date + interval '1 day')
          AND gp.velocidad_kmh > 105
        ORDER BY gp.velocidad_kmh DESC
        LIMIT 20
      `, [patente, hoyStr]);

      const maxPunto = puntosR.rows[0];

      // Conductor
      const condR = await pool.query(`
        SELECT conductor FROM cargas WHERE patente = $1 AND conductor IS NOT NULL ORDER BY fecha DESC LIMIT 1
      `, [patente]);

      // Contrato
      const contR = await pool.query(`
        SELECT f.nombre FROM camiones c JOIN faenas f ON c.faena_id = f.id WHERE c.patente = $1 LIMIT 1
      `, [patente]);

      const lugar = maxPunto?.lugar_cercano || (maxPunto ? `Ruta · ${maxPunto.lat.toFixed(3)}, ${maxPunto.lng.toFixed(3)}` : "Desconocido");

      const timeline = puntosR.rows.map((p: any) => ({
        hora: new Date(p.timestamp_punto).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }),
        velocidad: Math.round(p.velocidad),
        lat: p.lat,
        lng: p.lng,
        lugar: p.lugar_cercano || null,
      }));

      res.json({
        patente,
        conductor: condR.rows[0]?.conductor || "Sin asignar",
        contrato: contR.rows[0]?.nombre || null,
        velocidad_maxima: maxPunto ? Math.round(maxPunto.velocidad) : 0,
        limite: 105,
        exceso_kmh: maxPunto ? Math.round(maxPunto.velocidad - 105) : 0,
        lugar_descripcion: lugar,
        lat: maxPunto?.lat,
        lng: maxPunto?.lng,
        hora_exceso: maxPunto ? new Date(maxPunto.timestamp_punto).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : null,
        puntos_exceso: timeline.length,
        timeline,
      });
    } catch (error: any) {
      console.error("[DETALLE-VEL] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  // ── Historial velocidad camión últimos N días ──
  app.get("/api/alertas/historial-velocidad/:patente", async (req: Request, res: Response) => {
    try {
      const { patente } = req.params;
      const dias = parseInt(req.query.dias as string || "7");
      const desde = new Date();
      desde.setDate(desde.getDate() - dias);

      const excesosR = await pool.query(`
        SELECT DATE(timestamp_punto) as fecha,
          MAX(velocidad_kmh::float) as velocidad_max,
          COUNT(*) as puntos_exceso
        FROM geo_puntos
        WHERE patente = $1 AND velocidad_kmh > 105 AND timestamp_punto >= $2
        GROUP BY DATE(timestamp_punto)
        ORDER BY fecha DESC
      `, [patente, desde]);

      const totalR = await pool.query(`
        SELECT COUNT(*) as total FROM geo_puntos
        WHERE patente = $1 AND timestamp_punto >= $2
      `, [patente, desde]);

      const totalPuntos = parseInt(totalR.rows[0]?.total || "0");
      const totalExcesos = excesosR.rows.reduce((s: number, e: any) => s + parseInt(e.puntos_exceso), 0);

      res.json({
        patente,
        dias_analizados: dias,
        total_excesos: totalExcesos,
        dias_con_exceso: excesosR.rows.length,
        velocidad_max_periodo: excesosR.rows.length > 0 ? Math.round(Math.max(...excesosR.rows.map((e: any) => parseFloat(e.velocidad_max)))) : 0,
        pct_tiempo_sobre_limite: totalPuntos > 0 ? Math.round(totalExcesos / totalPuntos * 100) : 0,
        historial: excesosR.rows.map((e: any) => ({
          fecha: e.fecha,
          velocidad_max: Math.round(parseFloat(e.velocidad_max)),
          puntos_exceso: parseInt(e.puntos_exceso),
        })),
      });
    } catch (error: any) {
      console.error("[HIST-VEL] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  // ── Ubicación de alerta (para mini mapa)
  app.get("/api/control/ubicacion-alerta", async (req: Request, res: Response) => {
    try {
      const { patente, tipo } = req.query;
      if (!patente) return res.status(400).json({ error: "patente required" });

      if (tipo === "VELOCIDAD") {
        const r = await pool.query(`
          SELECT patente, lat, lng, velocidad, timestamp_gps::text as hora, contrato, conductor
          FROM gps_unificado WHERE patente = $1 AND velocidad > 105 AND timestamp_gps >= NOW() - INTERVAL '48 hours'
          ORDER BY velocidad DESC LIMIT 1
        `, [patente]);
        if (r.rows.length === 0) return res.json({ sin_datos: true });
        return res.json(r.rows[0]);
      }

      if (tipo === "RUTA" || tipo === "RUTA_ANOMALA") {
        const r = await pool.query(`
          SELECT lat, lng FROM gps_unificado
          WHERE patente = $1 AND timestamp_gps >= CURRENT_DATE
          ORDER BY timestamp_gps ASC LIMIT 200
        `, [patente]);
        const pts = r.rows;
        const lat = pts.length ? pts.reduce((s: number, p: any) => s + p.lat, 0) / pts.length : -33.45;
        const lng = pts.length ? pts.reduce((s: number, p: any) => s + p.lng, 0) / pts.length : -70.65;
        return res.json({ lat, lng, puntos_ruta: pts });
      }

      // Default: last known position
      const r = await pool.query(`
        SELECT lat, lng, velocidad, timestamp_gps::text as hora FROM gps_unificado
        WHERE patente = $1 ORDER BY timestamp_gps DESC LIMIT 1
      `, [patente]);
      res.json(r.rows[0] || { sin_datos: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  console.log("[cerebro] Cerebro routes registered");
}
