export {};

function send(msg: any) {
  if (process.send) process.send(msg);
}

function log(msg: string) {
  const line = `[WORKER:AGENTS] ${msg}`;
  console.log(line);
}

function logError(msg: string) {
  const line = `[WORKER:AGENTS] ${msg}`;
  console.error(line);
}

async function main() {
  log("Inicializando worker de agentes...");

  const { pool } = await import("../db");
  const { agenteOperaciones } = await import("../agentes/operaciones");
  const { agentePredictor } = await import("../agentes/predictor");
  const { agenteGerenteGeneral } = await import("../agentes/gerente-general");
  const { agenteContrato } = await import("../agentes/contrato");
  const { agenteCencosud } = await import("../agentes/cencosud");
  const { agenteGerenteOps } = await import("../agentes/gerente-ops");
  const { superAgenteCencosud } = await import("../agentes/super-agente-cencosud");
  const { superAgenteAnglo } = await import("../agentes/super-agente-anglo");

  log("Sistema multi-agente v2 iniciando...");

  setInterval(async () => {
    try {
      await agenteOperaciones.ejecutar();
      await agentePredictor.ejecutar();
      await agenteGerenteGeneral.ejecutar();
      await pool.query("UPDATE agente_estado_sistema SET ultimo_ciclo_monitor = NOW(), updated_at = NOW() WHERE id = 1");
      send({ type: "status", cycle: "fast", status: "done" });
    } catch (e: any) {
      logError("Error ciclo rápido: " + e.message);
      send({ type: "status", cycle: "fast", status: "error", error: e.message });
    }
  }, 15 * 60 * 1000);

  setInterval(async () => {
    try {
      await agenteContrato.ejecutar();
      await agenteCencosud.ejecutar();
      await agenteGerenteOps.ejecutar();
      send({ type: "status", cycle: "deep", status: "done" });
    } catch (e: any) {
      logError("Error ciclo profundo: " + e.message);
      send({ type: "status", cycle: "deep", status: "error", error: e.message });
    }
  }, 60 * 60 * 1000);

  setTimeout(async () => {
    try {
      await agenteOperaciones.ejecutar();
      await agenteGerenteGeneral.ejecutar();
      await agenteContrato.ejecutar();
      await agenteCencosud.ejecutar();
      await agenteGerenteOps.ejecutar();
      log("Primer ciclo completo");
    } catch (e: any) {
      logError("Error primer ciclo: " + e.message);
    }
  }, 10000);

  try {
    await superAgenteCencosud.iniciar();
  } catch (e: any) {
    logError("Super-Cencosud init error: " + e.message);
  }

  try {
    await superAgenteAnglo.iniciar();
  } catch (e: any) {
    logError("Super-Anglo init error: " + e.message);
  }

  log("v2 iniciado — Operaciones(15m) + Contratos(1h) + Gerente General(15m)");
  send({ type: "ready" });
}

main().catch(err => {
  console.error("[WORKER:AGENTS] Fatal error:", err);
  send({ type: "fatal", error: err.message });
  process.exit(1);
});
