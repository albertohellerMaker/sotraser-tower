import { pool } from "../db";
import { enviarMensaje } from "./index";

export const agenteReportero = {
  id: "agente-reportero",
  async ejecutar() {
    try {
      const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);
      const fecha = ayer.toISOString().slice(0, 10);

      const [flota, contratos] = await Promise.all([
        pool.query(`SELECT COUNT(DISTINCT c.patente)::int as cam, COUNT(*)::int as viajes, ROUND(SUM(va.km_ecu)::numeric) as km, ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id WHERE DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0`, [fecha]),
        pool.query(`SELECT va.contrato, COUNT(DISTINCT c.patente)::int as cam, ROUND(SUM(va.km_ecu)::numeric) as km, ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id WHERE DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0 GROUP BY va.contrato ORDER BY km DESC`, [fecha]),
      ]);

      const f = flota.rows[0];
      const resumen = `📊 REPORTE ${fecha}\n${f.cam} camiones · ${f.viajes} viajes · ${Math.round(f.km || 0).toLocaleString()}km · ${f.rend || "--"}km/L\n\nPor contrato:\n${contratos.rows.map((c: any) => `${c.contrato}: ${c.cam}cam ${Math.round(c.km || 0).toLocaleString()}km ${c.rend}km/L`).join("\n")}`;

      await enviarMensaje({ de: "agente-reportero", para: "agente-gerente-general", tipo: "REPORTE", prioridad: "NORMAL", titulo: `📊 Reporte Diario ${fecha}`, contenido: resumen, datos: { fecha, flota: f, contratos: contratos.rows } });
      await pool.query("UPDATE agente_estado_sistema SET ultimo_reporte = NOW() WHERE id = 1");
      await pool.query("UPDATE agentes SET ultimo_ciclo = NOW(), ciclos_completados = ciclos_completados + 1 WHERE id = $1", ["agente-reportero"]);
      console.log("[REPORTERO] Reporte generado");
    } catch (e: any) { console.error("[REPORTERO] Error:", e.message); }
  }
};
