import { pool } from "../db";

export async function enviarMensaje({ de, para, tipo, prioridad = "NORMAL", titulo, contenido, datos = {} }: { de: string; para: string; tipo: string; prioridad?: string; titulo: string; contenido: string; datos?: any }) {
  await pool.query(`INSERT INTO agente_mensajes (de_agente, para_agente, tipo, prioridad, titulo, contenido, datos) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [de, para, tipo, prioridad, titulo, contenido, JSON.stringify(datos)]);
}
