import {
  type User, type InsertUser,
  type Faena, type InsertFaena,
  type Camion, type InsertCamion,
  type Carga, type InsertCarga,
  type DesviacionCheck, type InsertDesviacionCheck,
  type VolvoFuelSnapshot, type InsertVolvoFuelSnapshot,
  type Parametro,
  type PuntoRuta, type InsertPuntoRuta,
  type TarifaRuta, type InsertTarifaRuta,
  type TmsContrato, type InsertTmsContrato,
  type TmsViaje, type InsertTmsViaje,
  type TmsParada, type InsertTmsParada,
  type TmsPunto, type InsertTmsPunto,
  users, faenas, camiones, cargas, desviacionChecks, volvoFuelSnapshots,
  parametros, puntosRuta, tarifasRuta, tmsContratos, tmsViajes, tmsParadas, tmsPuntos,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, inArray, desc, asc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getFaenas(): Promise<Faena[]>;
  getFaena(id: number): Promise<Faena | undefined>;
  createFaena(faena: InsertFaena): Promise<Faena>;
  updateFaena(id: number, faena: Partial<InsertFaena>): Promise<Faena | undefined>;
  deleteFaena(id: number): Promise<void>;

  getCamiones(): Promise<Camion[]>;
  getCamion(id: number): Promise<Camion | undefined>;
  getCamionByVin(vin: string): Promise<Camion | undefined>;
  createCamion(camion: InsertCamion): Promise<Camion>;
  updateCamion(id: number, camion: Partial<InsertCamion>): Promise<Camion | undefined>;
  deleteCamion(id: number): Promise<void>;

  getCargas(camionId?: number): Promise<Carga[]>;
  getCargasByDateRange(from: Date, to: Date): Promise<Carga[]>;
  getCarga(id: number): Promise<Carga | undefined>;
  createCarga(carga: InsertCarga): Promise<Carga>;
  deleteCarga(id: number): Promise<void>;

  getDesviacionChecks(): Promise<DesviacionCheck[]>;
  upsertDesviacionCheck(fleetNum: string, tipo: string, gestionado: boolean, nota?: string): Promise<DesviacionCheck>;

  saveVolvoFuelSnapshots(snapshots: InsertVolvoFuelSnapshot[]): Promise<void>;
  getVolvoFuelSnapshotsInRange(vins: string[], from: Date, to: Date): Promise<VolvoFuelSnapshot[]>;

  getParametros(): Promise<Parametro[]>;
  getParametro(clave: string): Promise<Parametro | undefined>;
  upsertParametro(clave: string, valor: string): Promise<Parametro>;

  getPuntosRuta(): Promise<PuntoRuta[]>;
  getPuntosRutaByCamion(camionId: number): Promise<PuntoRuta[]>;
  createPuntoRuta(punto: InsertPuntoRuta): Promise<PuntoRuta>;
  updatePuntoRuta(id: number, data: Partial<InsertPuntoRuta>): Promise<PuntoRuta | undefined>;
  getConfirmedPuntos(): Promise<PuntoRuta[]>;

  getTarifas(): Promise<TarifaRuta[]>;
  createTarifa(tarifa: InsertTarifaRuta): Promise<TarifaRuta>;
  updateTarifa(id: number, data: Partial<InsertTarifaRuta>): Promise<TarifaRuta | undefined>;
  deactivateTarifa(id: number): Promise<void>;

  getTmsContratos(): Promise<TmsContrato[]>;
  getTmsContrato(id: number): Promise<TmsContrato | undefined>;
  createTmsContrato(data: InsertTmsContrato): Promise<TmsContrato>;
  updateTmsContrato(id: number, data: Partial<InsertTmsContrato>): Promise<TmsContrato | undefined>;

  getTmsViajes(contratoId: number, filters?: { estado?: string; camionId?: number; fechaDesde?: Date; fechaHasta?: Date }): Promise<TmsViaje[]>;
  getTmsViaje(id: number): Promise<TmsViaje | undefined>;
  createTmsViaje(data: InsertTmsViaje): Promise<TmsViaje>;
  updateTmsViaje(id: number, data: Partial<InsertTmsViaje>): Promise<TmsViaje | undefined>;

  getTmsParadas(viajeId: number): Promise<TmsParada[]>;
  createTmsParada(data: InsertTmsParada): Promise<TmsParada>;
  updateTmsParada(id: number, data: Partial<InsertTmsParada>): Promise<TmsParada | undefined>;

  getTmsPuntos(contratoId: number): Promise<TmsPunto[]>;
  createTmsPunto(data: InsertTmsPunto): Promise<TmsPunto>;
  updateTmsPunto(id: number, data: Partial<InsertTmsPunto>): Promise<TmsPunto | undefined>;

  deleteTmsViajesByContrato(contratoId: number): Promise<void>;
  deleteTmsPuntosByContrato(contratoId: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getFaenas(): Promise<Faena[]> {
    return db.select().from(faenas);
  }

  async getFaena(id: number): Promise<Faena | undefined> {
    const [faena] = await db.select().from(faenas).where(eq(faenas.id, id));
    return faena;
  }

  async createFaena(faena: InsertFaena): Promise<Faena> {
    const [created] = await db.insert(faenas).values(faena).returning();
    return created;
  }

  async updateFaena(id: number, data: Partial<InsertFaena>): Promise<Faena | undefined> {
    const [updated] = await db.update(faenas).set(data).where(eq(faenas.id, id)).returning();
    return updated;
  }

  async deleteFaena(id: number): Promise<void> {
    await db.delete(faenas).where(eq(faenas.id, id));
  }

  async getCamiones(): Promise<Camion[]> {
    return db.select().from(camiones);
  }

  async getCamion(id: number): Promise<Camion | undefined> {
    const [camion] = await db.select().from(camiones).where(eq(camiones.id, id));
    return camion;
  }

  async getCamionByVin(vin: string): Promise<Camion | undefined> {
    const [camion] = await db.select().from(camiones).where(eq(camiones.vin, vin));
    return camion;
  }

  async createCamion(camion: InsertCamion): Promise<Camion> {
    const [created] = await db.insert(camiones).values(camion).returning();
    return created;
  }

  async updateCamion(id: number, data: Partial<InsertCamion>): Promise<Camion | undefined> {
    const [updated] = await db.update(camiones).set(data).where(eq(camiones.id, id)).returning();
    return updated;
  }

  async deleteCamion(id: number): Promise<void> {
    await db.delete(cargas).where(eq(cargas.camionId, id));
    await db.delete(camiones).where(eq(camiones.id, id));
  }

  async getCargas(camionId?: number): Promise<Carga[]> {
    if (camionId) {
      return db.select().from(cargas).where(eq(cargas.camionId, camionId));
    }
    return db.select().from(cargas);
  }

  async getCargasByDateRange(from: Date, to: Date): Promise<Carga[]> {
    return db.select().from(cargas).where(
      and(
        gte(cargas.fecha, from.toISOString()),
        lte(cargas.fecha, to.toISOString())
      )
    );
  }

  async getCarga(id: number): Promise<Carga | undefined> {
    const [carga] = await db.select().from(cargas).where(eq(cargas.id, id));
    return carga;
  }

  async createCarga(carga: InsertCarga): Promise<Carga> {
    const [created] = await db.insert(cargas).values(carga).returning();
    return created;
  }

  async deleteCarga(id: number): Promise<void> {
    await db.delete(cargas).where(eq(cargas.id, id));
  }

  async getDesviacionChecks(): Promise<DesviacionCheck[]> {
    return db.select().from(desviacionChecks);
  }

  async upsertDesviacionCheck(fleetNum: string, tipo: string, gestionado: boolean, nota?: string): Promise<DesviacionCheck> {
    const now = new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" });
    const [existing] = await db.select().from(desviacionChecks)
      .where(and(eq(desviacionChecks.fleetNum, fleetNum), eq(desviacionChecks.tipo, tipo)));

    if (existing) {
      const [updated] = await db.update(desviacionChecks)
        .set({ gestionado, gestionadoAt: gestionado ? now : null, nota: nota ?? existing.nota })
        .where(eq(desviacionChecks.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(desviacionChecks)
      .values({ fleetNum, tipo, gestionado, gestionadoAt: gestionado ? now : null, nota: nota ?? null })
      .returning();
    return created;
  }

  async saveVolvoFuelSnapshots(snapshots: InsertVolvoFuelSnapshot[]): Promise<void> {
    if (snapshots.length === 0) return;
    await db.insert(volvoFuelSnapshots).values(snapshots).onConflictDoNothing();
  }

  async getVolvoFuelSnapshotsInRange(vins: string[], from: Date, to: Date): Promise<VolvoFuelSnapshot[]> {
    if (vins.length === 0) return [];
    return db.select().from(volvoFuelSnapshots)
      .where(and(
        inArray(volvoFuelSnapshots.vin, vins),
        gte(volvoFuelSnapshots.capturedAt, from.toISOString()),
        lte(volvoFuelSnapshots.capturedAt, to.toISOString()),
      ));
  }

  async getParametros(): Promise<Parametro[]> {
    return db.select().from(parametros);
  }

  async getParametro(clave: string): Promise<Parametro | undefined> {
    const [row] = await db.select().from(parametros).where(eq(parametros.clave, clave));
    return row;
  }

  async upsertParametro(clave: string, valor: string): Promise<Parametro> {
    const existing = await this.getParametro(clave);
    if (existing) {
      const [updated] = await db.update(parametros).set({ valor, updatedAt: new Date() }).where(eq(parametros.clave, clave)).returning();
      return updated;
    }
    const [created] = await db.insert(parametros).values({ clave, valor }).returning();
    return created;
  }

  async getPuntosRuta(): Promise<PuntoRuta[]> {
    return db.select().from(puntosRuta);
  }

  async getPuntosRutaByCamion(camionId: number): Promise<PuntoRuta[]> {
    return db.select().from(puntosRuta).where(eq(puntosRuta.camionId, camionId));
  }

  async createPuntoRuta(punto: InsertPuntoRuta): Promise<PuntoRuta> {
    const [created] = await db.insert(puntosRuta).values(punto).returning();
    return created;
  }

  async updatePuntoRuta(id: number, data: Partial<InsertPuntoRuta>): Promise<PuntoRuta | undefined> {
    const [updated] = await db.update(puntosRuta).set(data).where(eq(puntosRuta.id, id)).returning();
    return updated;
  }

  async getConfirmedPuntos(): Promise<PuntoRuta[]> {
    return db.select().from(puntosRuta).where(eq(puntosRuta.confirmado, true));
  }

  async getTarifas(): Promise<TarifaRuta[]> {
    return db.select().from(tarifasRuta);
  }

  async createTarifa(tarifa: InsertTarifaRuta): Promise<TarifaRuta> {
    const [created] = await db.insert(tarifasRuta).values(tarifa).returning();
    return created;
  }

  async updateTarifa(id: number, data: Partial<InsertTarifaRuta>): Promise<TarifaRuta | undefined> {
    const [updated] = await db.update(tarifasRuta).set(data).where(eq(tarifasRuta.id, id)).returning();
    return updated;
  }

  async deactivateTarifa(id: number): Promise<void> {
    await db.update(tarifasRuta).set({ activa: false }).where(eq(tarifasRuta.id, id));
  }

  async getTmsContratos(): Promise<TmsContrato[]> {
    return db.select().from(tmsContratos).where(eq(tmsContratos.activo, true)).orderBy(desc(tmsContratos.createdAt));
  }

  async getTmsContrato(id: number): Promise<TmsContrato | undefined> {
    const [c] = await db.select().from(tmsContratos).where(eq(tmsContratos.id, id));
    return c;
  }

  async createTmsContrato(data: InsertTmsContrato): Promise<TmsContrato> {
    const [created] = await db.insert(tmsContratos).values(data).returning();
    return created;
  }

  async updateTmsContrato(id: number, data: Partial<InsertTmsContrato>): Promise<TmsContrato | undefined> {
    const [updated] = await db.update(tmsContratos).set(data).where(eq(tmsContratos.id, id)).returning();
    return updated;
  }

  async getTmsViajes(contratoId: number, filters?: { estado?: string; camionId?: number; fechaDesde?: Date; fechaHasta?: Date }): Promise<TmsViaje[]> {
    const conditions = [eq(tmsViajes.contratoId, contratoId)];
    if (filters?.estado) conditions.push(eq(tmsViajes.estado, filters.estado));
    if (filters?.camionId) conditions.push(eq(tmsViajes.camionId, filters.camionId));
    if (filters?.fechaDesde) conditions.push(gte(tmsViajes.fechaSalida, filters.fechaDesde));
    if (filters?.fechaHasta) conditions.push(lte(tmsViajes.fechaSalida, filters.fechaHasta));
    return db.select().from(tmsViajes).where(and(...conditions)).orderBy(desc(tmsViajes.createdAt));
  }

  async getTmsViaje(id: number): Promise<TmsViaje | undefined> {
    const [v] = await db.select().from(tmsViajes).where(eq(tmsViajes.id, id));
    return v;
  }

  async createTmsViaje(data: InsertTmsViaje): Promise<TmsViaje> {
    const [created] = await db.insert(tmsViajes).values(data).returning();
    return created;
  }

  async updateTmsViaje(id: number, data: Partial<InsertTmsViaje>): Promise<TmsViaje | undefined> {
    const [updated] = await db.update(tmsViajes).set(data).where(eq(tmsViajes.id, id)).returning();
    return updated;
  }

  async getTmsParadas(viajeId: number): Promise<TmsParada[]> {
    return db.select().from(tmsParadas).where(eq(tmsParadas.viajeId, viajeId)).orderBy(asc(tmsParadas.orden));
  }

  async createTmsParada(data: InsertTmsParada): Promise<TmsParada> {
    const [created] = await db.insert(tmsParadas).values(data).returning();
    return created;
  }

  async updateTmsParada(id: number, data: Partial<InsertTmsParada>): Promise<TmsParada | undefined> {
    const [updated] = await db.update(tmsParadas).set(data).where(eq(tmsParadas.id, id)).returning();
    return updated;
  }

  async getTmsPuntos(contratoId: number): Promise<TmsPunto[]> {
    return db.select().from(tmsPuntos).where(eq(tmsPuntos.contratoId, contratoId)).orderBy(desc(tmsPuntos.vecesVisitado));
  }

  async createTmsPunto(data: InsertTmsPunto): Promise<TmsPunto> {
    const [created] = await db.insert(tmsPuntos).values(data).returning();
    return created;
  }

  async updateTmsPunto(id: number, data: Partial<InsertTmsPunto>): Promise<TmsPunto | undefined> {
    const [updated] = await db.update(tmsPuntos).set(data).where(eq(tmsPuntos.id, id)).returning();
    return updated;
  }

  async deleteTmsViajesByContrato(contratoId: number): Promise<void> {
    const viajes = await this.getTmsViajes(contratoId);
    for (const v of viajes) {
      await db.delete(tmsParadas).where(eq(tmsParadas.viajeId, v.id));
    }
    await db.delete(tmsViajes).where(eq(tmsViajes.contratoId, contratoId));
  }

  async deleteTmsPuntosByContrato(contratoId: number): Promise<void> {
    await db.delete(tmsPuntos).where(eq(tmsPuntos.contratoId, contratoId));
  }
}

export const storage = new DatabaseStorage();
