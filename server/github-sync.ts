import { execSync } from "child_process";

const INTERVAL_MS = 10 * 60 * 1000;

function gitPush() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log("[GIT-SYNC] GITHUB_TOKEN no configurado, omitiendo push");
    return;
  }

  try {
    const repo = `https://${token}@github.com/albertohellerMaker/sotraser-tower.git`;

    execSync('git config user.email "replit@sotraser.cl"', { cwd: process.cwd() });
    execSync('git config user.name "SOTRASER Replit"', { cwd: process.cwd() });

    execSync("git add -A", { cwd: process.cwd() });

    try {
      execSync('git commit -m "Auto-sync desde Replit"', { cwd: process.cwd() });
    } catch {
      return;
    }

    execSync(`git push ${repo} main`, { cwd: process.cwd(), timeout: 30000 });
    console.log("[GIT-SYNC] Push a GitHub completado");
  } catch (err: any) {
    console.error("[GIT-SYNC] Error:", err.message);
  }
}

export function iniciarGitSync() {
  console.log(`[GIT-SYNC] Auto-push a GitHub cada ${INTERVAL_MS / 60000} minutos`);
  setTimeout(() => {
    gitPush();
    setInterval(gitPush, INTERVAL_MS);
  }, 30000);
}
