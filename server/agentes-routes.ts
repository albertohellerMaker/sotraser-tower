import { Router } from "express";
import { pool } from "./db";

const router = Router();

router.get("/estado", async (_req, res) => {
  try {
    const [agentes, sistema, msgs] = await Promise.all([
      pool.query("SELECT id, nombre, tipo, estado, ultimo_ciclo::text, ciclos_completados, errores_consecutivos FROM agentes ORDER BY CASE tipo WHEN 'CEO' THEN 1 WHEN 'MONITOR' THEN 2 WHEN 'ANALISTA' THEN 3 WHEN 'PREDICTOR' THEN 4 WHEN 'GESTOR' THEN 5 WHEN 'REPORTERO' THEN 6 END"),
      pool.query("SELECT * FROM agente_estado_sistema WHERE id = 1"),
      pool.query("SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE prioridad = 'CRITICA')::int as criticos, COUNT(*) FILTER (WHERE prioridad = 'ALTA')::int as altos FROM agente_mensajes WHERE para_agente = 'agente-ceo' AND leido = false AND created_at >= NOW() - INTERVAL '24 hours'"),
    ]);
    res.json({ agentes: agentes.rows, sistema: sistema.rows[0], mensajes_pendientes: msgs.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/mensajes", async (req, res) => {
  try {
    const limite = parseInt((req.query.limite as string) || "20");
    const noLeidos = req.query.no_leidos === "true";
    const r = await pool.query(`
      SELECT m.*, a.nombre as nombre_agente FROM agente_mensajes m LEFT JOIN agentes a ON a.id = m.de_agente
      WHERE m.para_agente = 'agente-ceo' ${noLeidos ? "AND m.leido = false" : ""} AND m.created_at >= NOW() - INTERVAL '48 hours'
      ORDER BY CASE m.prioridad WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 ELSE 3 END, m.created_at DESC LIMIT $1
    `, [limite]);
    res.json({ mensajes: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/mensajes/:id/leer", async (req, res) => {
  await pool.query("UPDATE agente_mensajes SET leido = true WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

router.post("/mensajes/leer-todos", async (_req, res) => {
  await pool.query("UPDATE agente_mensajes SET leido = true WHERE para_agente = 'agente-ceo' AND leido = false");
  res.json({ ok: true });
});

router.post("/forzar/:agente", async (req, res) => {
  const { agente } = req.params;
  try {
    const mods: Record<string, () => Promise<void>> = {
      monitor: async () => { const { agenteMonitor } = await import("./agentes/monitor"); await agenteMonitor.ejecutar(); },
      analista: async () => { const { agenteAnalista } = await import("./agentes/analista"); await agenteAnalista.ejecutar(); },
      predictor: async () => { const { agentePredictor } = await import("./agentes/predictor"); await agentePredictor.ejecutar(); },
      reportero: async () => { const { agenteReportero } = await import("./agentes/reportero"); await agenteReportero.ejecutar(); },
      gestor: async () => { const { agenteGestor } = await import("./agentes/gestor"); await agenteGestor.ejecutar(); },
      contrato: async () => { const { agenteContrato } = await import("./agentes/contrato"); await agenteContrato.ejecutar(); },
      cencosud: async () => { const { agenteCencosud } = await import("./agentes/cencosud"); await agenteCencosud.ejecutar(); },
    };
    if (mods[agente]) { await mods[agente](); res.json({ ok: true }); }
    else res.status(404).json({ error: "Agente no encontrado" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Chat con el Arquitecto (usa Claude)
router.post("/arquitecto/chat", async (req, res) => {
  const { mensaje } = req.body;
  if (!mensaje) return res.status(400).json({ error: "mensaje requerido" });

  try {
    // Save CEO message
    await pool.query("INSERT INTO arquitecto_chat (rol, mensaje) VALUES ('CEO', $1)", [mensaje]);

    // Get history
    const hist = await pool.query("SELECT rol, mensaje FROM arquitecto_chat ORDER BY created_at DESC LIMIT 10");

    // Get system context
    const [agentes, flota, viajes] = await Promise.all([
      pool.query("SELECT id, nombre, tipo, ultimo_ciclo::text, ciclos_completados FROM agentes"),
      pool.query("SELECT camiones_activos, total_camiones, km_hoy, rendimiento_promedio FROM (SELECT COUNT(DISTINCT patente) FILTER (WHERE minutos_desde_ultimo < 60) as camiones_activos, COUNT(DISTINCT patente) as total_camiones, 0 as km_hoy, 0 as rendimiento_promedio FROM ultima_posicion_camion) sub"),
      pool.query("SELECT COUNT(*)::int as viajes_hoy FROM viajes_aprendizaje WHERE DATE(fecha_inicio) = CURRENT_DATE"),
    ]);

    const ctx = `Flota: ${flota.rows[0]?.camiones_activos || 0} activos de ${flota.rows[0]?.total_camiones || 0}. Viajes hoy: ${viajes.rows[0]?.viajes_hoy || 0}. Agentes: ${agentes.rows.map((a: any) => `${a.nombre}(${a.ciclos_completados} ciclos)`).join(", ")}`;

    // Call Claude
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: `Eres el Agente Arquitecto de Sotraser Tower. Jefe técnico del sistema. Conoces toda la arquitectura: Volvo Connect, WiseTrack GPS, Sigetra, GPS Unificado (581 cam), geocercas inteligentes (5 niveles), sistema multi-agente (7 agentes). Respondes en español, directo y técnico. Max 100 palabras.\n\nCONTEXTO: ${ctx}`,
      messages: [...hist.rows.reverse().map((h: any) => ({ role: h.rol === "CEO" ? "user" as const : "assistant" as const, content: h.mensaje })), { role: "user" as const, content: mensaje }],
    });

    const respuesta = response.content[0].type === "text" ? response.content[0].text : "Sin respuesta";
    await pool.query("INSERT INTO arquitecto_chat (rol, mensaje) VALUES ('ARQUITECTO', $1)", [respuesta]);

    res.json({ respuesta });
  } catch (e: any) {
    console.error("[ARQUITECTO-CHAT]", e.message);
    res.json({ respuesta: "Error conectando con el Arquitecto. Verifica API key." });
  }
});

// Chat history
router.get("/arquitecto/historial", async (_req, res) => {
  const r = await pool.query("SELECT rol, mensaje, created_at::text FROM arquitecto_chat ORDER BY created_at DESC LIMIT 20");
  res.json({ historial: r.rows.reverse() });
});

// ═══ INTELIGENCIA POR CONTRATO ═══
router.get("/contratos-intel", async (req, res) => {
  try {
    const fecha = (req.query.fecha as string) || new Date().toISOString().slice(0, 10);
    const r = await pool.query(`
      SELECT * FROM contrato_inteligencia
      WHERE fecha = $1 ORDER BY km_dia DESC
    `, [fecha]);
    res.json({ fecha, contratos: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/contrato-historial/:contrato", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT fecha::text, viajes_dia, km_dia::float, rend_dia::float, salud, camiones_activos, viajes_criticos
      FROM contrato_inteligencia WHERE contrato = $1 AND fecha >= CURRENT_DATE - 30
      ORDER BY fecha DESC
    `, [req.params.contrato]);
    res.json({ contrato: req.params.contrato, historial: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══ REPORTE COMPLETO (para PDF) ═══
router.get("/reporte", async (req, res) => {
  try {
    const fechaParam = req.query.fecha as string;
    const fecha = fechaParam || new Date(Date.now() - 86400000).toISOString().slice(0, 10); // ayer por defecto

    const [flota, contratos, topCamiones, bottomCamiones, alertas, agentesStatus, salud, geocercas] = await Promise.all([
      pool.query(`SELECT COUNT(DISTINCT c.patente)::int as camiones, COUNT(*)::int as viajes,
        ROUND(SUM(va.km_ecu)::numeric) as km_total,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend_promedio,
        ROUND(SUM(va.litros_consumidos_ecu) FILTER (WHERE va.litros_consumidos_ecu > 0)::numeric) as litros_total,
        COUNT(*) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 2.0)::int as viajes_criticos
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0`, [fecha]),
      pool.query(`SELECT va.contrato, COUNT(DISTINCT c.patente)::int as camiones, COUNT(*)::int as viajes,
        ROUND(SUM(va.km_ecu)::numeric) as km, ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend,
        ROUND(SUM(va.litros_consumidos_ecu) FILTER (WHERE va.litros_consumidos_ecu > 0)::numeric) as litros
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0 GROUP BY va.contrato ORDER BY km DESC`, [fecha]),
      pool.query(`SELECT c.patente, va.contrato, COUNT(*)::int as viajes, ROUND(SUM(va.km_ecu)::numeric) as km,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0 AND va.rendimiento_real > 0
        GROUP BY c.patente, va.contrato HAVING AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10) IS NOT NULL
        ORDER BY rend DESC LIMIT 10`, [fecha]),
      pool.query(`SELECT c.patente, va.contrato, COUNT(*)::int as viajes, ROUND(SUM(va.km_ecu)::numeric) as km,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0 AND va.rendimiento_real > 0 AND va.rendimiento_real < 10
        GROUP BY c.patente, va.contrato HAVING AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10) < 2.5
        ORDER BY rend ASC LIMIT 10`, [fecha]),
      pool.query(`SELECT tipo, COUNT(*)::int as total FROM alertas_aprendizaje WHERE DATE(fecha) = $1 GROUP BY tipo ORDER BY total DESC`, [fecha]),
      pool.query("SELECT id, nombre, estado, ultimo_ciclo::text, ciclos_completados, errores_consecutivos FROM agentes ORDER BY nombre"),
      pool.query("SELECT COUNT(DISTINCT patente) FILTER (WHERE minutos_desde_ultimo < 120)::int as gps_activos, COUNT(DISTINCT patente)::int as gps_total FROM ultima_posicion_camion"),
      pool.query("SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE nivel >= 4)::int as nivel_alto FROM geocercas_operacionales WHERE activa = true"),
    ]);

    res.json({
      fecha,
      flota: flota.rows[0],
      contratos: contratos.rows,
      top_camiones: topCamiones.rows,
      bottom_camiones: bottomCamiones.rows,
      alertas: alertas.rows,
      agentes: agentesStatus.rows,
      gps: salud.rows[0],
      geocercas: geocercas.rows[0],
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
