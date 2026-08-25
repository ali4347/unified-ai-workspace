-- Milestone 3: core schema (PRD §31), RLS on every user-owned table (§32),
-- provider/model reference seed data (§15, §26), storage bucket + ownership
-- policies (§33), indexes.
-- Apply via Supabase SQL Editor or `supabase db push`.

-- ---------------------------------------------------------------------------
-- providers — global reference table (read-only for users)
-- ---------------------------------------------------------------------------
create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  icon_url text,
  -- Compliance-reviewed integration mode (PRD §7). 'disabled' until the
  -- Milestone 6 gate assigns a compliant mode per provider.
  integration_type text not null default 'disabled'
    check (integration_type in ('supported', 'experimental', 'disabled', 'manual', 'official_api')),
  -- UI availability: 'active' appears selectable (mock until M6), 'phase2'
  -- is visible but unselectable, 'disabled' is hidden.
  status text not null default 'disabled'
    check (status in ('active', 'phase2', 'disabled')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.providers is
  'AI provider reference data. Writes only via migrations/service role.';

alter table public.providers enable row level security;

create policy "providers_select_authenticated"
  on public.providers for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- models — global reference table (read-only for users)
-- ---------------------------------------------------------------------------
create table if not exists public.models (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  -- Stable app-level id (e.g. "claude-sonnet"). Real API model ids live in
  -- capabilities once official_api mode is enabled (M6).
  external_id text not null,
  name text not null,
  -- Used as the selector subtitle/description.
  display_name text,
  capabilities jsonb not null default '{}'::jsonb,
  status text not null default 'active'
    check (status in ('active', 'disabled')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, external_id)
);

alter table public.models enable row level security;

create policy "models_select_authenticated"
  on public.models for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- connected_accounts — provider account METADATA only (PRD §19: no passwords,
-- no cookies, no keys; deliberately no credential column of any kind)
-- ---------------------------------------------------------------------------
create table if not exists public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider_id uuid not null references public.providers (id) on delete cascade,
  email text,
  display_name text,
  subscription_label text,
  status text not null default 'disconnected'
    check (status in ('connected', 'disconnected', 'login_required', 'unsupported', 'error')),
  metadata jsonb not null default '{}'::jsonb,
  last_connected_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.connected_accounts is
  'Provider account metadata only — never passwords, cookies or API keys (PRD §19).';

alter table public.connected_accounts enable row level security;

create policy "connected_accounts_select_own"
  on public.connected_accounts for select
  using (auth.uid() = user_id);
create policy "connected_accounts_insert_own"
  on public.connected_accounts for insert
  with check (auth.uid() = user_id);
create policy "connected_accounts_update_own"
  on public.connected_accounts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "connected_accounts_delete_own"
  on public.connected_accounts for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  custom_instructions text,
  default_provider_id uuid references public.providers (id) on delete set null,
  default_model_id uuid references public.models (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "projects_select_own"
  on public.projects for select
  using (auth.uid() = user_id);
create policy "projects_insert_own"
  on public.projects for insert
  with check (auth.uid() = user_id);
create policy "projects_update_own"
  on public.projects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "projects_delete_own"
  on public.projects for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- conversations — the Master Conversation (PRD §3)
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  title text not null default 'New conversation',
  summary text,
  active_provider_id uuid references public.providers (id) on delete set null,
  active_model_id uuid references public.models (id) on delete set null,
  active_account_id uuid references public.connected_accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

alter table public.conversations enable row level security;

create policy "conversations_select_own"
  on public.conversations for select
  using (auth.uid() = user_id);
create policy "conversations_insert_own"
  on public.conversations for insert
  with check (auth.uid() = user_id);
create policy "conversations_update_own"
  on public.conversations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "conversations_delete_own"
  on public.conversations for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  provider_id uuid references public.providers (id) on delete set null,
  model_id uuid references public.models (id) on delete set null,
  account_id uuid references public.connected_accounts (id) on delete set null,
  status text not null default 'completed'
    check (status in ('queued', 'sending', 'streaming', 'completed', 'failed', 'cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "messages_select_own"
  on public.messages for select
  using (auth.uid() = user_id);
-- Insert additionally requires owning the target conversation.
create policy "messages_insert_own"
  on public.messages for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );
create policy "messages_update_own"
  on public.messages for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "messages_delete_own"
  on public.messages for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- attachments
-- ---------------------------------------------------------------------------
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  message_id uuid references public.messages (id) on delete set null,
  file_name text not null,
  file_type text,
  file_size bigint,
  storage_path text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.attachments enable row level security;

create policy "attachments_select_own"
  on public.attachments for select
  using (auth.uid() = user_id);
create policy "attachments_insert_own"
  on public.attachments for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );
create policy "attachments_delete_own"
  on public.attachments for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- extension_devices (referenced by provider_sessions)
-- ---------------------------------------------------------------------------
create table if not exists public.extension_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_name text,
  browser text,
  extension_version text,
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.extension_devices enable row level security;

create policy "extension_devices_select_own"
  on public.extension_devices for select
  using (auth.uid() = user_id);
create policy "extension_devices_insert_own"
  on public.extension_devices for insert
  with check (auth.uid() = user_id);
create policy "extension_devices_update_own"
  on public.extension_devices for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "extension_devices_delete_own"
  on public.extension_devices for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- provider_sessions — session METADATA only (PRD §31: no external passwords)
-- ---------------------------------------------------------------------------
create table if not exists public.provider_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connected_account_id uuid not null references public.connected_accounts (id) on delete cascade,
  device_id uuid references public.extension_devices (id) on delete set null,
  status text not null default 'inactive'
    check (status in ('active', 'inactive', 'expired', 'error')),
  metadata jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.provider_sessions is
  'Session state metadata only — never provider credentials or cookies (PRD §19, §31).';

alter table public.provider_sessions enable row level security;

create policy "provider_sessions_select_own"
  on public.provider_sessions for select
  using (auth.uid() = user_id);
create policy "provider_sessions_insert_own"
  on public.provider_sessions for insert
  with check (auth.uid() = user_id);
create policy "provider_sessions_update_own"
  on public.provider_sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "provider_sessions_delete_own"
  on public.provider_sessions for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- provider_events (PRD §31; event_type left unconstrained — the PRD list is
-- explicitly examples, and M8 adds switch events)
-- ---------------------------------------------------------------------------
create table if not exists public.provider_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider_id uuid references public.providers (id) on delete set null,
  account_id uuid references public.connected_accounts (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.provider_events enable row level security;

create policy "provider_events_select_own"
  on public.provider_events for select
  using (auth.uid() = user_id);
create policy "provider_events_insert_own"
  on public.provider_events for insert
  with check (auth.uid() = user_id);
create policy "provider_events_delete_own"
  on public.provider_events for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers (reuses public.set_updated_at from the M1 migration)
-- ---------------------------------------------------------------------------
create trigger models_set_updated_at
  before update on public.models
  for each row execute procedure public.set_updated_at();
create trigger connected_accounts_set_updated_at
  before update on public.connected_accounts
  for each row execute procedure public.set_updated_at();
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute procedure public.set_updated_at();
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute procedure public.set_updated_at();
create trigger messages_set_updated_at
  before update on public.messages
  for each row execute procedure public.set_updated_at();
create trigger provider_sessions_set_updated_at
  before update on public.provider_sessions
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists models_provider_sort_idx
  on public.models (provider_id, sort_order);
create index if not exists connected_accounts_user_idx
  on public.connected_accounts (user_id);
create index if not exists projects_user_updated_idx
  on public.projects (user_id, updated_at desc);
create index if not exists conversations_user_recent_idx
  on public.conversations (user_id, updated_at desc)
  where archived_at is null;
create index if not exists conversations_project_idx
  on public.conversations (project_id);
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);
create index if not exists messages_user_idx
  on public.messages (user_id);
create index if not exists attachments_conversation_idx
  on public.attachments (conversation_id);
create index if not exists provider_sessions_user_idx
  on public.provider_sessions (user_id);
create index if not exists extension_devices_user_idx
  on public.extension_devices (user_id);
create index if not exists provider_events_user_created_idx
  on public.provider_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Reference seed data (idempotent; lives in a migration so `db push` seeds
-- the hosted project — seed.sql only runs on local resets)
-- ---------------------------------------------------------------------------
insert into public.providers (slug, name, integration_type, status, sort_order) values
  ('claude', 'Claude', 'disabled', 'active', 1),
  ('chatgpt', 'ChatGPT', 'disabled', 'active', 2),
  ('gemini', 'Google Gemini', 'disabled', 'phase2', 3),
  ('perplexity', 'Perplexity', 'disabled', 'phase2', 4),
  ('copilot', 'Microsoft Copilot', 'disabled', 'phase2', 5)
on conflict (slug) do nothing;

insert into public.models (provider_id, external_id, name, display_name, sort_order)
select p.id, m.external_id, m.name, m.display_name, m.sort_order
from (
  values
    ('claude', 'claude-sonnet', 'Sonnet', 'Balanced', 1),
    ('claude', 'claude-opus', 'Opus', 'Most capable', 2),
    ('claude', 'claude-haiku', 'Haiku', 'Fastest', 3),
    ('chatgpt', 'chatgpt-flagship', 'GPT flagship', 'Default', 1),
    ('chatgpt', 'chatgpt-mini', 'GPT mini', 'Lightweight', 2),
    ('gemini', 'gemini-pro', 'Pro', null, 1),
    ('gemini', 'gemini-flash', 'Flash', null, 2),
    ('perplexity', 'perplexity-default', 'Default', null, 1),
    ('copilot', 'copilot-default', 'Default', null, 1)
) as m (provider_slug, external_id, name, display_name, sort_order)
join public.providers p on p.slug = m.provider_slug
on conflict (provider_id, external_id) do nothing;

-- ---------------------------------------------------------------------------
-- Storage: private attachments bucket, first path segment must be the owner's
-- user id ({userId}/{projectId}/{conversationId}/… — PRD §33 adapted)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy "attachments_storage_select_own"
  on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "attachments_storage_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "attachments_storage_update_own"
  on storage.objects for update to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "attachments_storage_delete_own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
