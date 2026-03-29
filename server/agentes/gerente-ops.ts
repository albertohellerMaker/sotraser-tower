import { pool } from "../db";
import { enviarMensaje } from "./index";

export const agenteGerenteOps = {
  id: "agente-gerente-ops",

  async ejecutar() {
    console.log("[GERENTE-OPS] Ejecutando ciclo autónomo...");
    try {
      // Fase 1: Auto-diagnóstico
      const diagnostico = await this.autoDiagnostico();

      // Fase 2: Capacidades operativas (en paralelo)
      const [r1, r2, r3] = await Promise.allSettled([
        this.resolverPuntosDesconocidos(),
        this.ajustarParametros(),
        this.aprenderCorredores(),
      ]);

      // Fase 3: Decisiones autónomas basadas en contexto
      await this.tomarDecisionesAutonomas();

      // Fase 4: Aprender de errores del ciclo
      for (const [i, r] of [r1, r2, r3].entries()) {
        if (r.status === "rejected") {
          const nombres = ["resolverPuntos", "ajustarParametros", "aprenderCorredores"];
          await this.aprenderDeError(nombres[i], r.reason?.message || "Error desconocido");
        }
      }

      await pool.query("UPDATE agentes SET ultimo_ciclo = NOW(), ciclos_completados = ciclos_completados + 1, errores_consecutivos = 0 WHERE id = $1", [this.id]);

      // Guardar resultado del ciclo en memoria
      await this.guardarMemoria("CICLO", "ultimo_ciclo", {
        diagnostico,
        puntos: r1.status === "fulfilled" ? r1.value : 0,
        params: r2.status === "fulfilled",
        corredores: r3.status === "fulfilled",
        timestamp: new Date().toISOString()
      }, 0.9);

      console.log("[GERENTE-OPS] Ciclo autónomo completado");
    } catch (e: any) {
      console.error("[GERENTE-OPS]", e.message);
      await this.aprenderDeError("ciclo_principal", e.message);
    }
  },

  // ═══════════════════════════════════════════════════
  // AUTO-DIAGNÓSTICO: Evalúa salud del sistema
  // ═══════════════════════════════════════════════════
  async autoDiagnostico(): Promise<{ salud: number; problemas: string[] }> {
    const problemas: string[] = [];
    let salud = 100;

    try {
      const [gps, viajes, agentes, geocercas] = await Promise.all([
        // GPS: ¿están llegando datos?
        pool.query(`SELECT
          COUNT(*) FILTER (WHERE minutos_desde_ultimo < 30)::int as activos,
          COUNT(*) FILTER (WHERE minutos_desde_ultimo >= 30 AND minutos_desde_ultimo < 120)::int as rezagados,
          COUNT(*) FILTER (WHERE minutos_desde_ultimo >= 120)::int as perdidos
          FROM ultima_posicion_camion`),
        // Viajes: ¿se están detectando?
        pool.query(`SELECT COUNT(*)::int as hoy FROM viajes_aprendizaje WHERE DATE(fecha_inicio) = CURRENT_DATE`),
        // Agentes: ¿están corriendo?
        pool.query(`SELECT id, estado, ultimo_ciclo, errores_consecutivos FROM agentes WHERE estado = 'ACTIVO'`),
        // Geocercas: cobertura
        pool.query(`SELECT
          COUNT(*) FILTER (WHERE nivel >= 4)::int as nivel_alto,
          COUNT(*)::int as total
          FROM geocercas_operacionales WHERE activa = true`),
      ]);

      const g = gps.rows[0];
      if (g.perdidos > 50) { problemas.push(`${g.perdidos} camiones sin señal GPS >2h`); salud -= 15; }
      if (g.rezagados > 100) { problemas.push(`${g.rezagados} camiones con GPS rezagado`); salud -= 10; }

      if (viajes.rows[0].hoy < 5 && new Date().getHours() > 10) {
        problemas.push(`Solo ${viajes.rows[0].hoy} viajes detectados hoy`); salud -= 20;
      }

      const agentesConCiclo = ["agente-monitor", "agente-analista", "agente-predictor", "agente-gestor", "agente-ceo", "agente-gerente-ops"];
      for (const a of agentes.rows) {
        if (!agentesConCiclo.includes(a.id)) continue; // Skip chat-only agents like arquitecto
        if (a.errores_consecutivos > 3) { problemas.push(`Agente ${a.id} con ${a.errores_consecutivos} errores consecutivos`); salud -= 10; }
        const minSinCiclo = a.ultimo_ciclo ? Math.floor((Date.now() - new Date(a.ultimo_ciclo).getTime()) / 60000) : 999;
        if (minSinCiclo > 60) { problemas.push(`Agente ${a.id} sin ciclo hace ${minSinCiclo}min`); salud -= 5; }
      }

      const gc = geocercas.rows[0];
      const cobertura = gc.total > 0 ? gc.nivel_alto / gc.total : 0;
      if (cobertura < 0.3) { problemas.push(`Solo ${(cobertura * 100).toFixed(0)}% geocercas nivel alto`); salud -= 5; }

      salud = Math.max(0, salud);

      // Si salud crítica, enviar alerta al CEO
      if (salud < 50) {
        await enviarMensaje({
          de: this.id, para: "agente-ceo", tipo: "ALERTA_SISTEMA",
          prioridad: "ALTA", titulo: `Salud sistema: ${salud}%`,
          contenido: `Problemas detectados: ${problemas.join("; ")}`,
          datos: { salud, problemas }
        });
      }

      // Registrar decisión de diagnóstico
      await this.registrarDecision("DIAGNOSTICO", `Salud: ${salud}% | ${problemas.length} problemas`, { salud, problemas }, true, salud / 100);

    } catch (e: any) {
      problemas.push(`Error en diagnóstico: ${e.message}`);
      salud = 50;
    }

    return { salud, problemas };
  },

  // ═══════════════════════════════════════════════════
  // DECISIONES AUTÓNOMAS: Actúa según contexto
  // ═══════════════════════════════════════════════════
  async tomarDecisionesAutonomas() {
    try {
      // Obtener contexto de memoria
      const memoria = await this.obtenerMemoria("REGLA");

      // Decisión 1: ¿Hay demasiados puntos desconocidos?
      const ptsDesc = await pool.query(`
        SELECT COUNT(*)::int as total FROM viajes_aprendizaje
        WHERE (origen_nombre = 'Punto desconocido' OR destino_nombre = 'Punto desconocido')
          AND fecha_inicio >= NOW() - INTERVAL '3 days' AND km_ecu > 20
      `);
      if (ptsDesc.rows[0].total > 50) {
        // Buscar patrón: ¿hay un contrato específico con muchos desconocidos?
        const porContrato = await pool.query(`
          SELECT contrato, COUNT(*)::int as desc FROM viajes_aprendizaje
          WHERE (origen_nombre = 'Punto desconocido' OR destino_nombre = 'Punto desconocido')
            AND fecha_inicio >= NOW() - INTERVAL '3 days' AND km_ecu > 20
          GROUP BY contrato ORDER BY desc DESC LIMIT 3
        `);
        const msg = porContrato.rows.map((r: any) => `${r.contrato}: ${r.desc}`).join(", ");
        await enviarMensaje({
          de: this.id, para: "agente-ceo", tipo: "INSIGHT",
          prioridad: "NORMAL", titulo: "Contratos con puntos desconocidos",
          contenido: `${ptsDesc.rows[0].total} viajes con origen/destino desconocido en 3 días. Concentración: ${msg}. Revisar geocercas de estos contratos.`,
          datos: { total: ptsDesc.rows[0].total, por_contrato: porContrato.rows }
        });
        await this.registrarDecision("ALERTA_GEOCERCAS", `${ptsDesc.rows[0].total} puntos desconocidos`, { por_contrato: porContrato.rows }, true, 0.7);
      }

      // Decisión 2: ¿Rendimiento anormal hoy?
      const rendHoy = await pool.query(`
        SELECT ROUND(AVG(rendimiento_real) FILTER (WHERE rendimiento_real > 0 AND rendimiento_real < 10)::numeric, 2) as rend,
          COUNT(*) FILTER (WHERE rendimiento_real > 0 AND rendimiento_real < 2.0)::int as criticos
        FROM viajes_aprendizaje WHERE DATE(fecha_inicio) = CURRENT_DATE AND km_ecu > 30
      `);
      const rh = rendHoy.rows[0];
      if (rh.criticos > 5) {
        await enviarMensaje({
          de: this.id, para: "agente-monitor", tipo: "ACCION_REQUERIDA",
          prioridad: "ALTA", titulo: `${rh.criticos} viajes con rendimiento crítico hoy`,
          contenido: `Rendimiento promedio: ${rh.rend} km/L. ${rh.criticos} viajes bajo 2.0 km/L. Investigar causas.`,
          datos: rh
        });
        await this.registrarDecision("ALERTA_RENDIMIENTO", `${rh.criticos} viajes críticos, prom ${rh.rend}`, rh, true, 0.8);
      }

      // Decisión 3: Auto-promocionar geocercas con suficiente evidencia
      const promoGeo = await pool.query(`
        SELECT id, nombre, nivel, veces_visitado FROM geocercas_operacionales
        WHERE activa = true AND nivel < 4 AND veces_visitado >= 10
        LIMIT 20
      `);
      let promovidas = 0;
      for (const g of promoGeo.rows) {
        const nuevoNivel = Math.min(5, g.nivel + 1);
        await pool.query("UPDATE geocercas_operacionales SET nivel = $1, updated_at = NOW() WHERE id = $2", [nuevoNivel, g.id]);
        promovidas++;
      }
      if (promovidas > 0) {
        await this.registrarDecision("PROMOCION_GEOCERCA", `${promovidas} geocercas promovidas de nivel`, { promovidas }, true, 0.9);
        console.log(`[GERENTE-OPS] ${promovidas} geocercas promovidas`);
      }

    } catch (e: any) {
      console.error("[GERENTE-OPS] Error decisiones:", e.message);
    }
  },

  // ═══════════════════════════════════════════════════
  // MEMORIA: Guardar y recuperar conocimiento
  // ═══════════════════════════════════════════════════
  async guardarMemoria(categoria: string, clave: string, valor: any, confianza: number) {
    try {
      const existe = await pool.query("SELECT id FROM gerente_memoria WHERE categoria = $1 AND clave = $2", [categoria, clave]);
      if (existe.rows.length > 0) {
        await pool.query("UPDATE gerente_memoria SET valor = $1, confianza = $2, veces_aplicado = veces_aplicado + 1, ultima_aplicacion = NOW() WHERE id = $3",
          [JSON.stringify(valor), confianza, existe.rows[0].id]);
      } else {
        await pool.query("INSERT INTO gerente_memoria (categoria, clave, valor, confianza) VALUES ($1,$2,$3,$4)",
          [categoria, clave, JSON.stringify(valor), confianza]);
      }
    } catch (e: any) { console.error("[GERENTE-OPS] Error guardando memoria:", e.message); }
  },

  async obtenerMemoria(categoria?: string): Promise<any[]> {
    try {
      if (categoria) {
        const r = await pool.query("SELECT * FROM gerente_memoria WHERE categoria = $1 AND activo = true ORDER BY confianza DESC", [categoria]);
        return r.rows;
      }
      const r = await pool.query("SELECT * FROM gerente_memoria WHERE activo = true ORDER BY categoria, confianza DESC");
      return r.rows;
    } catch { return []; }
  },

  // ═══════════════════════════════════════════════════
  // APRENDER DE ERRORES
  // ═══════════════════════════════════════════════════
  async aprenderDeError(funcion: string, error: string) {
    try {
      // Buscar si ya conocemos este error
      const existe = await pool.query("SELECT id, valor FROM gerente_memoria WHERE categoria = 'ERROR' AND clave = $1", [funcion]);
      if (existe.rows.length > 0) {
        const val = existe.rows[0].valor || {};
        val.ultimo_error = error;
        val.count = (val.count || 0) + 1;
        val.last_seen = new Date().toISOString();
        await pool.query("UPDATE gerente_memoria SET valor = $1, veces_fallido = veces_fallido + 1, ultima_aplicacion = NOW() WHERE id = $2",
          [JSON.stringify(val), existe.rows[0].id]);
      } else {
        await pool.query("INSERT INTO gerente_memoria (categoria, clave, valor, confianza, veces_fallido) VALUES ($1,$2,$3,$4,1)",
          ["ERROR", funcion, JSON.stringify({ ultimo_error: error, count: 1, first_seen: new Date().toISOString() }), 0.5]);
      }

      // Si un error se repite más de 5 veces, alertar al CEO
      if (existe.rows.length > 0) {
        const val = existe.rows[0].valor || {};
        if ((val.count || 0) >= 5) {
          await enviarMensaje({
            de: this.id, para: "agente-ceo", tipo: "ERROR_RECURRENTE",
            prioridad: "ALTA", titulo: `Error recurrente en ${funcion}`,
            contenido: `El error "${error}" se ha repetido ${val.count + 1} veces. Requiere intervención humana.`,
            datos: { funcion, error, count: val.count + 1 }
          });
        }
      }
    } catch { /* no fail on error logging */ }
  },

  // ═══════════════════════════════════════════════════
  // REGISTRAR DECISIÓN
  // ═══════════════════════════════════════════════════
  async registrarDecision(tipo: string, descripcion: string, contexto: any, exito: boolean, impacto: number) {
    try {
      await pool.query("INSERT INTO gerente_decisiones (tipo, descripcion, contexto, exito, impacto_score) VALUES ($1,$2,$3,$4,$5)",
        [tipo, descripcion, JSON.stringify(contexto), exito, impacto]);
    } catch { /* silent */ }
  },

  // ═══════════════════════════════════════════════════
  // SALUD GENERAL (endpoint público)
  // ═══════════════════════════════════════════════════
  async obtenerSalud() {
    const diag = await this.autoDiagnostico();
    const memoriaCount = await pool.query("SELECT COUNT(*)::int as total FROM gerente_memoria WHERE activo = true");
    const decisiones = await pool.query("SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE exito)::int as exitosas FROM gerente_decisiones WHERE created_at >= NOW() - INTERVAL '24 hours'");
    const errores = await pool.query("SELECT clave, valor FROM gerente_memoria WHERE categoria = 'ERROR' AND activo = true ORDER BY ultima_aplicacion DESC LIMIT 5");

    return {
      salud: diag.salud,
      problemas: diag.problemas,
      memoria_total: memoriaCount.rows[0].total,
      decisiones_24h: decisiones.rows[0].total,
      decisiones_exitosas: decisiones.rows[0].exitosas,
      errores_conocidos: errores.rows.map((r: any) => ({ funcion: r.clave, ...r.valor })),
    };
  },

  // ── CAPACIDAD 1: Resolver puntos desconocidos
  async resolverPuntosDesconocidos() {
    const viajes = await pool.query(`
      SELECT va.id, c.patente, va.contrato, va.origen_nombre, va.destino_nombre,
        va.origen_lat::float as olat, va.origen_lng::float as olng, va.destino_lat::float as dlat, va.destino_lng::float as dlng
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE (va.origen_nombre = 'Punto desconocido' OR va.origen_nombre IS NULL OR va.destino_nombre = 'Punto desconocido' OR va.destino_nombre IS NULL)
        AND va.fecha_inicio >= NOW() - INTERVAL '7 days' AND va.km_ecu > 20
        AND (va.origen_lat IS NOT NULL OR va.destino_lat IS NOT NULL)
      LIMIT 100
    `);

    let resueltos = 0;
    for (const v of viajes.rows) {
      if ((!v.origen_nombre || v.origen_nombre === "Punto desconocido") && v.olat) {
        const nombre = await this.resolverCoordenadas(v.olat, v.olng);
        if (nombre) { await pool.query("UPDATE viajes_aprendizaje SET origen_nombre = $1 WHERE id = $2", [nombre, v.id]); resueltos++; }
      }
      if ((!v.destino_nombre || v.destino_nombre === "Punto desconocido") && v.dlat) {
        const nombre = await this.resolverCoordenadas(v.dlat, v.dlng);
        if (nombre) { await pool.query("UPDATE viajes_aprendizaje SET destino_nombre = $1 WHERE id = $2", [nombre, v.id]); resueltos++; }
      }
    }

    if (resueltos > 0) {
      await this.registrarAprendizaje("LUGAR_RESUELTO", `Resolvió ${resueltos} puntos desconocidos`, {}, { resueltos }, 0.8, resueltos);
      await this.guardarMemoria("ESTADISTICA", "puntos_resueltos_ultimo", { resueltos, fecha: new Date().toISOString() }, 0.9);
      console.log(`[GERENTE-OPS] ${resueltos} puntos resueltos`);
    }
    return resueltos;
  },

  async resolverCoordenadas(lat: number, lng: number): Promise<string | null> {
    // 1. Buscar en geocercas operacionales
    const geo = await pool.query(`SELECT nombre FROM geocercas_operacionales WHERE activa = true AND ABS(lat - $1) < 0.05 AND ABS(lng - $2) < 0.05 ORDER BY ABS(lat - $1) + ABS(lng - $2) LIMIT 1`, [lat, lng]);
    if (geo.rows.length > 0) return geo.rows[0].nombre;

    // 2. Buscar en lugares conocidos
    const lc = await pool.query(`SELECT nombre FROM lugares_conocidos WHERE activa = true AND ABS(lat - $1) < 0.02 AND ABS(lng - $2) < 0.02 ORDER BY ABS(lat - $1) + ABS(lng - $2) LIMIT 1`, [lat, lng]);
    if (lc.rows.length > 0) return lc.rows[0].nombre;

    // 3. Buscar en viajes históricos con nombre
    const hist = await pool.query(`SELECT origen_nombre as nombre FROM viajes_aprendizaje WHERE origen_nombre IS NOT NULL AND origen_nombre != 'Punto desconocido' AND ABS(origen_lat::float - $1) < 0.01 AND ABS(origen_lng::float - $2) < 0.01 LIMIT 1`, [lat, lng]);
    if (hist.rows.length > 0) {
      await pool.query(`INSERT INTO lugares_conocidos (nombre, lat, lng, tipo, fuente) VALUES ($1, $2, $3, 'PARADA', 'GERENTE_BOT') ON CONFLICT DO NOTHING`, [hist.rows[0].nombre, lat, lng]);
      return hist.rows[0].nombre;
    }

    // 4. Google Maps reverse geocoding
    try {
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return null;
      const https = require("https");
      const result: any = await new Promise((resolve) => {
        https.get(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&language=es&result_type=locality|sublocality|route`, (res: any) => {
          let data = ""; res.on("data", (c: string) => data += c);
          res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
        }).on("error", () => resolve(null));
      });

      if (result?.status === "OK" && result.results?.[0]) {
        const addr = result.results[0].address_components || [];
        const locality = addr.find((c: any) => c.types.includes("locality"))?.long_name;
        const route = addr.find((c: any) => c.types.includes("route"))?.long_name;
        let nombre = route ? `${route} · ${locality || ""}` : locality || null;
        if (nombre) {
          nombre = nombre.substring(0, 50);
          await pool.query(`INSERT INTO lugares_conocidos (nombre, lat, lng, tipo, fuente) VALUES ($1, $2, $3, 'PARADA', 'GERENTE_BOT') ON CONFLICT DO NOTHING`, [nombre, lat, lng]);
          return nombre;
        }
      }
    } catch { /* silent */ }

    return null;
  },

  // ── CAPACIDAD 2: Ajustar parámetros adaptativos
  async ajustarParametros() {
    const rendFlota = await pool.query(`
      SELECT ROUND(AVG(rendimiento_real)::numeric, 2) as prom, ROUND(STDDEV(rendimiento_real)::numeric, 2) as desv
      FROM viajes_aprendizaje WHERE fecha_inicio >= NOW() - INTERVAL '14 days' AND rendimiento_real > 0 AND rendimiento_real < 10 AND km_ecu > 50
    `);
    const r = rendFlota.rows[0];
    if (r.prom && r.desv) {
      const nuevoCritico = Math.max(1.5, parseFloat(r.prom) - 2 * parseFloat(r.desv));
      const actual = await pool.query("SELECT valor::float as v FROM sistema_parametros WHERE clave = 'rendimiento_critico_kmL'");
      const act = actual.rows[0]?.v || 2.0;
      if (Math.abs(nuevoCritico - act) > 0.1) {
        await pool.query("UPDATE sistema_parametros SET valor = $1, modificado_por = 'GERENTE_BOT', ultima_modificacion = NOW() WHERE clave = 'rendimiento_critico_kmL'", [nuevoCritico.toFixed(2)]);
        await this.registrarAprendizaje("PARAMETRO_AJUSTADO", `Rendimiento crítico: ${act} → ${nuevoCritico.toFixed(2)} km/L`, { anterior: act }, { nuevo: nuevoCritico.toFixed(2) }, 0.85, 0);
        await this.guardarMemoria("PARAMETRO", "rendimiento_critico", { anterior: act, nuevo: nuevoCritico.toFixed(2), prom: r.prom, desv: r.desv }, 0.9);
        console.log(`[GERENTE-OPS] Umbral rendimiento: ${act} → ${nuevoCritico.toFixed(2)}`);
      }
    }
  },

  // ── CAPACIDAD 3: Aprender corredores nuevos
  async aprenderCorredores() {
    const rutas = await pool.query(`
      SELECT origen_nombre, destino_nombre, contrato, COUNT(*)::int as veces,
        ROUND(AVG(km_ecu)::numeric) as km_prom, ROUND(AVG(rendimiento_real) FILTER (WHERE rendimiento_real > 0 AND rendimiento_real < 10)::numeric, 2) as rend_prom
      FROM viajes_aprendizaje
      WHERE origen_nombre IS NOT NULL AND destino_nombre IS NOT NULL AND origen_nombre != 'Punto desconocido' AND destino_nombre != 'Punto desconocido'
        AND corredor_id IS NULL AND km_ecu > 30 AND fecha_inicio >= NOW() - INTERVAL '30 days'
      GROUP BY origen_nombre, destino_nombre, contrato HAVING COUNT(*) >= 3
      ORDER BY veces DESC LIMIT 20
    `);

    let nuevos = 0;
    for (const r of rutas.rows) {
      const existe = await pool.query("SELECT id FROM corredores WHERE origen_nombre = $1 AND destino_nombre = $2 AND contrato = $3 AND activo = true", [r.origen_nombre, r.destino_nombre, r.contrato]);
      if (existe.rows.length === 0) {
        try {
          await pool.query(`INSERT INTO corredores (nombre, contrato, origen_nombre, destino_nombre, km_promedio, rendimiento_promedio, total_viajes_base, activo, creado_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())`, [`${r.origen_nombre} → ${r.destino_nombre}`, r.contrato, r.origen_nombre, r.destino_nombre, r.km_prom, r.rend_prom, r.veces]);
          nuevos++;
        } catch { /* duplicate */ }
      }
    }

    if (nuevos > 0) {
      await this.registrarAprendizaje("CORREDOR_APRENDIDO", `${nuevos} corredores nuevos`, {}, { nuevos }, 0.9, rutas.rows.reduce((s: number, r: any) => s + r.veces, 0));
      await this.guardarMemoria("ESTADISTICA", "corredores_aprendidos", { nuevos, fecha: new Date().toISOString() }, 0.85);
      console.log(`[GERENTE-OPS] ${nuevos} corredores aprendidos`);
    }
  },

  async registrarAprendizaje(tipo: string, desc: string, antes: any, despues: any, confianza: number, impacto: number) {
    await pool.query("INSERT INTO gerente_aprendizaje (tipo, descripcion, datos_antes, datos_despues, confianza, impacto_viajes) VALUES ($1,$2,$3,$4,$5,$6)", [tipo, desc, JSON.stringify(antes), JSON.stringify(despues), confianza, impacto]);
  },
};
