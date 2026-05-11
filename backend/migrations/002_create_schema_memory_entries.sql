create table if not exists schema_memory_entries (
  id uuid primary key default gen_random_uuid(),
  source_layout_id uuid not null references layouts(id) on delete cascade,
  flat_type text,
  floor_area_sqm double precision,
  room_signature text not null,
  before_schema_json jsonb not null default '{}'::jsonb,
  after_schema_json jsonb not null default '{}'::jsonb,
  rules_json jsonb not null default '{}'::jsonb,
  summary text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_schema_memory_entries_active on schema_memory_entries(active);
create index if not exists idx_schema_memory_entries_source_layout on schema_memory_entries(source_layout_id);
create index if not exists idx_schema_memory_entries_flat_type on schema_memory_entries(flat_type);
