-- Add actual WhatsApp send timestamps to event planner task records
alter table event_tasks
  add column if not exists whatsapp_sent_at timestamptz,
  add column if not exists whatsapp_followup_1_sent_at timestamptz,
  add column if not exists whatsapp_followup_2_sent_at timestamptz;
