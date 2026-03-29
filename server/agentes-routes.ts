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

export default router;
