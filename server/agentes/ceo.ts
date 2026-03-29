import { pool } from "../db";

export const agenteCEO = {
  id: "agente-ceo",
  async ejecutar() {
    try {
      const msgs = await pool.query(`SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE prioridad = 'CRITICA')::int as criticos, COUNT(*) FILTER (WHERE prioridad = 'ALTA')::int as altos FROM agente_mensajes WHERE para_agente = 'agente-ceo' AND leido = false AND created_at >= NOW() - INTERVAL '24 hours'`);
      const m = msgs.rows[0];
      if (parseInt(m.criticos) > 0) console.log(`[CEO] ⚠️ ${m.criticos} mensajes críticos, ${m.altos} altos, ${m.total} total`);
      await pool.query("UPDATE agentes SET ultimo_ciclo = NOW(), ciclos_completados = ciclos_completados + 1 WHERE id = $1", ["agente-ceo"]);
    } catch (e: any) { console.error("[CEO] Error:", e.message); }
  }
};
