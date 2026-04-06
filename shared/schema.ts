import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, boolean, date, serial, unique, numeric, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const faenas = pgTable("faenas", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  color: text("color").notNull().default("#1A8FFF"),
});

export const insertFaenaSchema = createInsertSchema(faenas).omit({ id: true });
export type InsertFaena = z.infer<typeof insertFaenaSchema>;
export type Faena = typeof faenas.$inferSelect;

export const camiones = pgTable("camiones", {
  id: serial("id").primaryKey(),
  patente: text("patente").notNull(),
  modelo: text("modelo").notNull(),
  faenaId: integer("faena_id").notNull(),
  metaKmL: real("meta_km_l").notNull().default(2.1),
  vin: text("vin"),
  odometro: integer("odometro"),
  horasMotor: integer("horas_motor"),
  horasRalenti: integer("horas_ralenti"),
  velPromedio: integer("vel_promedio"),
  conductor: text("conductor"),
  syncOk: boolean("sync_ok").notNull().default(false),
  syncAt: text("sync_at"),
  taraKg: numeric("tara_kg", { precision: 8, scale: 1 }),
  pesoMaximoKg: numeric("peso_maximo_kg", { precision: 8, scale: 1 }),
  capacidadCargaKg: numeric("capacidad_carga_kg", { precision: 8, scale: 1 }),
  tipoVehiculo: varchar("tipo_vehiculo", { length: 50 }),
  anioFabricacion: integer("anio_fabricacion"),
  configuracionEjes: varchar("configuracion_ejes", { length: 20 }),
  capacidadEstanqueLitros: integer("capacidad_estanque_litros"),
  numVeh: text("num_veh"),
  idDisplay: text("id_display"),
  idTipo: varchar("id_tipo", { length: 20 }),
});

export const insertCamionSchema = createInsertSchema(camiones).omit({ id: true });
export type InsertCamion = z.infer<typeof insertCamionSchema>;
export type Camion = typeof camiones.$inferSelect;

export const cargas = pgTable("cargas", {
  id: serial("id").primaryKey(),
  camionId: integer("camion_id").notNull().references(() => camiones.id),
  fecha: text("fecha").notNull(),
  litrosSurtidor: real("litros_surtidor").notNull(),
  litrosEcu: real("litros_ecu").notNull(),
  kmAnterior: integer("km_anterior").notNull(),
  kmActual: integer("km_actual").notNull(),
  proveedor: text("proveedor").notNull().default("COPEC"),
  numGuia: integer("num_guia"),
  patente: text("patente"),
  conductor: text("conductor"),
  lugarConsumo: text("lugar_consumo"),
  faena: text("faena"),
  rendReal: real("rend_real"),
  desviacion: real("desviacion"),
});

export const insertCargaSchema = createInsertSchema(cargas).omit({ id: true });
export type InsertCarga = z.infer<typeof insertCargaSchema>;
export type Carga = typeof cargas.$inferSelect;

export const desviacionChecks = pgTable("desviacion_checks", {
  id: serial("id").primaryKey(),
  fleetNum: text("fleet_num").notNull(),
  tipo: text("tipo").notNull(),
  gestionado: boolean("gestionado").notNull().default(false),
  gestionadoAt: text("gestionado_at"),
  nota: text("nota"),
}, (table) => [
  unique("desviacion_checks_fleet_tipo").on(table.fleetNum, table.tipo),
]);

export const insertDesviacionCheckSchema = createInsertSchema(desviacionChecks).omit({ id: true });
export type InsertDesviacionCheck = z.infer<typeof insertDesviacionCheckSchema>;
export type DesviacionCheck = typeof desviacionChecks.$inferSelect;


