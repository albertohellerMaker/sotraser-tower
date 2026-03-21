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
- Snapshots Volvo: ${estado.total_snapshots_volvo}
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
      const idNum = parseInt(id);
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
      const ahora = new Date();
      const hace2h = new Date(ahora.getTime() - 2 * 60 * 60 * 1000);
      const hoyStr = ahora.toISOString().split("T")[0];

      const totalResult = await pool.query(`
        SELECT COUNT(*)::int as total FROM camiones WHERE vin IS NOT NULL
      `);
      const totalCamiones = totalResult.rows[0]?.total || 0;

      const activosResult = await pool.query(`
        SELECT COUNT(DISTINCT g.patente)::int as activos
        FROM geo_puntos g
        JOIN camiones c ON g.camion_id = c.id
        WHERE g.timestamp_punto >= $1
      `, [hace2h]);
      const camionesActivos = activosResult.rows[0]?.activos || 0;

      const kmResult = await pool.query(`
        SELECT c.patente,
          MAX(g.km_odometro) - MIN(g.km_odometro) as km_hoy
        FROM geo_puntos g
        JOIN camiones c ON g.camion_id = c.id
        WHERE g.timestamp_punto >= $1::date AND g.timestamp_punto < ($1::date + interval '1 day')
          AND g.km_odometro > 0
        GROUP BY c.patente
        HAVING MAX(g.km_odometro) - MIN(g.km_odometro) > 0
      `, [hoyStr]);
      const kmHoy = Math.round(kmResult.rows.reduce((s: number, r: any) => s + parseFloat(r.km_hoy || 0), 0));

      const rendResult = await pool.query(`
        SELECT AVG(
          CASE WHEN km_delta > 0 AND litros_delta > 0 THEN km_delta / litros_delta END
        )::numeric(6,2) as rend_prom
        FROM (
          SELECT v.vin,
            (MAX(v.total_distance) - MIN(v.total_distance)) / 1000.0 as km_delta,
            (MAX(v.total_fuel_used) - MIN(v.total_fuel_used)) / 1000.0 as litros_delta
          FROM volvo_fuel_snapshots v
          WHERE v.captured_at::timestamp >= $1::date AND v.captured_at::timestamp < ($1::date + interval '1 day')
          GROUP BY v.vin
          HAVING MAX(v.total_distance) > MIN(v.total_distance)
            AND MAX(v.total_fuel_used) > MIN(v.total_fuel_used)
        ) sub
      `, [hoyStr]);
      const rendimientoPromedio = rendResult.rows[0]?.rend_prom ? parseFloat(rendResult.rows[0].rend_prom) : null;

      const sinGpsResult = await pool.query(`
        SELECT COUNT(DISTINCT c.patente)::int as sin_gps
        FROM camiones c
        WHERE c.vin IS NOT NULL
          AND c.patente NOT IN (
            SELECT DISTINCT g2.patente FROM geo_puntos g2
            WHERE g2.timestamp_punto >= $1
          )
      `, [hace2h]);
      const sinGps = sinGpsResult.rows[0]?.sin_gps || 0;

      const velResult = await pool.query(`
        SELECT COUNT(DISTINCT g.patente)::int as excesos
        FROM geo_puntos g
        WHERE g.timestamp_punto >= $1::date AND g.timestamp_punto < ($1::date + interval '1 day')
          AND g.velocidad_kmh > 120
      `, [hoyStr]);
      const excesosVelocidad = velResult.rows[0]?.excesos || 0;

      const alertasCriticas = sinGps + excesosVelocidad;
      const semaforo = alertasCriticas === 0 ? "NORMAL" : alertasCriticas <= 3 ? "ATENCION" : "ALERTA";

      const porContratoResult = await pool.query(`
        SELECT f.nombre as contrato,
          COUNT(DISTINCT c.id)::int as total_camiones,
          COUNT(DISTINCT CASE WHEN g.patente IS NOT NULL THEN c.patente END)::int as activos
        FROM camiones c
        JOIN faenas f ON c.faena_id = f.id
        LEFT JOIN (
          SELECT DISTINCT patente FROM geo_puntos WHERE timestamp_punto >= $1
        ) g ON c.patente = g.patente
        WHERE c.vin IS NOT NULL
        GROUP BY f.nombre
        ORDER BY total_camiones DESC
      `, [hace2h]);

      const porContrato = [];
      for (const row of porContratoResult.rows) {
        const cKm = await pool.query(`
          SELECT SUM(km_d)::int as km
          FROM (
            SELECT MAX(g.km_odometro) - MIN(g.km_odometro) as km_d
            FROM geo_puntos g
            JOIN camiones c ON g.camion_id = c.id
            JOIN faenas f ON c.faena_id = f.id
            WHERE f.nombre = $1
              AND g.timestamp_punto >= $2::date AND g.timestamp_punto < ($2::date + interval '1 day')
              AND g.km_odometro > 0
            GROUP BY c.patente
            HAVING MAX(g.km_odometro) - MIN(g.km_odometro) > 0
          ) sub
        `, [row.contrato, hoyStr]);

        const cRend = await pool.query(`
          SELECT AVG(
            CASE WHEN km_delta > 0 AND litros_delta > 0 THEN km_delta / litros_delta END
          )::numeric(6,2) as rend
          FROM (
            SELECT v.vin,
              (MAX(v.total_distance) - MIN(v.total_distance)) / 1000.0 as km_delta,
              (MAX(v.total_fuel_used) - MIN(v.total_fuel_used)) / 1000.0 as litros_delta
            FROM volvo_fuel_snapshots v
            JOIN camiones c ON v.vin = c.vin
            JOIN faenas f ON c.faena_id = f.id
            WHERE f.nombre = $1
              AND v.captured_at::timestamp >= $2::date AND v.captured_at::timestamp < ($2::date + interval '1 day')
            GROUP BY v.vin
            HAVING MAX(v.total_distance) > MIN(v.total_distance)
              AND MAX(v.total_fuel_used) > MIN(v.total_fuel_used)
          ) sub
        `, [row.contrato, hoyStr]);

        const cAlertas = await pool.query(`
          SELECT COUNT(DISTINCT g.patente)::int as alertas
          FROM geo_puntos g
          JOIN camiones c ON g.camion_id = c.id
          JOIN faenas f ON c.faena_id = f.id
          WHERE f.nombre = $1
            AND g.timestamp_punto >= $2::date AND g.timestamp_punto < ($2::date + interval '1 day')
            AND g.velocidad_kmh > 120
        `, [row.contrato, hoyStr]);

        porContrato.push({
          contrato: row.contrato,
          total_camiones: row.total_camiones,
          activos: row.activos,
          km_hoy: cKm.rows[0]?.km || 0,
          rendimiento: cRend.rows[0]?.rend ? parseFloat(cRend.rows[0].rend) : null,
          alertas: cAlertas.rows[0]?.alertas || 0,
        });
      }

      res.json({
        camiones_activos: camionesActivos,
        total_camiones: totalCamiones,
        km_hoy: kmHoy,
        rendimiento_promedio: rendimientoPromedio,
        alertas_criticas: alertasCriticas,
        sin_gps: sinGps,
        excesos_velocidad: excesosVelocidad,
        semaforo,
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
          AND g.velocidad_kmh > 120
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
        WHERE c.vin IS NOT NULL
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
        SELECT c.patente, f.nombre as contrato,
          (MAX(v.total_distance) - MIN(v.total_distance)) / 1000.0 as km_delta,
          (MAX(v.total_fuel_used) - MIN(v.total_fuel_used)) / 1000.0 as litros_delta
        FROM volvo_fuel_snapshots v
        JOIN camiones c ON v.vin = c.vin
        JOIN faenas f ON c.faena_id = f.id
        WHERE v.captured_at::timestamp >= $1::date AND v.captured_at::timestamp < ($1::date + interval '1 day')
        GROUP BY c.patente, f.nombre
        HAVING MAX(v.total_distance) > MIN(v.total_distance)
          AND MAX(v.total_fuel_used) > MIN(v.total_fuel_used)
          AND (MAX(v.total_distance) - MIN(v.total_distance)) / NULLIF(MAX(v.total_fuel_used) - MIN(v.total_fuel_used), 0) < 1.5
        ORDER BY (MAX(v.total_distance) - MIN(v.total_distance)) / NULLIF(MAX(v.total_fuel_used) - MIN(v.total_fuel_used), 0)
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

      res.json(alertas.slice(0, 10));
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
        if (cam.vin) {
          const rendRes = await pool.query(`
            SELECT
              (MAX(total_distance) - MIN(total_distance)) / 1000.0 as km_d,
              (MAX(total_fuel_used) - MIN(total_fuel_used)) / 1000.0 as l_d
            FROM volvo_fuel_snapshots
            WHERE vin = $1
              AND captured_at::timestamp >= $2::date AND captured_at::timestamp < ($2::date + interval '1 day')
          `, [cam.vin, hoyStr]);
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
      console.log(`[FEEDBACK] ${decision} para ${alertaTipo} ${entidadId} (${contrato || "sin contrato"})`);
      res.json({ ok: true });
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

      const balanceR = await pool.query(`
        SELECT cp.patente, cp.contrato, cp.rendimiento_promedio, cp.total_jornadas,
               c.id as camion_id
        FROM camiones_perfil cp
        JOIN camiones c ON c.patente = cp.patente
        WHERE cp.rendimiento_promedio IS NOT NULL AND cp.total_jornadas >= 5
      `);

      for (const row of balanceR.rows) {
        const rend = parseFloat(row.rendimiento_promedio);
        if (isNaN(rend)) continue;
        const contratoAvgR = await pool.query(`
          SELECT AVG(rendimiento_promedio::float) as avg_rend FROM camiones_perfil
          WHERE contrato = $1 AND rendimiento_promedio IS NOT NULL AND total_jornadas >= 5
        `, [row.contrato]);
        const avg = parseFloat(contratoAvgR.rows[0]?.avg_rend || "0");
        if (avg <= 0) continue;
        const desv = ((rend - avg) / avg) * 100;
        if (Math.abs(desv) > 25) {
          const itemId = `balance_${row.patente}`;
          if (yaResueltos.has(itemId)) continue;
          items.push({
            id: itemId,
            tipo: "BALANCE_ANOMALO",
            nivel: Math.abs(desv) > 40 ? "CRITICO" : "SOSPECHOSO",
            titulo: `${row.patente} rinde ${rend.toFixed(2)} km/L`,
            descripcion: `Promedio del contrato ${row.contrato}: ${avg.toFixed(2)} km/L. Desviacion: ${desv > 0 ? '+' : ''}${desv.toFixed(1)}%`,
            contrato: row.contrato,
            valor: Math.round(desv),
            acciones: desv < -25 ? ["INVESTIGAR", "FALSA_ALARMA"] : ["CONFIRMAR_NORMAL", "FALSA_ALARMA"],
          });
        }
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

  console.log("[cerebro] Cerebro routes registered");
}
