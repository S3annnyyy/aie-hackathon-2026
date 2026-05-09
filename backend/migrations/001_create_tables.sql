create extension if not exists pgcrypto;

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  source_pdf_name text not null,
  source_pdf_url text not null,
  source_pdf_hash text,
  upload_manifest_url text,
  status text not null default 'uploaded',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_projects_source_pdf_hash on projects(source_pdf_hash);

create table if not exists layouts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  source_page integer not null,
  flat_type text,
  floor_area_sqm double precision,
  finish_type text,
  notes text,
  schema_json jsonb not null default '{}'::jsonb,
  crop_image_url text,
  dxf_url text,
  glb_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists layout_change_logs (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references layouts(id) on delete cascade,
  prompt text not null,
  object_id text,
  diff_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
