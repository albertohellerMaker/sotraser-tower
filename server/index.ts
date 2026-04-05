import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { iniciarWorkers } from "./worker-manager";
import { iniciarGitSync } from "./github-sync";
import { db } from "./db";
import { geoBases } from "@shared/schema";
import { sql } from "drizzle-orm";
import { inicializarContratos } from "./faena-filter";
import { startWiseTrackSync } from "./wisetrack-scraper";
import crypto from "crypto";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare module "express-session" {
  interface SessionData {
    user?: string;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

const isProd = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
if (isProd && !process.env.SESSION_SECRET) {
  console.warn("[AUTH] WARNING: SESSION_SECRET not set in production — sessions will reset on restart");
}

app.set("trust proxy", 1);
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
}));

app.post("/api/auth/login", (req: Request, res: Response) => {
  const { usuario, clave } = req.body;
  if (usuario === "beto" && clave === "1234") {
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ ok: false, error: "Error de sesión" });
      req.session.user = usuario;
      req.session.save(() => res.json({ ok: true, usuario }));
    });
    return;
  }
  return res.status(401).json({ ok: false, error: "Credenciales incorrectas" });
});

app.post("/api/auth/logout", (req: Request, res: Response) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/auth/me", (req: Request, res: Response) => {
  if (req.session.user) return res.json({ ok: true, usuario: req.session.user });
  return res.status(401).json({ ok: false });
});

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith("/api/auth/")) return next();
  if (req.path.startsWith("/api/conductor/")) return next();
  if (!req.path.startsWith("/api/")) return next();
  if (!req.session.user) return res.status(401).json({ error: "No autorizado" });
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        const jsonStr = JSON.stringify(capturedJsonResponse);
        logLine += ` :: ${jsonStr.length > 300 ? jsonStr.slice(0, 300) + '...' : jsonStr}`;
      }

      log(logLine);
    }
  });

  next();
});

// Middleware de filtrado global removido — la app muestra todos los contratos dinámicamente

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 8080 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "8080", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      
    },
    () => {
      log(`serving on port ${port}`);

      inicializarContratos();
      iniciarGitSync();

      iniciarWorkers();
      startWiseTrackSync(120_000);

      setTimeout(async () => {
        try {
          const result = await db.select({ count: sql<number>`count(*)` })
            .from(geoBases);
          const total = Number(result[0]?.count || 0);

          if (total < 10) {
            console.log('[GEOCERCAS] Tabla con pocas geocercas (' + total + ')');
            console.log('[GEOCERCAS] Llamar POST /api/geocercas/importar-json con el archivo geocercas_sotraser.json');
          } else {
            console.log('[GEOCERCAS] ' + total + ' geocercas activas');
          }
        } catch (e: any) {
          console.error('[GEOCERCAS] Error:', e.message);
        }
      }, 5000);
    },
  );
})();
