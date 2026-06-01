-- Add WhatsApp send tracking to event planner task records
alter table event_tasks
  add column if not exists whatsapp_sent_count integer not null default 0;
