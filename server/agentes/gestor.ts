import { pool } from "../db";
import { enviarMensaje } from "./index";

export const agenteGestor = {
  id: "agente-gestor",
  async ejecutar() {
    try {
      // Alertas sin gestionar >2h
      const alertas = await pool.query(`
        SELECT id, tipo, contrato, EXTRACT(EPOCH FROM (NOW() - fecha))/3600 as horas
        FROM alertas_aprendizaje WHERE gestionado = false AND fecha >= NOW() - INTERVAL '24 hours'
        ORDER BY fecha ASC LIMIT 20
      `);

      let escaladas = 0, autogestionadas = 0;
      for (const a of alertas.rows) {
        const horas = parseFloat(a.horas);
        if (horas > 8 && a.tipo !== "VELOCIDAD" && a.tipo !== "COMBUSTIBLE_FRAUDE") {
          await pool.query("UPDATE alertas_aprendizaje SET gestionado = true, decision = 'AUTO_GESTIONADO' WHERE id = $1", [a.id]);
          autogestionadas++;
        } else if (horas > 2 && (a.tipo === "VELOCIDAD" || a.tipo === "COMBUSTIBLE_FRAUDE")) {
          await enviarMensaje({ de: "agente-gestor", para: "agente-ceo", tipo: "ALERTA", prioridad: "ALTA", titulo: `Alerta ${a.tipo} sin gestionar (${Math.round(horas)}h)`, contenido: `Contrato: ${a.contrato}. Requiere atención.`, datos: a });
          escaladas++;
        }
      }

      await pool.query("UPDATE agente_estado_sistema SET alertas_gestionadas_hoy = alertas_gestionadas_hoy + $1 WHERE id = 1", [autogestionadas]);
      await pool.query("UPDATE agentes SET ultimo_ciclo = NOW(), ciclos_completados = ciclos_completados + 1 WHERE id = $1", ["agente-gestor"]);
      console.log(`[GESTOR] ${escaladas} escaladas, ${autogestionadas} auto`);
    } catch (e: any) { console.error("[GESTOR] Error:", e.message); }
  }
};
