-- Google OAuth tokens for Drive backups (user login; uses user quota)
alter table public.cms_backup_settings
  add column if not exists google_refresh_token text,
  add column if not exists google_connected_email text,
  add column if not exists google_connected_at timestamptz;

comment on column public.cms_backup_settings.google_refresh_token is
  'Google OAuth refresh token — never expose to browser clients; Edge Functions only';
