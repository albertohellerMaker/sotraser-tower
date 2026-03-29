import { pool } from "../db";
import { enviarMensaje } from "./index";

export const agenteAnalista = {
  id: "agente-analista",
  async ejecutar() {
    try {
      const msgs = await pool.query(`SELECT * FROM agente_mensajes WHERE para_agente = 'agente-analista' AND procesado = false AND created_at >= NOW() - INTERVAL '1 hour' ORDER BY CASE prioridad WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 ELSE 3 END, created_at DESC LIMIT 10`);
      if (msgs.rows.length === 0) return;

      for (const msg of msgs.rows) {
        const datos = msg.datos || {};
        // Analisis basado en reglas (sin IA para no gastar tokens cada 15min)
        let analisis = "";
        if (datos.tipo === "EXCESO_VELOCIDAD") {
          const camiones = datos.datos || [];
          analisis = `Excesos de velocidad detectados. ${camiones.length} camiones superaron 105 km/h. Máximo: ${camiones[0]?.vel_max || "?"}km/h (${camiones[0]?.patente || "?"}). Acción: notificar supervisor de ruta y verificar conductor.`;
        } else if (datos.tipo === "RENDIMIENTO_CRITICO") {
          analisis = `Rendimiento bajo crítico en ${(datos.datos || []).length} camiones. Posibles causas: carga excesiva, ruta con pendiente, problema mecánico. Acción: revisar últimas mantenciones y condiciones de ruta.`;
        } else if (datos.tipo === "GPS_MASIVO") {
          analisis = `Pérdida masiva de señal GPS. ${datos.datos?.sin_gps || "?"} camiones sin reporte. Puede ser problema de red o zona sin cobertura. Verificar estado de antenas.`;
        } else {
          analisis = `Hallazgo: ${msg.titulo}. Requiere revisión manual.`;
        }

        await enviarMensaje({ de: "agente-analista", para: "agente-ceo", tipo: "ANALISIS", prioridad: msg.prioridad, titulo: `ANÁLISIS: ${msg.titulo}`, contenido: analisis, datos: { ...datos, analisis, mensaje_original_id: msg.id } });
        await pool.query("UPDATE agente_mensajes SET procesado = true, accion_tomada = $1 WHERE id = $2", [analisis.slice(0, 200), msg.id]);
      }

      await pool.query("UPDATE agentes SET ultimo_ciclo = NOW(), ciclos_completados = ciclos_completados + 1 WHERE id = $1", ["agente-analista"]);
      console.log(`[ANALISTA] ${msgs.rows.length} mensajes analizados`);
    } catch (e: any) { console.error("[ANALISTA] Error:", e.message); }
  }
};
