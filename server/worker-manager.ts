import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface WorkerInfo {
  name: string;
  process: ChildProcess | null;
  file: string;
  restarts: number;
  lastRestart: number;
  maxRestarts: number;
  backoffMs: number;
}

const workers: Map<string, WorkerInfo> = new Map();

function resolveWorkerPath(filename: string): string {
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(dirname, "workers", filename);
}

function spawnWorker(info: WorkerInfo): ChildProcess {
  const child = fork(info.file, [], {
    execArgv: ["--import", "tsx"],
    env: {
      ...process.env,
    },
    stdio: ["inherit", "inherit", "inherit", "ipc"],
  });

  child.on("message", (msg: any) => {
    if (msg.type === "ready") {
      console.log(`[MANAGER] Worker '${info.name}' listo (pid: ${child.pid})`);
    } else if (msg.type === "fatal") {
      console.error(`[MANAGER] Worker '${info.name}' error fatal: ${msg.error}`);
    }
  });

  child.on("error", (err) => {
    console.error(`[MANAGER] Worker '${info.name}' error:`, err.message);
  });

  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.warn(`[MANAGER] Worker '${info.name}' terminó con código ${code}`);
      attemptRestart(info);
    } else if (code === null) {
      console.warn(`[MANAGER] Worker '${info.name}' killed por señal`);
      attemptRestart(info);
    } else {
      console.log(`[MANAGER] Worker '${info.name}' terminó limpiamente`);
    }
  });

  info.process = child;
  return child;
}

function attemptRestart(info: WorkerInfo) {
  if (info.restarts >= info.maxRestarts) {
    console.error(`[MANAGER] Worker '${info.name}' alcanzó máximo de ${info.maxRestarts} reinicios. No se reiniciará.`);
    return;
  }

  const delay = info.backoffMs * Math.pow(2, info.restarts);
  info.restarts++;
  info.lastRestart = Date.now();

  console.log(`[MANAGER] Reiniciando worker '${info.name}' en ${delay / 1000}s (intento ${info.restarts}/${info.maxRestarts})`);

  setTimeout(() => {
    try {
      spawnWorker(info);
    } catch (err: any) {
      console.error(`[MANAGER] No se pudo reiniciar worker '${info.name}':`, err.message);
    }
  }, delay);
}

export function iniciarWorkers() {
  console.log("[MANAGER] Iniciando workers en procesos separados...");

  const jobsInfo: WorkerInfo = {
    name: "jobs",
    process: null,
    file: resolveWorkerPath("jobs-worker.ts"),
    restarts: 0,
    lastRestart: 0,
    maxRestarts: 5,
    backoffMs: 5000,
  };

  const agentsInfo: WorkerInfo = {
    name: "agents",
    process: null,
    file: resolveWorkerPath("agents-worker.ts"),
    restarts: 0,
    lastRestart: 0,
    maxRestarts: 5,
    backoffMs: 5000,
  };

  workers.set("jobs", jobsInfo);
  workers.set("agents", agentsInfo);

  spawnWorker(jobsInfo);
  spawnWorker(agentsInfo);

  console.log("[MANAGER] Workers spawned: jobs, agents");
}

export function getWorkerStatus(): Array<{ name: string; active: boolean; restarts: number; pid: number | null }> {
  const result: Array<{ name: string; active: boolean; restarts: number; pid: number | null }> = [];
  for (const [name, info] of workers) {
    result.push({
      name,
      active: info.process !== null && !info.process.killed,
      restarts: info.restarts,
      pid: info.process?.pid ?? null,
    });
  }
  return result;
}

export function terminateWorkers() {
  console.log("[MANAGER] Terminando todos los workers...");
  for (const [name, info] of workers) {
    if (info.process) {
      info.maxRestarts = 0;
      info.process.kill("SIGTERM");
      console.log(`[MANAGER] Worker '${name}' terminado`);
    }
  }
}