export const parametros = pgTable("parametros", {
  clave: varchar("clave", { length: 50 }).primaryKey(),
  valor: varchar("valor", { length: 200 }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertParametroSchema = createInsertSchema(parametros);
export type InsertParametro = z.infer<typeof insertParametroSchema>;
export type Parametro = typeof parametros.$inferSelect;

export const puntosRuta = pgTable("puntos_ruta", {
  id: serial("id").primaryKey(),
  camionId: integer("camion_id").references(() => camiones.id),
  lat: numeric("lat", { precision: 10, scale: 7 }).notNull(),
  lng: numeric("lng", { precision: 10, scale: 7 }).notNull(),
  tipo: varchar("tipo", { length: 20 }),
  nombreInferido: varchar("nombre_inferido", { length: 200 }),
  duracionMin: integer("duracion_min"),
  fecha: timestamp("fecha"),
  confirmado: boolean("confirmado").default(false),
  confirmadoPor: varchar("confirmado_por", { length: 80 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPuntoRutaSchema = createInsertSchema(puntosRuta).omit({ id: true, createdAt: true });
export type InsertPuntoRuta = z.infer<typeof insertPuntoRutaSchema>;
export type PuntoRuta = typeof puntosRuta.$inferSelect;

export const tarifasRuta = pgTable("tarifas_ruta", {
  id: serial("id").primaryKey(),
  nombreRuta: varchar("nombre_ruta", { length: 200 }).notNull(),
  puntoOrigenId: integer("punto_origen_id"),
  puntoDestinoId: integer("punto_destino_id"),
  origenNombre: varchar("origen_nombre", { length: 200 }),
  destinoNombre: varchar("destino_nombre", { length: 200 }),
  distanciaKm: numeric("distancia_km", { precision: 8, scale: 1 }),
  litrosPromedio: numeric("litros_promedio", { precision: 8, scale: 2 }),
  tiempoHoras: numeric("tiempo_horas", { precision: 5, scale: 2 }),
  tarifaClp: numeric("tarifa_clp", { precision: 12, scale: 0 }),
  tarifaUsd: numeric("tarifa_usd", { precision: 10, scale: 2 }),
  notas: text("notas"),
  activa: boolean("activa").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTarifaRutaSchema = createInsertSchema(tarifasRuta).omit({ id: true, createdAt: true });
export type InsertTarifaRuta = z.infer<typeof insertTarifaRutaSchema>;
export type TarifaRuta = typeof tarifasRuta.$inferSelect;

export const tmsContratos = pgTable("tms_contratos", {
  id: serial("id").primaryKey(),
  faenaId: integer("faena_id").references(() => faenas.id),
  nombre: varchar("nombre", { length: 200 }).notNull(),
  cliente: varchar("cliente", { length: 200 }),
  descripcion: text("descripcion"),
  fechaInicio: date("fecha_inicio").default("2026-03-01"),
  activo: boolean("activo").default(true),
  totalViajes: integer("total_viajes").default(0),
  kmTotal: numeric("km_total", { precision: 12, scale: 1 }).default("0"),
  litrosTotal: numeric("litros_total", { precision: 12, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTmsContratoSchema = createInsertSchema(tmsContratos).omit({ id: true, createdAt: true });
export type InsertTmsContrato = z.infer<typeof insertTmsContratoSchema>;
export type TmsContrato = typeof tmsContratos.$inferSelect;

export const tmsViajes = pgTable("tms_viajes", {
  id: serial("id").primaryKey(),
  contratoId: integer("contrato_id").references(() => tmsContratos.id),
  camionId: integer("camion_id").references(() => camiones.id),
  codigo: varchar("codigo", { length: 30 }).notNull().unique(),
  conductor: varchar("conductor", { length: 100 }),
  origenNombre: varchar("origen_nombre", { length: 200 }),
  origenLat: numeric("origen_lat", { precision: 10, scale: 7 }),
  origenLng: numeric("origen_lng", { precision: 10, scale: 7 }),
  destinoNombre: varchar("destino_nombre", { length: 200 }),
  destinoLat: numeric("destino_lat", { precision: 10, scale: 7 }),
  destinoLng: numeric("destino_lng", { precision: 10, scale: 7 }),
  fechaSalida: timestamp("fecha_salida"),
  fechaLlegada: timestamp("fecha_llegada"),
  fechaCierre: timestamp("fecha_cierre"),
  estado: varchar("estado", { length: 20 }).notNull().default("DETECTADO"),
  kmInicio: numeric("km_inicio", { precision: 10, scale: 1 }),
  kmCierre: numeric("km_cierre", { precision: 10, scale: 1 }),
  kmRecorridos: numeric("km_recorridos", { precision: 10, scale: 1 }),
  litrosSigetra: numeric("litros_sigetra", { precision: 8, scale: 2 }),
  litrosEcu: numeric("litros_ecu", { precision: 8, scale: 2 }),
  diferenciaLitros: numeric("diferencia_litros", { precision: 8, scale: 2 }),
  rendimientoReal: numeric("rendimiento_real", { precision: 6, scale: 2 }),
  detectadoPorIa: boolean("detectado_por_ia").default(false),
  confirmado: boolean("confirmado").default(false),
  notas: text("notas"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTmsViajeSchema = createInsertSchema(tmsViajes).omit({ id: true, createdAt: true });
export type InsertTmsViaje = z.infer<typeof insertTmsViajeSchema>;
export type TmsViaje = typeof tmsViajes.$inferSelect;

export const tmsParadas = pgTable("tms_paradas", {
  id: serial("id").primaryKey(),
  viajeId: integer("viaje_id").references(() => tmsViajes.id),
  orden: integer("orden").notNull(),
  nombre: varchar("nombre", { length: 200 }),
  direccion: varchar("direccion", { length: 300 }),
  lat: numeric("lat", { precision: 10, scale: 7 }),
  lng: numeric("lng", { precision: 10, scale: 7 }),
  tipo: varchar("tipo", { length: 20 }).notNull().default("ENTREGA"),
  estado: varchar("estado", { length: 20 }).notNull().default("PENDIENTE"),
  horaEstimada: timestamp("hora_estimada"),
  horaReal: timestamp("hora_real"),
  notas: text("notas"),
});

export const insertTmsParadaSchema = createInsertSchema(tmsParadas).omit({ id: true });
export type InsertTmsParada = z.infer<typeof insertTmsParadaSchema>;
export type TmsParada = typeof tmsParadas.$inferSelect;

export const tmsPuntos = pgTable("tms_puntos", {
  id: serial("id").primaryKey(),
  contratoId: integer("contrato_id").references(() => tmsContratos.id),
  camionId: integer("camion_id").references(() => camiones.id),
  lat: numeric("lat", { precision: 10, scale: 7 }).notNull(),
  lng: numeric("lng", { precision: 10, scale: 7 }).notNull(),
  nombreInferido: varchar("nombre_inferido", { length: 200 }),
  tipo: varchar("tipo", { length: 20 }),
  vecesVisitado: integer("veces_visitado").default(1),
  duracionPromedioMin: integer("duracion_promedio_min"),
  primeraVisita: timestamp("primera_visita"),
  ultimaVisita: timestamp("ultima_visita"),
  confirmado: boolean("confirmado").default(false),
})

export const insertTmsPuntoSchema = createInsertSchema(tmsPuntos).omit({ id: true });
export type InsertTmsPunto = z.infer<typeof insertTmsPuntoSchema>;
export type TmsPunto = typeof tmsPuntos.$inferSelect;

// ═══════════════════════════════════════════════════
// GEOVALIDATOR TABLES
// ═══════════════════════════════════════════════════

export const geoTrayectorias = pgTable("geo_trayectorias", {
  id: serial("id").primaryKey(),
  camionId: integer("camion_id").references(() => camiones.id),
  patente: varchar("patente", { length: 20 }).notNull(),
  fechaInicio: timestamp("fecha_inicio").notNull(),
  fechaFin: timestamp("fecha_fin"),
  estado: varchar("estado", { length: 20 }).default("ACTIVA"),
  totalPuntos: integer("total_puntos").default(0),
  kmCalculados: numeric("km_calculados", { precision: 10, scale: 2 }).default("0"),
  creadaAt: timestamp("creada_at").defaultNow(),
});

export const insertGeoTrayectoriaSchema = createInsertSchema(geoTrayectorias).omit({ id: true });
export type InsertGeoTrayectoria = z.infer<typeof insertGeoTrayectoriaSchema>;
export type GeoTrayectoria = typeof geoTrayectorias.$inferSelect;

export const geoPuntos = pgTable("geo_puntos", {
  id: serial("id").primaryKey(),
  trayectoriaId: integer("trayectoria_id").references(() => geoTrayectorias.id),
  camionId: integer("camion_id").references(() => camiones.id),
  patente: varchar("patente", { length: 20 }),
  lat: numeric("lat", { precision: 10, scale: 7 }).notNull(),
  lng: numeric("lng", { precision: 10, scale: 7 }).notNull(),
  timestampPunto: timestamp("timestamp_punto").notNull(),
  velocidadKmh: numeric("velocidad_kmh", { precision: 6, scale: 1 }).default("0"),
  rumboGrados: numeric("rumbo_grados", { precision: 5, scale: 1 }),
  kmOdometro: numeric("km_odometro", { precision: 10, scale: 1 }),
  fuente: varchar("fuente", { length: 20 }).default("WISETRACK"),
  creadoAt: timestamp("creado_at").defaultNow(),
});

export const insertGeoPuntoSchema = createInsertSchema(geoPuntos).omit({ id: true });
export type InsertGeoPunto = z.infer<typeof insertGeoPuntoSchema>;
export type GeoPunto = typeof geoPuntos.$inferSelect;

export const geoViajes = pgTable("geo_viajes", {
  id: serial("id").primaryKey(),
  camionId: integer("camion_id").references(() => camiones.id),
  patente: varchar("patente", { length: 20 }).notNull(),
  contrato: varchar("contrato", { length: 100 }),
  origenLat: numeric("origen_lat", { precision: 10, scale: 7 }),
  origenLng: numeric("origen_lng", { precision: 10, scale: 7 }),
  origenNombre: varchar("origen_nombre", { length: 200 }),
  origenTimestamp: timestamp("origen_timestamp"),
  destinoLat: numeric("destino_lat", { precision: 10, scale: 7 }),
  destinoLng: numeric("destino_lng", { precision: 10, scale: 7 }),
  destinoNombre: varchar("destino_nombre", { length: 200 }),
  destinoTimestamp: timestamp("destino_timestamp"),
  paradas: jsonb("paradas").default([]),
  kmGps: numeric("km_gps", { precision: 10, scale: 2 }),
  kmOdometroInicio: numeric("km_odometro_inicio", { precision: 10, scale: 1 }),
  kmOdometroFin: numeric("km_odometro_fin", { precision: 10, scale: 1 }),
  kmOdometroDelta: numeric("km_odometro_delta", { precision: 10, scale: 1 }),
  duracionMinutos: integer("duracion_minutos"),
  velocidadPromedio: numeric("velocidad_promedio", { precision: 6, scale: 1 }),
  velocidadMaxima: numeric("velocidad_maxima", { precision: 6, scale: 1 }),
  tiempoDetenidoMin: integer("tiempo_detenido_min").default(0),
  tiempoMovimientoMin: integer("tiempo_movimiento_min").default(0),
  validacionEstado: varchar("validacion_estado", { length: 20 }).default("PENDIENTE"),
  validacionDetalle: jsonb("validacion_detalle"),
  sigetraCargaId: integer("sigetra_carga_id"),
  sigetraKmDeltaPct: numeric("sigetra_km_delta_pct", { precision: 5, scale: 2 }),
  sigetraSurtidorEnRuta: boolean("sigetra_surtidor_en_ruta"),
  sigetraLitros: numeric("sigetra_litros", { precision: 8, scale: 2 }),
  validadoManualmente: boolean("validado_manualmente").default(false),
  validadoPor: varchar("validado_por", { length: 100 }),
  notas: text("notas"),
  trayectoriaId: integer("trayectoria_id").references(() => geoTrayectorias.id),
  destinoLugarId: integer("destino_lugar_id"),
  origenLugarId: integer("origen_lugar_id"),
  paradasLugares: jsonb("paradas_lugares").default([]),
  creadoAt: timestamp("creado_at").defaultNow(),
  actualizadoAt: timestamp("actualizado_at").defaultNow(),
});

export const insertGeoViajeSchema = createInsertSchema(geoViajes).omit({ id: true });
export type InsertGeoViaje = z.infer<typeof insertGeoViajeSchema>;
export type GeoViaje = typeof geoViajes.$inferSelect;

export const geoBases = pgTable("geo_bases", {
  id: serial("id").primaryKey(),
  nombre: varchar("nombre", { length: 200 }).notNull(),
  lat: numeric("lat", { precision: 10, scale: 7 }).notNull(),
  lng: numeric("lng", { precision: 10, scale: 7 }).notNull(),
  radioMetros: integer("radio_metros").default(3000),
  contrato: varchar("contrato", { length: 100 }),
  activa: boolean("activa").default(true),
});

export const insertGeoBaseSchema = createInsertSchema(geoBases).omit({ id: true });
export type InsertGeoBase = z.infer<typeof insertGeoBaseSchema>;
export type GeoBase = typeof geoBases.$inferSelect;

export const geoGeocache = pgTable("geo_geocache", {
  id: serial("id").primaryKey(),
  lat: numeric("lat", { precision: 10, scale: 5 }).notNull(),
  lng: numeric("lng", { precision: 10, scale: 5 }).notNull(),
  nombre: varchar("nombre", { length: 300 }),
  ciudad: varchar("ciudad", { length: 100 }),
  region: varchar("region", { length: 100 }),
  creadoAt: timestamp("creado_at").defaultNow(),
});

export const geoLugares = pgTable("geo_lugares", {
  id: serial("id").primaryKey(),
  nombre: varchar("nombre", { length: 200 }),
  nombreConfirmado: varchar("nombre_confirmado", { length: 200 }),
  tipo: varchar("tipo", { length: 50 }),
  lat: numeric("lat", { precision: 10, scale: 7 }).notNull(),
  lng: numeric("lng", { precision: 10, scale: 7 }).notNull(),
  radioMetros: integer("radio_metros").default(500),
  direccion: varchar("direccion", { length: 300 }),
  comuna: varchar("comuna", { length: 100 }),
  region: varchar("region", { length: 100 }),
  detectadoVia: varchar("detectado_via", { length: 50 }),
  confianzaPct: integer("confianza_pct").default(0),
  vecesVisitado: integer("veces_visitado").default(0),
  primeraVisita: date("primera_visita"),
  ultimaVisita: date("ultima_visita"),
  confirmado: boolean("confirmado").default(false),
  activo: boolean("activo").default(true),
  creadoAt: timestamp("creado_at").defaultNow(),
});

export const insertGeoLugarSchema = createInsertSchema(geoLugares).omit({ id: true });
export type InsertGeoLugar = z.infer<typeof insertGeoLugarSchema>;
export type GeoLugar = typeof geoLugares.$inferSelect;

export const geoVisitas = pgTable("geo_visitas", {
  id: serial("id").primaryKey(),
  lugarId: integer("lugar_id").references(() => geoLugares.id),
  camionId: integer("camion_id").references(() => camiones.id),
  patente: varchar("patente", { length: 20 }),
  viajeId: integer("viaje_id").references(() => geoViajes.id),
  llegada: timestamp("llegada"),
  salida: timestamp("salida"),
  minutosDetenido: integer("minutos_detenido"),
  latExacta: numeric("lat_exacta", { precision: 10, scale: 7 }),
  lngExacta: numeric("lng_exacta", { precision: 10, scale: 7 }),
  creadoAt: timestamp("creado_at").defaultNow(),
});

export const insertGeoVisitaSchema = createInsertSchema(geoVisitas).omit({ id: true });
export type InsertGeoVisita = z.infer<typeof insertGeoVisitaSchema>;
export type GeoVisita = typeof geoVisitas.$inferSelect;

export const geoAnalisisIa = pgTable("geo_analisis_ia", {
  id: serial("id").primaryKey(),
  tipo: varchar("tipo", { length: 50 }),
  periodoDesde: date("periodo_desde"),
  periodoHasta: date("periodo_hasta"),
  resultadoJson: jsonb("resultado_json"),
  resumenTexto: text("resumen_texto"),
  generadoAt: timestamp("generado_at").defaultNow(),
});

export const insertGeoAnalisisIaSchema = createInsertSchema(geoAnalisisIa).omit({ id: true });
export type InsertGeoAnalisisIa = z.infer<typeof insertGeoAnalisisIaSchema>;
export type GeoAnalisisIa = typeof geoAnalisisIa.$inferSelect;

// ═══════════════════════════════════════════════════
// SISTEMA DE APRENDIZAJE DE VIAJES
// ═══════════════════════════════════════════════════

export const corredores = pgTable("corredores", {
  id: serial("id").primaryKey(),
  nombre: varchar("nombre", { length: 200 }).notNull(),
  contrato: varchar("contrato", { length: 100 }).notNull(),
  origenNombre: varchar("origen_nombre", { length: 200 }),
  destinoNombre: varchar("destino_nombre", { length: 200 }),
  origenLat: numeric("origen_lat", { precision: 10, scale: 7 }),
  origenLng: numeric("origen_lng", { precision: 10, scale: 7 }),
  destinoLat: numeric("destino_lat", { precision: 10, scale: 7 }),
  destinoLng: numeric("destino_lng", { precision: 10, scale: 7 }),
  radioToleranciaKm: numeric("radio_tolerancia_km", { precision: 6, scale: 1 }).default("15"),
  rendimientoPromedio: numeric("rendimiento_promedio", { precision: 6, scale: 2 }),
  rendimientoDesviacion: numeric("rendimiento_desviacion", { precision: 6, scale: 2 }),
  kmPromedio: numeric("km_promedio", { precision: 10, scale: 1 }),
  duracionPromedioMin: integer("duracion_promedio_min"),
  totalViajesBase: integer("total_viajes_base").default(0),
  activo: boolean("activo").default(true),
  creadoAt: timestamp("creado_at").defaultNow(),
  actualizadoAt: timestamp("actualizado_at").defaultNow(),
});

export const insertCorredorSchema = createInsertSchema(corredores).omit({ id: true, creadoAt: true, actualizadoAt: true });
export type InsertCorredor = z.infer<typeof insertCorredorSchema>;
export type Corredor = typeof corredores.$inferSelect;

export const viajesAprendizaje = pgTable("viajes_aprendizaje", {
  id: serial("id").primaryKey(),
  camionId: integer("camion_id").references(() => camiones.id),
  vin: varchar("vin", { length: 30 }),
  corredorId: integer("corredor_id").references(() => corredores.id),
  contrato: varchar("contrato", { length: 100 }),
  fechaInicio: timestamp("fecha_inicio").notNull(),
  fechaFin: timestamp("fecha_fin").notNull(),
  origenLat: numeric("origen_lat", { precision: 10, scale: 7 }),
  origenLng: numeric("origen_lng", { precision: 10, scale: 7 }),
  origenNombre: varchar("origen_nombre", { length: 200 }),
  destinoLat: numeric("destino_lat", { precision: 10, scale: 7 }),
  destinoLng: numeric("destino_lng", { precision: 10, scale: 7 }),
  destinoNombre: varchar("destino_nombre", { length: 200 }),
  kmEcu: numeric("km_ecu", { precision: 10, scale: 1 }),
  kmDeclaradoSigetra: numeric("km_declarado_sigetra", { precision: 10, scale: 1 }),
  litrosConsumidosEcu: numeric("litros_consumidos_ecu", { precision: 8, scale: 2 }),
  litrosCargadosSigetra: numeric("litros_cargados_sigetra", { precision: 8, scale: 2 }),
  rendimientoReal: numeric("rendimiento_real", { precision: 6, scale: 2 }),
  conductor: varchar("conductor", { length: 100 }),
  paradas: jsonb("paradas").default([]),
  scoreAnomalia: integer("score_anomalia").default(0),
  estado: varchar("estado", { length: 20 }).default("NORMAL"),
  duracionMinutos: integer("duracion_minutos"),
  velocidadPromedio: numeric("velocidad_promedio", { precision: 6, scale: 1 }),
  velocidadMaxima: numeric("velocidad_maxima", { precision: 6, scale: 1 }),
  fuenteViaje: varchar("fuente_viaje", { length: 20 }).default("WISETRACK"),
  procesadoAprendizaje: boolean("procesado_aprendizaje").default(false),
  creadoAt: timestamp("creado_at").defaultNow(),
  sigetraCruzado: boolean("sigetra_cruzado").default(false),
  deltaCuadratura: numeric("delta_cuadratura", { precision: 8, scale: 2 }),
  fechaCruceSigetra: timestamp("fecha_cruce_sigetra"),
});

export const insertViajeAprendizajeSchema = createInsertSchema(viajesAprendizaje).omit({ id: true, creadoAt: true });
export type InsertViajeAprendizaje = z.infer<typeof insertViajeAprendizajeSchema>;
export type ViajeAprendizaje = typeof viajesAprendizaje.$inferSelect;

export const viajeParadas = pgTable("viaje_paradas", {
  id: serial("id").primaryKey(),
  viajeId: integer("viaje_id").notNull(),
  orden: integer("orden").notNull(),
  nombre: varchar("nombre", { length: 200 }).notNull(),
  direccion: varchar("direccion", { length: 300 }),
  lat: numeric("lat", { precision: 10, scale: 7 }),
  lng: numeric("lng", { precision: 10, scale: 7 }),
  tipo: varchar("tipo", { length: 20 }).notNull().default("ENTREGA"),
  estado: varchar("estado", { length: 20 }).notNull().default("PENDIENTE"),
  horaEstimada: timestamp("hora_estimada"),
  horaReal: timestamp("hora_real"),
  notas: text("notas"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertViajeParadaSchema = createInsertSchema(viajeParadas).omit({ id: true, createdAt: true });
export type InsertViajeParada = z.infer<typeof insertViajeParadaSchema>;
export type ViajeParada = typeof viajeParadas.$inferSelect;

export const conductoresPerfil = pgTable("conductores_perfil", {
  id: serial("id").primaryKey(),
  nombre: varchar("nombre", { length: 200 }).notNull().unique(),
  contrato: varchar("contrato", { length: 100 }),
  totalJornadas: integer("total_jornadas").default(0),
  kmTotal: numeric("km_total", { precision: 12, scale: 1 }).default("0"),
  litrosTotalEcu: numeric("litros_total_ecu", { precision: 12, scale: 2 }).default("0"),
  rendimientoPromedio: numeric("rendimiento_promedio", { precision: 6, scale: 2 }),
  rendimientoDesviacion: numeric("rendimiento_desviacion", { precision: 6, scale: 2 }),
  velocidadMaxRegistrada: numeric("velocidad_max_registrada", { precision: 6, scale: 1 }),
  horasTotalActivo: numeric("horas_total_activo", { precision: 10, scale: 2 }).default("0"),
  rutasFrecuentes: jsonb("rutas_frecuentes").default([]),
  scoreComportamiento: numeric("score_comportamiento", { precision: 6, scale: 2 }).default("0"),
  tendencia: varchar("tendencia", { length: 20 }).default("ESTABLE"),
  ultimaJornada: timestamp("ultima_jornada"),
  primeraJornada: timestamp("primera_jornada"),
  creadoAt: timestamp("creado_at").defaultNow(),
});

export const insertConductorPerfilSchema = createInsertSchema(conductoresPerfil).omit({ id: true, creadoAt: true });
export type InsertConductorPerfil = z.infer<typeof insertConductorPerfilSchema>;
export type ConductorPerfil = typeof conductoresPerfil.$inferSelect;

export const camionesPerfil = pgTable("camiones_perfil", {
  id: serial("id").primaryKey(),
  camionId: integer("camion_id").references(() => camiones.id),
  patente: varchar("patente", { length: 10 }).unique(),
  vin: varchar("vin", { length: 30 }),
  contrato: varchar("contrato", { length: 100 }),
  totalJornadas: integer("total_jornadas").default(0),
  kmTotal: numeric("km_total", { precision: 12, scale: 1 }).default("0"),
  litrosTotalEcu: numeric("litros_total_ecu", { precision: 12, scale: 2 }).default("0"),
  rendimientoPromedio: numeric("rendimiento_promedio", { precision: 6, scale: 2 }),
  rendimientoDesviacion: numeric("rendimiento_desviacion", { precision: 6, scale: 2 }),
  rendimientoMeta: numeric("rendimiento_meta", { precision: 6, scale: 2 }),
  velocidadMaxRegistrada: numeric("velocidad_max_registrada", { precision: 6, scale: 1 }),
  horasMotorTotal: numeric("horas_motor_total", { precision: 10, scale: 2 }).default("0"),
  horasRalentiTotal: numeric("horas_ralenti_total", { precision: 10, scale: 2 }).default("0"),
  pctRalentiPromedio: numeric("pct_ralenti_promedio", { precision: 5, scale: 2 }),
  rutasFrecuentes: jsonb("rutas_frecuentes").default([]),
  conductoresFrecuentes: jsonb("conductores_frecuentes").default([]),
  scoreRendimiento: numeric("score_rendimiento", { precision: 6, scale: 2 }).default("0"),
  tendencia: varchar("tendencia", { length: 20 }).default("ESTABLE"),
  ultimaJornada: timestamp("ultima_jornada"),
  primeraJornada: timestamp("primera_jornada"),
  creadoAt: timestamp("creado_at").defaultNow(),
});

export const insertCamionPerfilSchema = createInsertSchema(camionesPerfil).omit({ id: true, creadoAt: true });
export type InsertCamionPerfil = z.infer<typeof insertCamionPerfilSchema>;
export type CamionPerfil = typeof camionesPerfil.$inferSelect;

export const patronesCargaCombustible = pgTable("patrones_carga_combustible", {
  id: serial("id").primaryKey(),
  scopeTipo: varchar("scope_tipo", { length: 30 }).notNull(),
  scopeId: varchar("scope_id", { length: 100 }).notNull(),
  patente: varchar("patente", { length: 20 }),
  estacionNombre: varchar("estacion_nombre", { length: 300 }),
  contrato: varchar("contrato", { length: 100 }),
  cargaTipica: numeric("carga_tipica", { precision: 8, scale: 2 }),
  cargaDesviacion: numeric("carga_desviacion", { precision: 8, scale: 2 }),
  cargaMinima: numeric("carga_minima", { precision: 8, scale: 2 }),
  cargaMaxima: numeric("carga_maxima", { precision: 8, scale: 2 }),
  totalCargas: integer("total_cargas").default(0),
  confianza: varchar("confianza", { length: 20 }).default("BAJA"),
  ultimaCarga: timestamp("ultima_carga"),
  ultimaActualizacion: timestamp("ultima_actualizacion").defaultNow(),
  activo: boolean("activo").default(true),
});

export const insertPatronCargaSchema = createInsertSchema(patronesCargaCombustible).omit({ id: true, ultimaActualizacion: true });
export type InsertPatronCarga = z.infer<typeof insertPatronCargaSchema>;
export type PatronCargaCombustible = typeof patronesCargaCombustible.$inferSelect;

export const parametrosAdaptativos = pgTable("parametros_adaptativos", {
  id: serial("id").primaryKey(),
  scopeTipo: varchar("scope_tipo", { length: 30 }).notNull(),
  scopeId: varchar("scope_id", { length: 50 }).notNull(),
  parametro: varchar("parametro", { length: 50 }).notNull(),
  valorPromedio: numeric("valor_promedio", { precision: 10, scale: 4 }).notNull(),
  valorDesviacion: numeric("valor_desviacion", { precision: 10, scale: 4 }).notNull(),
  valorMinimo: numeric("valor_minimo", { precision: 10, scale: 4 }),
  valorMaximo: numeric("valor_maximo", { precision: 10, scale: 4 }),
  umbralRevisar: numeric("umbral_revisar", { precision: 10, scale: 4 }),
  umbralAnomalia: numeric("umbral_anomalia", { precision: 10, scale: 4 }),
  umbralCritico: numeric("umbral_critico", { precision: 10, scale: 4 }),
  totalMuestras: integer("total_muestras").default(0),
  confianza: varchar("confianza", { length: 20 }).default("BAJA"),
  ultimaActualizacion: timestamp("ultima_actualizacion").defaultNow(),
  activo: boolean("activo").default(true),
});

export const insertParametroAdaptativoSchema = createInsertSchema(parametrosAdaptativos).omit({ id: true, ultimaActualizacion: true });
export type InsertParametroAdaptativo = z.infer<typeof insertParametroAdaptativoSchema>;
export type ParametroAdaptativo = typeof parametrosAdaptativos.$inferSelect;

export const alertasAprendizaje = pgTable("alertas_aprendizaje", {
  id: serial("id").primaryKey(),
  tipo: varchar("tipo", { length: 50 }).notNull(),
  entidadTipo: varchar("entidad_tipo", { length: 30 }).notNull(),
  entidadNombre: varchar("entidad_nombre", { length: 200 }).notNull(),
  contrato: varchar("contrato", { length: 100 }),
  descripcion: text("descripcion").notNull(),
  valorReciente: numeric("valor_reciente", { precision: 10, scale: 4 }),
  valorHistorico: numeric("valor_historico", { precision: 10, scale: 4 }),
  diferenciaPct: numeric("diferencia_pct", { precision: 8, scale: 2 }),
  gestionado: boolean("gestionado").default(false),
  nota: text("nota"),
  fecha: timestamp("fecha").defaultNow(),
});

export const insertAlertaAprendizajeSchema = createInsertSchema(alertasAprendizaje).omit({ id: true, fecha: true });
export type InsertAlertaAprendizaje = z.infer<typeof insertAlertaAprendizajeSchema>;
export type AlertaAprendizaje = typeof alertasAprendizaje.$inferSelect;

export const parametrosScoreConduccion = pgTable("parametros_score_conduccion", {
  id: serial("id").primaryKey(),
  scopeTipo: text("scope_tipo").notNull(),
  scopeId: text("scope_id").notNull(),
  parametro: text("parametro").notNull(),
  p25: real("p25"),
  p50: real("p50"),
  p75: real("p75"),
  p90: real("p90"),
  umbralCritico: real("umbral_critico"),
  umbralMalo: real("umbral_malo"),
  umbralAceptable: real("umbral_aceptable"),
  umbralBueno: real("umbral_bueno"),
  promedioFlota: real("promedio_flota"),
  desviacionFlota: real("desviacion_flota"),
  totalMuestras: integer("total_muestras").default(0),
  confianza: text("confianza").default("BAJA"),
  ultimaActualizacion: timestamp("ultima_actualizacion").defaultNow(),
}, (table) => [
  unique("psc_scope_param").on(table.scopeTipo, table.scopeId, table.parametro),
]);

export const insertParametroScoreConduccionSchema = createInsertSchema(parametrosScoreConduccion).omit({ id: true, ultimaActualizacion: true });
export type InsertParametroScoreConduccion = z.infer<typeof insertParametroScoreConduccionSchema>;
export type ParametroScoreConduccion = typeof parametrosScoreConduccion.$inferSelect;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const feedbackAlertas = pgTable("feedback_alertas", {
  id: serial("id").primaryKey(),
  alertaTipo: text("alerta_tipo").notNull(),
  entidadTipo: text("entidad_tipo").notNull().default("CAMION"),
  entidadId: text("entidad_id").notNull(),
  contrato: text("contrato"),
  decision: text("decision").notNull(),
  nota: text("nota"),
  valorDetectado: text("valor_detectado"),
  umbralUsado: text("umbral_usado"),
  parametroAfectado: text("parametro_afectado"),
  creadoEn: timestamp("creado_en").defaultNow(),
});

export const insertFeedbackAlertaSchema = createInsertSchema(feedbackAlertas).omit({ id: true, creadoEn: true });
export type InsertFeedbackAlerta = z.infer<typeof insertFeedbackAlertaSchema>;
export type FeedbackAlerta = typeof feedbackAlertas.$inferSelect;

export const reportesSistema = pgTable("reportes_sistema", {
  id: serial("id").primaryKey(),
  semana: text("semana").notNull(),
  aprendi: text("aprendi"),
  corregi: text("corregi"),
  preocupa: text("preocupa"),
  necesito: text("necesito"),
  proximos: text("proximos"),
  generadoEn: timestamp("generado_en").defaultNow(),
});

export const insertReporteSistemaSchema = createInsertSchema(reportesSistema).omit({ id: true, generadoEn: true });
export type InsertReporteSistema = z.infer<typeof insertReporteSistemaSchema>;
export type ReporteSistema = typeof reportesSistema.$inferSelect;

export const aprendizajeFeedback = pgTable("aprendizaje_feedback", {
  id: serial("id").primaryKey(),
  inconsistenciaId: text("inconsistencia_id").notNull(),
  tipo: text("tipo").notNull(),
  accion: text("accion").notNull(),
  nota: text("nota"),
  valorNuevo: text("valor_nuevo"),
  contrato: text("contrato"),
  aplicado: boolean("aplicado").default(false),
  creadoEn: timestamp("creado_en").defaultNow(),
});

export const insertAprendizajeFeedbackSchema = createInsertSchema(aprendizajeFeedback).omit({ id: true, creadoEn: true });
export type InsertAprendizajeFeedback = z.infer<typeof insertAprendizajeFeedbackSchema>;
export type AprendizajeFeedback = typeof aprendizajeFeedback.$inferSelect;

// ═══════════════════════════════════════════════════
// CORREDORES OPERACIONALES — Análisis de Rutas
// ═══════════════════════════════════════════════════

export const corredoresOperacionales = pgTable("corredores_operacionales", {
  id: serial("id").primaryKey(),

  // Identidad
  nombre: text("nombre"),
  contrato: text("contrato").notNull(),

  // Zona origen
  origenNombre: text("origen_nombre"),
  origenLat: real("origen_lat"),
  origenLng: real("origen_lng"),
  origenRadioKm: real("origen_radio_km").default(5),

  // Zona destino
  destinoNombre: text("destino_nombre"),
  destinoLat: real("destino_lat"),
  destinoLng: real("destino_lng"),
  destinoRadioKm: real("destino_radio_km").default(30),

  // Criterios de match
  distanciaPromedioKm: real("distancia_promedio_km"),
  distanciaTolerancia: real("distancia_tolerancia_pct").default(15),

  // Estadísticas acumuladas
  totalViajes: integer("total_viajes").default(0),
  totalCamiones: integer("total_camiones").default(0),
  kmTotal: real("km_total").default(0),
  rendimientoPromedio: real("rendimiento_promedio"),
  rendimientoMejor: real("rendimiento_mejor"),
  rendimientoPeor: real("rendimiento_peor"),
  rendimientoDesviacion: real("rendimiento_desviacion"),

  // Estado
  activo: boolean("activo").default(true),
  creadoManual: boolean("creado_manual").default(false),
  ultimaActualizacion: timestamp("ultima_actualizacion").defaultNow(),
  creadoAt: timestamp("creado_at").defaultNow(),
});

export const insertCorredorOperacionalSchema = createInsertSchema(corredoresOperacionales).omit({ id: true, creadoAt: true });
export type InsertCorredorOperacional = z.infer<typeof insertCorredorOperacionalSchema>;
export type CorredorOperacional = typeof corredoresOperacionales.$inferSelect;

export const viajesCorredor = pgTable("viajes_corredor", {
  id: serial("id").primaryKey(),
  corredorId: integer("corredor_id").notNull().references(() => corredoresOperacionales.id),
  viajeId: integer("viaje_id").notNull(),
  patente: text("patente").notNull(),
  conductor: text("conductor"),
  contrato: text("contrato"),

  fecha: date("fecha").notNull(),
  kmEcu: real("km_ecu"),
  litrosEcu: real("litros_ecu"),
  rendimiento: real("rendimiento"),
  duracionHoras: real("duracion_horas"),

  paradasJson: jsonb("paradas_json").default([]),
  creadoAt: timestamp("creado_at").defaultNow(),
}, (t) => [unique().on(t.viajeId)]);

export const insertViajeCorredor = createInsertSchema(viajesCorredor).omit({ id: true, creadoAt: true });
export type InsertViajeCorredor = z.infer<typeof insertViajeCorredor>;
export type ViajeCorredor = typeof viajesCorredor.$inferSelect;

// ═══════════════════════════════════════════════════
// OPERACIONES CERRADAS — Motor de cierre automático
// ═══════════════════════════════════════════════════

export const operacionesCerradas = pgTable("operaciones_cerradas", {
  id: serial("id").primaryKey(),

  patente: text("patente").notNull(),
  vin: text("vin"),
  conductor: text("conductor"),
  contrato: text("contrato"),

  // Par de cargas
  cargaAId: integer("carga_a_id"),
  cargaAFecha: timestamp("carga_a_fecha"),
  cargaALitros: real("carga_a_litros"),
  cargaAEstacion: text("carga_a_estacion"),

  cargaBId: integer("carga_b_id"),
  cargaBFecha: timestamp("carga_b_fecha"),
  cargaBLitros: real("carga_b_litros"),
  cargaBEstacion: text("carga_b_estacion"),

  // Período calculado
  horasPeriodo: real("horas_periodo"),
  kmEcu: real("km_ecu"),
  litrosConsumidosEcu: real("litros_consumidos_ecu"),
  rendimientoEcu: real("rendimiento_ecu"),

  // Balance
  litrosCargados: real("litros_cargados"),
  balanceLitros: real("balance_litros"),
  balancePct: real("balance_pct"),

  // Calidad
  snapCount: integer("snap_count"),
  coberturaPct: real("cobertura_pct"),
  calidadDatos: text("calidad_datos"),

  // Evaluación
  nivelAnomalia: text("nivel_anomalia").default("NORMAL"),
  revisado: boolean("revisado").default(false),
  decisionCeo: text("decision_ceo"),

  creadoAt: timestamp("creado_at").defaultNow(),
}, (t) => [unique().on(t.cargaAId)]);

export type OperacionCerrada = typeof operacionesCerradas.$inferSelect;

// ═══════════════════════════════════════════════════
// SUPERVISIÓN PREDICTIVA — Antes/Después del snapshot
// ═══════════════════════════════════════════════════
export const estadoCamionEsperado = pgTable("estado_camion_esperado", {
  id: serial("id").primaryKey(),
  patente: text("patente").notNull(),
  vin: text("vin"),
  contrato: text("contrato"),
  fecha: date("fecha").notNull(),
  debeEstarActivo: boolean("debe_estar_activo"),
  kmEsperadoDia: real("km_esperado_dia"),
  rendimientoEsperado: real("rendimiento_esperado"),
  corredorProbable: text("corredor_probable"),
  probabilidadCarga: real("probabilidad_carga"),
  kmReal: real("km_real"),
  rendimientoReal: real("rendimiento_real"),
  estuvoActivo: boolean("estuvo_activo"),
  tuvoCarga: boolean("tuvo_carga"),
  desviacionKmPct: real("desviacion_km_pct"),
  desviacionRendPct: real("desviacion_rend_pct"),
  estadoSupervision: text("estado_supervision"),
  procesado: boolean("procesado").default(false),
  creadoAt: timestamp("creado_at").defaultNow(),
}, (t) => [unique().on(t.patente, t.fecha)]);

// ═══════════════════════════════════════════════════
// IDENTIDADES DE CAMIONES
// ═══════════════════════════════════════════════════
export const wisetrackPosiciones = pgTable("wisetrack_posiciones", {
  id: serial("id").primaryKey(),
  patente: text("patente").notNull(),
  etiqueta: text("etiqueta"),
  fecha: text("fecha").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  velocidad: real("velocidad").default(0),
  direccion: integer("direccion").default(0),
  ignicion: boolean("ignicion").default(false),
  grupo1: text("grupo1"),
  conductor: text("conductor"),
  kmsTotal: real("kms_total"),
  consumoLitros: real("consumo_litros"),
  nivelEstanque: real("nivel_estanque"),
  rpm: integer("rpm"),
  tempMotor: real("temp_motor"),
  estadoOperacion: text("estado_operacion"),
  creadoAt: timestamp("creado_at").defaultNow(),
}, (t) => [unique().on(t.patente, t.fecha)]);

export const wisetrackVehiculos = pgTable("wisetrack_vehiculos", {
  movil: text("movil").primaryKey(),
  patente: text("patente").notNull(),
  grupo1: text("grupo1"),
  grupo2: text("grupo2"),
  conductor: text("conductor"),
  actualizadoAt: timestamp("actualizado_at").defaultNow(),
});

export const wisetrackTelemetria = pgTable("wisetrack_telemetria", {
  id: serial("id").primaryKey(),
  wtId: integer("wt_id").notNull().unique(),
  movil: text("movil").notNull(),
  patente: text("patente"),
  fechaHora: text("fecha_hora").notNull(),
  lat: real("lat"),
  lng: real("lng"),
  direccion: integer("direccion"),
  kms: real("kms"),
  kmsTotal: real("kms_total"),
  horometro: real("horometro"),
  nivelEstanque: real("nivel_estanque"),
  consumoConduccion: real("consumo_conduccion"),
  consumoRalenti: real("consumo_ralenti"),
  consumoTotal: real("consumo_total"),
  tiempoConduccion: integer("tiempo_conduccion"),
  tiempoRalenti: integer("tiempo_ralenti"),
  tempMotor: real("temp_motor"),
  velocidad: real("velocidad"),
  rpm: integer("rpm"),
  torque: real("torque"),
  presionAceite: real("presion_aceite"),
  idEnergia: integer("id_energia"),
  idPartida: integer("id_partida"),
  fechaInsercion: text("fecha_insercion"),
  creadoAt: timestamp("creado_at").defaultNow(),
});

export const camionIdentidades = pgTable("camion_identidades", {
  vin: text("vin").primaryKey(),
  numeroInterno: text("numero_interno"),
  patenteActual: text("patente_actual"),
  idsValidos: text("ids_validos").array(),
  idDisplay: text("id_display"),
  tipoDisplay: text("tipo_display"),
  activo: boolean("activo").default(true),
  ultimaActualizacion: timestamp("ultima_actualizacion").defaultNow(),
});
