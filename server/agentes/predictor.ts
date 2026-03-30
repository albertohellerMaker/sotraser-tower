import { pool } from "../db";
import { enviarMensaje } from "./index";

export const agentePredictor = {
  id: "agente-predictor",
  async ejecutar() {
    try {
      const predicciones: any[] = [];

      // Tendencia negativa de rendimiento
      const tend = await pool.query(`
        SELECT c.patente, va.contrato,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.fecha_inicio >= NOW() - INTERVAL '3 days')::numeric, 2) as rend_reciente,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.fecha_inicio < NOW() - INTERVAL '3 days' AND va.fecha_inicio >= NOW() - INTERVAL '7 days')::numeric, 2) as rend_anterior
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.fecha_inicio >= NOW() - INTERVAL '7 days' AND va.rendimiento_real > 0 AND va.rendimiento_real < 10 AND va.km_ecu > 50
        GROUP BY c.patente, va.contrato
        HAVING AVG(va.rendimiento_real) FILTER (WHERE va.fecha_inicio >= NOW() - INTERVAL '3 days') < AVG(va.rendimiento_real) FILTER (WHERE va.fecha_inicio < NOW() - INTERVAL '3 days' AND va.fecha_inicio >= NOW() - INTERVAL '7 days') * 0.85
        ORDER BY rend_reciente ASC LIMIT 5
      `);

      if (tend.rows.length > 0) {
        predicciones.push({ tipo: "TENDENCIA_NEGATIVA", titulo: `${tend.rows.length} camiones con rendimiento deteriorándose >15%`, datos: tend.rows, confianza: 0.8 });
      }

      // Proyección km fin de mes
      const hoy = new Date();
      const diasRestantes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate() - hoy.getDate();
      const proy = await pool.query(`
        SELECT va.contrato, ROUND(SUM(va.km_ecu)::numeric) as km_actual,
          ROUND((SUM(va.km_ecu) / GREATEST(EXTRACT(DAY FROM NOW() - DATE_TRUNC('month', NOW())), 1) * ${diasRestantes} + SUM(va.km_ecu))::numeric) as km_proyectado
        FROM viajes_aprendizaje va WHERE va.fecha_inicio >= DATE_TRUNC('month', NOW()) AND va.km_ecu > 0
        GROUP BY va.contrato ORDER BY km_actual DESC LIMIT 5
      `);

      if (proy.rows.length > 0) {
        predicciones.push({ tipo: "PROYECCION_MES", titulo: "Proyección km fin de mes por contrato", datos: proy.rows, confianza: 0.7 });
      }

      for (const p of predicciones) {
        await enviarMensaje({ de: "agente-predictor", para: "agente-gerente-general", tipo: "PREDICCION", prioridad: "NORMAL", titulo: p.titulo, contenido: JSON.stringify(p.datos).slice(0, 500), datos: p });
      }

      await pool.query("UPDATE agentes SET ultimo_ciclo = NOW(), ciclos_completados = ciclos_completados + 1 WHERE id = $1", ["agente-predictor"]);
      console.log(`[PREDICTOR] ${predicciones.length} predicciones`);
    } catch (e: any) { console.error("[PREDICTOR] Error:", e.message); }
  }
};
