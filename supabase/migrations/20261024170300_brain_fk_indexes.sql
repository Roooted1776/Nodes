-- Cover foreign keys (performance advisor 0001).
create index if not exists audit_log_who on public.audit_log (who);
create index if not exists memories_updated_by on public.memories (updated_by);
create index if not exists sessions_created_by on public.sessions (created_by);
