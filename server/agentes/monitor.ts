import { pool } from "../db";
import { enviarMensaje } from "./index";

export const agenteMonitor = {
  id: "agente-monitor",
  async ejecutar() {
    try {
      const hallazgos: any[] = [];

      // Excesos velocidad última hora
      const vel = await pool.query(`SELECT patente, ROUND(MAX(velocidad)::numeric) as vel_max, COUNT(*)::int as n FROM gps_unificado WHERE velocidad > 105 AND timestamp_gps >= NOW() - INTERVAL '1 hour' GROUP BY patente ORDER BY vel_max DESC LIMIT 5`);
      if (vel.rows.length > 0) hallazgos.push({ tipo: "EXCESO_VELOCIDAD", severidad: "CRITICA", datos: vel.rows, mensaje: `${vel.rows.length} camiones con exceso de velocidad` });

      // Rendimiento bajo hoy
      const rend = await pool.query(`SELECT c.patente, va.contrato, ROUND(AVG(va.rendimiento_real)::numeric, 2) as rend FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id WHERE DATE(va.fecha_inicio) = CURRENT_DATE AND va.rendimiento_real > 0 AND va.rendimiento_real < 2.0 AND va.km_ecu > 50 GROUP BY c.patente, va.contrato LIMIT 5`);
      if (rend.rows.length > 0) hallazgos.push({ tipo: "RENDIMIENTO_CRITICO", severidad: "ALTA", datos: rend.rows, mensaje: `${rend.rows.length} camiones con rendimiento crítico` });

      // Camiones sin GPS >2h
      const sinGps = await pool.query(`SELECT COUNT(*)::int as n FROM ultima_posicion_camion WHERE minutos_desde_ultimo > 120`);
      if (parseInt(sinGps.rows[0].n) > 50) hallazgos.push({ tipo: "GPS_MASIVO", severidad: "ALTA", datos: { sin_gps: sinGps.rows[0].n }, mensaje: `${sinGps.rows[0].n} camiones sin GPS >2h` });

      for (const h of hallazgos) {
        await enviarMensaje({ de: "agente-monitor", para: "agente-analista", tipo: "ALERTA", prioridad: h.severidad === "CRITICA" ? "CRITICA" : "ALTA", titulo: h.mensaje, contenido: JSON.stringify(h.datos).slice(0, 500), datos: h });
      }

      await pool.query("UPDATE agentes SET ultimo_ciclo = NOW(), ciclos_completados = ciclos_completados + 1, errores_consecutivos = 0 WHERE id = $1", ["agente-monitor"]);
      console.log(`[MONITOR] ${hallazgos.length} hallazgos`);
    } catch (e: any) {
      console.error("[MONITOR] Error:", e.message);
      await pool.query("UPDATE agentes SET errores_consecutivos = errores_consecutivos + 1 WHERE id = $1", ["agente-monitor"]);
    }
  }
};
