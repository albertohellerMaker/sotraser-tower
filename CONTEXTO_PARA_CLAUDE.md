# Proyecto SOTRASER - Contexto para Claude Code

## Descripción General
SOTRASER es un "Fleet Intelligence Dashboard" desarrollado para una empresa de transporte chilena con el objetivo de optimizar la operación de la flota de camiones y la toma de decisiones basada en datos. 
El sistema gestiona cientos de camiones a través de distintos contratos (ej. CENCOSUD), integrando rastreo de GPS en vivo y telemetría avanzada importada desde **WiseTrack**. 

## Stack Tecnológico 
Aplicación Full-Stack en **TypeScript**:
*   **Frontend**: React (manejado con Vite), Tailwind CSS, shadcn/ui (Radix), Framer Motion, y React Leaflet.
*   **Backend**: API Express.js (`server/`).
*   **Base de Datos**: PostgreSQL, mediante **Drizzle ORM**.
*   **IA Generativa / Diagnóstico**: SDK de Anthropic (`@anthropic-ai/sdk`) para análisis de flotas, asistentes conversacionales, evaluación y detección anomalías usando Claude (`claude-sonnet-4`).

## Arquitectura y Módulos
La arquitectura se basa en un lanzador (launcher) principal que deriva en distintos modos:
*   **TOWER / CEREBRO**: Plataforma analítica con inteligencia que evalúa la flota completa.
*   **CONTROL**: Panel directivo de operaciones en tiempo real.
*   **OPERATIVE BRAIN**: Herramientas integradas como el Mapa de Rastreo, el reporte del día, la evaluación de conductores (Driver Analytics VIP), y la plataforma de Aprendizaje.
*   **SISTEMA INTELIGENTE**: Permite al usuario interactuar en texto natural con datos del camión (Diálogo IA) y ajustar las tolerancias detectadas (Calibración).

## Características Críticas del Dominio
1.  **Cuadratura de Combustible**: Algoritmo central para reconciliar los consumos que reporta la telemetria WiseTrack contra las cargas reportadas en surtidor, detectando fugas de combustible y anomalías.
2.  **Aprendizaje Adaptativo**: Existen jobs en background encargados de re-procesar los viajes históricos, detectar los corredores habituales (rutas), calcular desviaciones de consumo y sugerir ajustes.
3.  **Filtrados Especiales**: Lógicas especiales según contrato (como CENCOSUD), las cuales deben ser programadas de manera fácilmente reversible.

## Reglas de Desarrollo
*   **No hacer cambios arquitectónicos grandes ni refactorizaciones estructurales** sin consultar previamente.
*   **Base de Datos**: Ningún cambio o migración de esquema en Drizzle debe ocurrir sin confirmación del usuario.
*   Siempre brindar detalle a las modificaciones de los algoritmos de IA, filtros o cruces estadísticos.
