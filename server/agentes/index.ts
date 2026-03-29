import { pool } from "../db";
import { agenteMonitor } from "./monitor";
import { agenteAnalista } from "./analista";
import { agentePredictor } from "./predictor";
import { agenteReportero } from "./reportero";
import { agenteGestor } from "./gestor";
import { agenteCEO } from "./ceo";
import { agenteGerenteOps } from "./gerente-ops";

export async function enviarMensaje({ de, para, tipo, prioridad = "NORMAL", titulo, contenido, datos = {} }: { de: string; para: string; tipo: string; prioridad?: string; titulo: string; contenido: string; datos?: any }) {
  await pool.query(`INSERT INTO agente_mensajes (de_agente, para_agente, tipo, prioridad, titulo, contenido, datos) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [de, para, tipo, prioridad, titulo, contenido, JSON.stringify(datos)]);
}

export async function iniciarAgentes() {
  console.log("[AGENTES] Sistema multi-agente iniciando...");

  // Ciclo principal cada 15 min
  setInterval(async () => {
    try {
      await agenteMonitor.ejecutar();
      await agenteGestor.ejecutar();
      await agenteAnalista.ejecutar();
      await agentePredictor.ejecutar();
      await agenteCEO.ejecutar();
      await pool.query("UPDATE agente_estado_sistema SET ultimo_ciclo_monitor = NOW(), updated_at = NOW() WHERE id = 1");
    } catch (e: any) { console.error("[AGENTES] Error ciclo:", e.message); }
  }, 15 * 60 * 1000);

  // Gerente de Ops cada hora
  setInterval(async () => {
    try { await agenteGerenteOps.ejecutar(); } catch (e: any) { console.error("[GERENTE-OPS] Error:", e.message); }
  }, 60 * 60 * 1000);

  // Primer ciclo en 10s
  setTimeout(async () => {
    try { await agenteMonitor.ejecutar(); await agenteGestor.ejecutar(); await agenteCEO.ejecutar(); await agenteGerenteOps.ejecutar(); } catch (e: any) { console.error("[AGENTES] Error primer ciclo:", e.message); }
  }, 10000);

  console.log("[AGENTES] Sistema iniciado");
}
