import { pool } from "../db";

// ═══ NIVEL 1: Detección (cada 15 min) ═══
import { agenteOperaciones } from "./operaciones";
import { agentePredictor } from "./predictor";
import { agenteReportero } from "./reportero";

// ═══ NIVEL 2: Gestión (cada 1 hora) ═══
import { agenteGerenteOps } from "./gerente-ops";
import { agenteContrato } from "./contrato";
import { agenteCencosud } from "./cencosud";

// ═══ NIVEL 3: Dirección (cada 15 min) ═══
import { agenteGerenteGeneral } from "./gerente-general";

// ═══ Legacy (mantenidos por compatibilidad) ═══
import { agenteMonitor } from "./monitor";
import { agenteAnalista } from "./analista";
import { agenteGestor } from "./gestor";
import { agenteCEO } from "./ceo";

export async function enviarMensaje({ de, para, tipo, prioridad = "NORMAL", titulo, contenido, datos = {} }: { de: string; para: string; tipo: string; prioridad?: string; titulo: string; contenido: string; datos?: any }) {
  await pool.query(`INSERT INTO agente_mensajes (de_agente, para_agente, tipo, prioridad, titulo, contenido, datos) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [de, para, tipo, prioridad, titulo, contenido, JSON.stringify(datos)]);
}

export async function iniciarAgentes() {
  console.log("[AGENTES] Sistema multi-agente v2 iniciando...");

  // ── Ciclo rápido: cada 15 min ──
  // Nivel 1 (detectar) → Nivel 3 (decidir)
  setInterval(async () => {
    try {
      await agenteOperaciones.ejecutar();    // Detecta + analiza + actúa
      await agentePredictor.ejecutar();       // Tendencias
      await agenteGerenteGeneral.ejecutar();  // Procesa todo y decide
      await pool.query("UPDATE agente_estado_sistema SET ultimo_ciclo_monitor = NOW(), updated_at = NOW() WHERE id = 1");
    } catch (e: any) { console.error("[AGENTES] Error ciclo rápido:", e.message); }
  }, 15 * 60 * 1000);

  // ── Ciclo profundo: cada 1 hora ──
  // Nivel 2 (gestión especializada)
  setInterval(async () => {
    try {
      await agenteContrato.ejecutar();       // Fichas por contrato
      await agenteCencosud.ejecutar();       // Admin Contrato Cencosud
      await agenteGerenteOps.ejecutar();     // Gerente Ops (memoria, decisiones)
    } catch (e: any) { console.error("[AGENTES] Error ciclo profundo:", e.message); }
  }, 60 * 60 * 1000);

  // ── Primer ciclo: 10s después del boot ──
  setTimeout(async () => {
    try {
      await agenteOperaciones.ejecutar();
      await agenteGerenteGeneral.ejecutar();
      await agenteContrato.ejecutar();
      await agenteCencosud.ejecutar();
      await agenteGerenteOps.ejecutar();
    } catch (e: any) { console.error("[AGENTES] Error primer ciclo:", e.message); }
  }, 10000);

  console.log("[AGENTES] v2 iniciado — Operaciones(15m) + Contratos(1h) + Gerente General(15m)");
}
