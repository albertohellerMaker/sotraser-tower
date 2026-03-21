-- Migration 001: Add capacidad_estanque_litros and patrones unique index
-- Run against Neon PostgreSQL manually

-- A2: Add tank capacity column to camiones
ALTER TABLE camiones ADD COLUMN IF NOT EXISTS capacidad_estanque_litros INTEGER;

-- Set reasonable defaults by model (Volvo FH = ~500L, FM = ~400L, FH16 = ~600L)
-- Adjust these values based on actual fleet data
UPDATE camiones SET capacidad_estanque_litros = 500 WHERE capacidad_estanque_litros IS NULL;

-- A3: Unique index for patrones upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_patrones_scope ON patrones_carga_combustible (scope_tipo, scope_id);
