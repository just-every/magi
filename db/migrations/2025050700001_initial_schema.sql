-- Migration: Initial database schema (3072-dim halfvec)

-- 1. Extensions -------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector ≥ 0.7.0

BEGIN;

-- 2. mech_tasks -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mech_tasks (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      timestamptz      DEFAULT now(),
    finished_at     timestamptz,
    duration_sec    integer,
    total_cost      numeric(10,4),
    status          text CHECK (status IN ('complete','fatal_error')),
    model_used      text,
    initial_prompt  text NOT NULL
);

-- 3. mech_task_memories -----------------------------------------------------
CREATE TABLE IF NOT EXISTS mech_task_memories (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id    uuid NOT NULL REFERENCES mech_tasks(id) ON DELETE CASCADE,
    text       text NOT NULL,
    embedding  halfvec(3072) NOT NULL,
    score      double precision,
    metadata   jsonb,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX mech_task_memories_embedding_idx
    ON mech_task_memories USING hnsw (embedding halfvec_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- 4. custom_tools -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS custom_tools (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name             text NOT NULL,
    description      text NOT NULL,
    parameters_json  jsonb NOT NULL,                -- switched to JSONB
    implementation   text NOT NULL,
    embedding        halfvec(3072),
    version          integer DEFAULT 1,
    source_task_id   uuid,
    is_latest        boolean DEFAULT true,
    created_at       timestamptz DEFAULT now()
);

CREATE INDEX custom_tools_name_idx ON custom_tools(name);

CREATE UNIQUE INDEX custom_tools_name_latest_idx
    ON custom_tools(name) WHERE is_latest;

CREATE INDEX custom_tools_embedding_idx
    ON custom_tools USING hnsw (embedding halfvec_cosine_ops)
    WITH (m = 16, ef_construction = 64);

COMMIT;