import { z } from "zod";

// ═══════════════════════════════════════════════════════════
// QUERY HELPERS — reusable param/query schemas
// ═══════════════════════════════════════════════════════════

export const PeriodoQuery = z.object({
  periodo: z.enum(["DIA", "3DIAS", "SEMANA"]).default("DIA"),
  contrato: z.string().default("TODOS"),
});

export const FechaContratoQuery = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  contrato: z.string().default("TODOS"),
});

export const ContratoQuery = z.object({
  contrato: z.string().default("TODOS"),
});

export const ContratoParam = z.object({
  contrato: z.string().min(1),
});

export const IdParam = z.object({
  id: z.coerce.number().int().positive(),
});

export const ViajeIdParam = z.object({
  viajeId: z.coerce.number().int().positive(),
});

export const PatenteParam = z.object({
  patente: z.string().min(1),
});

// ═══════════════════════════════════════════════════════════
// BRAIN — /api/brain/*
// ═══════════════════════════════════════════════════════════

export const BrainBillingItem = z.object({
  facturables: z.number(),
  total: z.number(),
  monto: z.number(),
});

export const BrainContratoRow = z.object({
  contrato: z.string(),
  camiones: z.number(),
  viajes_mes: z.number(),
  viajes_hoy: z.number(),
  viajes_semana: z.number(),
  km_total: z.number(),
  km_prom: z.number(),
  billing: BrainBillingItem.nullable(),
});

export const BrainTotales = z.object({
  camiones_activos: z.number(),
  camiones_total: z.number(),
  viajes_hoy: z.number(),
  viajes_mes: z.number(),
  km_mes: z.number(),
  contratos_activos: z.number(),
});

export const BrainTendenciaDia = z.object({
  dia: z.string(),
  viajes: z.number(),
  camiones: z.number(),
  km: z.number().nullable(),
});

export const BrainResumenEjecutivoResponse = z.object({
  totales: BrainTotales,
  contratos: z.array(BrainContratoRow),
  tendencia_7d: z.array(BrainTendenciaDia),
});

export const BrainChatRequest = z.object({
  message: z.string().min(1).max(5000),
  context: z.string().optional(),
});

export const BrainChatResponse = z.object({
  reply: z.string(),
  timestamp: z.string(),
});

export const BrainAnomaliasMacroQuery = z.object({
  contrato: z.string().default("TODOS"),
});

export const BrainAnomalia = z.object({
  tipo: z.string(),
  severidad: z.string(),
  patente: z.string(),
  contrato: z.string(),
  fecha: z.string(),
  viaje_id: z.number(),
  detalle: z.record(z.unknown()),
});

// ═══════════════════════════════════════════════════════════
// VIAJES TMS — /api/viajes-tms/*
// ═══════════════════════════════════════════════════════════

export const ViajesKpis = z.object({
  total_viajes: z.number(),
  total_camiones: z.number(),
  km_total: z.number(),
  rend_promedio: z.number().nullable(),
});

export const ViajesCamionRow = z.object({
  patente: z.string(),
  contrato: z.string().nullable(),
  conductor: z.string().nullable(),
  km_total: z.string(),
  rendimiento: z.string().nullable(),
  viajes: z.number(),
  horas_ruta: z.string().nullable(),
  estado: z.string(),
  doble_validado: z.boolean().nullable(),
  tiene_wt: z.boolean().nullable(),
  ultimo_origen: z.string().nullable(),
  ultimo_destino: z.string().nullable(),
});

export const ViajesResumenDiaResponse = z.object({
  fecha: z.string(),
  kpis: ViajesKpis,
  camiones: z.array(ViajesCamionRow),
  contratos: z.array(z.string()),
});

export const ViajesResumenEjecutivoResponse = z.object({
  periodo: z.string(),
  dias: z.number(),
  actual: z.record(z.unknown()),
  comparacion: z.object({
    delta_viajes: z.number(),
    delta_km: z.number(),
    delta_rend: z.number(),
    delta_criticos: z.number(),
    anterior: z.record(z.unknown()),
  }),
  por_contrato: z.array(z.record(z.unknown())),
  top_camiones: z.array(z.record(z.unknown())),
  bottom_camiones: z.array(z.record(z.unknown())),
  alertas: z.array(z.record(z.unknown())),
  tendencia: z.array(z.record(z.unknown())),
});

export const GpsPunto = z.object({
  lat: z.number(),
  lng: z.number(),
  ts: z.string(),
  vel: z.number(),
  rumbo: z.number(),
});

export const ViajeGpsResponse = z.object({
  viaje: z.object({
    id: z.number(),
    patente: z.string(),
    contrato: z.string().nullable(),
    origen: z.string().nullable(),
    destino: z.string().nullable(),
    km_ecu: z.number().nullable(),
    fecha_inicio: z.string(),
    fecha_fin: z.string().nullable(),
  }),
  puntos: z.array(GpsPunto),
  stats: z.object({
    total_puntos: z.number(),
    vel_max: z.number(),
    vel_prom: z.number(),
    duracion_min: z.number(),
  }),
});

export const GeocercaToggleRequest = z.object({
  activa: z.boolean(),
});

export const GeocercaRenameRequest = z.object({
  nombre: z.string().min(1).max(200),
});

export const GeocercaRadioRequest = z.object({
  radio_km: z.coerce.number().positive().max(100),
});

export const GeocercaCrearRequest = z.object({
  nombre: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radio_km: z.number().positive().max(100),
  tipo: z.string().default("MANUAL"),
});

export const GeoreferenciarRequest = z.object({
  geocerca_id: z.number().int().positive(),
  nombre_destino: z.string().min(1),
});

// ═══════════════════════════════════════════════════════════
// SHARED ERROR RESPONSE
// ═══════════════════════════════════════════════════════════

export const ApiError = z.object({
  error: z.string(),
});

// ═══════════════════════════════════════════════════════════
// TYPE EXPORTS for frontend consumption
// ═══════════════════════════════════════════════════════════

export type TBrainResumenEjecutivo = z.infer<typeof BrainResumenEjecutivoResponse>;
export type TBrainContratoRow = z.infer<typeof BrainContratoRow>;
export type TBrainTotales = z.infer<typeof BrainTotales>;
export type TBrainTendenciaDia = z.infer<typeof BrainTendenciaDia>;
export type TBrainChatRequest = z.infer<typeof BrainChatRequest>;
export type TBrainChatResponse = z.infer<typeof BrainChatResponse>;
export type TBrainAnomalia = z.infer<typeof BrainAnomaliasMacroQuery>;

export type TViajesResumenDia = z.infer<typeof ViajesResumenDiaResponse>;
export type TViajesKpis = z.infer<typeof ViajesKpis>;
export type TViajesCamionRow = z.infer<typeof ViajesCamionRow>;
export type TViajesResumenEjecutivo = z.infer<typeof ViajesResumenEjecutivoResponse>;
export type TViajeGps = z.infer<typeof ViajeGpsResponse>;
export type TGpsPunto = z.infer<typeof GpsPunto>;
export type TApiError = z.infer<typeof ApiError>;
