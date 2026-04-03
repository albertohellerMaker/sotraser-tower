import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const isProd = process.env.NODE_ENV === "production";
const STABLE_UPTIME_MS = 5 * 60 * 1000;
let shuttingDown = false;
const currentDir = typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

interface WorkerInfo {
  name: string;
  process: ChildProcess | null;
  file: string;
  restarts: number;
  lastStart: number;
  maxRestarts: number;
  backoffMs: number;
}

const workers: Map<string, WorkerInfo> = new Map();

function resolveWorkerPath(filename: string): string {
  if (isProd) {
    return path.join(currentDir, "workers", filename.replace(".ts", ".cjs"));
  }
  return path.join(currentDir, "workers", filename);
}

function spawnWorker(info: WorkerInfo): ChildProcess {
  const execArgv = isProd ? [] : ["--import", "tsx"];

  const child = fork(info.file, [], {
    execArgv,
    env: { ...process.env } as Record<string, string>,
    stdio: ["inherit", "inherit", "inherit", "ipc"],
  });

  info.lastStart = Date.now();

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
    if (shuttingDown) return;

    const uptime = Date.now() - info.lastStart;
    if (uptime > STABLE_UPTIME_MS) {
      info.restarts = 0;
    }

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
  if (shuttingDown) return;

  if (info.restarts >= info.maxRestarts) {
    console.error(`[MANAGER] Worker '${info.name}' alcanzó máximo de ${info.maxRestarts} reinicios. No se reiniciará.`);
    return;
  }

  const delay = info.backoffMs * Math.pow(2, info.restarts);
  info.restarts++;

  console.log(`[MANAGER] Reiniciando worker '${info.name}' en ${delay / 1000}s (intento ${info.restarts}/${info.maxRestarts})`);

  setTimeout(() => {
    if (shuttingDown) return;
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
    lastStart: 0,
    maxRestarts: 5,
    backoffMs: 5000,
  };

  const agentsInfo: WorkerInfo = {
    name: "agents",
    process: null,
    file: resolveWorkerPath("agents-worker.ts"),
    restarts: 0,
    lastStart: 0,
    maxRestarts: 5,
    backoffMs: 5000,
  };

  workers.set("jobs", jobsInfo);
  workers.set("agents", agentsInfo);

  spawnWorker(jobsInfo);
  spawnWorker(agentsInfo);

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  console.log("[MANAGER] Workers spawned: jobs, agents");
}

function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[MANAGER] ${signal} recibido, terminando workers...`);
  terminateWorkers();
  setTimeout(() => process.exit(0), 3000);
}

export function getWorkerStatus(): Array<{ name: string; active: boolean; restarts: number; pid: number | null }> {
  const result: Array<{ name: string; active: boolean; restarts: number; pid: number | null }> = [];
  for (const [name, info] of workers) {
    const alive = info.process !== null && info.process.exitCode === null && info.process.signalCode === null;
    result.push({
      name,
      active: alive,
      restarts: info.restarts,
      pid: info.process?.pid ?? null,
    });
  }
  return result;
}

export function terminateWorkers() {
  for (const [name, info] of workers) {
    if (info.process && info.process.exitCode === null) {
      info.maxRestarts = 0;
      info.process.kill("SIGTERM");
      console.log(`[MANAGER] Worker '${name}' SIGTERM enviado`);
    }
  }
}
