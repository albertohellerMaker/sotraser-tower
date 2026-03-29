import { Router } from "express";
import { pool } from "./db";

const router = Router();

router.get("/stats", async (_req, res) => {
  try {
    const [flota, alertas, agentes, rend] = await Promise.all([
      pool.query("SELECT COUNT(DISTINCT patente)::int as activos FROM ultima_posicion_camion WHERE minutos_desde_ultimo < 120"),
      pool.query("SELECT COUNT(*)::int as total FROM agente_mensajes WHERE leido = false AND created_at >= NOW() - INTERVAL '24 hours'"),
      pool.query("SELECT COUNT(*)::int as activos FROM agentes WHERE ultimo_ciclo >= NOW() - INTERVAL '30 minutes' AND estado = 'ACTIVO'"),
      pool.query("SELECT ROUND(AVG(rendimiento_real) FILTER (WHERE rendimiento_real > 0 AND rendimiento_real < 10)::numeric, 2) as rend FROM viajes_aprendizaje WHERE DATE(fecha_inicio) = CURRENT_DATE AND km_ecu > 0"),
    ]);
    res.json({ activos: flota.rows[0]?.activos || 0, alertas: alertas.rows[0]?.total || 0, agentes_ok: agentes.rows[0]?.activos || 0, rend_hoy: parseFloat(rend.rows[0]?.rend || 0) });
  } catch (e: any) { res.json({ activos: 0, alertas: 0, agentes_ok: 0, rend_hoy: 0 }); }
});

export default router;
