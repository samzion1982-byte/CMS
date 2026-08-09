-- Saved backup item selection (tables + storage buckets) for manual + automatic runs
-- null arrays mean "all"; empty storage_buckets means skip photos/files

alter table public.cms_backup_settings
  add column if not exists backup_selection jsonb not null default '{"tables":null,"storage_buckets":null}'::jsonb;

comment on column public.cms_backup_settings.backup_selection is
  'Which items to include in Full Backup / Snapshot. { tables: string[]|null, storage_buckets: string[]|null }. null = all; [] storage = skip files.';
