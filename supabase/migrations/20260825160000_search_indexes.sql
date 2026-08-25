-- Milestone 9: performance indexes for search (PRD §38, M9 hardening).
-- ILIKE search over titles/message contents gets trigram GIN indexes.

create extension if not exists pg_trgm;

create index if not exists conversations_title_trgm_idx
  on public.conversations using gin (title gin_trgm_ops);

create index if not exists messages_content_trgm_idx
  on public.messages using gin (content gin_trgm_ops);

create index if not exists projects_name_trgm_idx
  on public.projects using gin (name gin_trgm_ops);
