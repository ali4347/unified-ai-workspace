-- Provider model-ID compatibility refresh (audit 2026-08-27).
--
-- Verified against official documentation on 2026-08-27:
--
--   Anthropic — platform.claude.com/docs/en/about-claude/models/overview
--     claude-opus-5               Claude Opus 5     (already mapped, still current)
--     claude-sonnet-5             Claude Sonnet 5   (already mapped, still current)
--     claude-haiku-4-5-20251001   Claude Haiku 4.5  — the documented "Claude API ID"
--         and the canonical value persisted here. `claude-haiku-4-5` is the documented
--         convenience alias that resolves to this snapshot; it is recorded as
--         capabilities.api_model_alias for display/compatibility only and must never
--         be the persisted canonical id. Retirement not sooner than 2026-10-15.
--     claude-fable-5              Claude Fable 5    (highest capability — added here)
--
--   OpenAI — developers.openai.com/api/docs/models (+ /deprecations)
--     gpt-5.6-sol        frontier   (alias gpt-5.6)  — /v1/chat/completions supported
--     gpt-5.6-terra      mid-tier                    — /v1/chat/completions supported
--     gpt-5.6-luna       cost-optimized              — /v1/chat/completions supported
--
-- Why this migration exists: the ids seeded by 20260825150000_chatgpt_integration.sql
-- (`gpt-5.1`, `gpt-5.1-mini`) belong to the GPT-5.1 family, which OpenAI shut down on
-- 2026-07-23 with gpt-5.6-sol / gpt-5.6-terra as the named replacements. The Anthropic
-- ids from 20260825140000_claude_integration.sql were re-verified and are unchanged;
-- they are re-asserted here so this file alone describes the current mapping.
--
-- Forward-only and idempotent: earlier migrations are not edited, no model row is
-- deleted, and re-running changes nothing. Outgoing api_model values are archived in
-- capabilities.deprecated_api_models rather than dropped (audit trail). The app-level
-- external_id values (`chatgpt-flagship`, …) are stable keys and are NOT deprecated —
-- only the provider-side api_model they resolve to changed.

-- ---------------------------------------------------------------------------
-- 1. Archive the outgoing api_model values before overwriting them:
--      - the retired OpenAI GPT-5.1 ids, and
--      - the unpinned Claude Haiku alias, if 20260825140000 already ran here.
--    The WHERE clause only matches while those values are still in place, so a
--    second run appends nothing.
-- ---------------------------------------------------------------------------
update public.models m
set capabilities = m.capabilities || jsonb_build_object(
  'deprecated_api_models',
  coalesce(m.capabilities -> 'deprecated_api_models', '[]'::jsonb)
    || jsonb_build_array(m.capabilities ->> 'api_model')
)
from public.providers p
where m.provider_id = p.id
  and (
    (p.slug = 'chatgpt' and m.capabilities ->> 'api_model' in ('gpt-5.1', 'gpt-5.1-mini'))
    or (p.slug = 'claude' and m.capabilities ->> 'api_model' = 'claude-haiku-4-5')
  );

-- ---------------------------------------------------------------------------
-- 2. New catalog entries (additive; existing rows are left alone).
--    Sort order keeps the current defaults: Sonnet stays first for Claude and the
--    flagship stays first for ChatGPT, so no user's default selection changes.
-- ---------------------------------------------------------------------------
update public.models m
set sort_order = 4
from public.providers p
where m.provider_id = p.id and p.slug = 'claude' and m.external_id = 'claude-haiku';

update public.models m
set sort_order = 3
from public.providers p
where m.provider_id = p.id and p.slug = 'chatgpt' and m.external_id = 'chatgpt-mini';

insert into public.models (provider_id, external_id, name, display_name, sort_order)
select p.id, v.external_id, v.name, v.display_name, v.sort_order
from (
  values
    ('claude', 'claude-fable', 'Fable', 'Highest capability', 3),
    ('chatgpt', 'chatgpt-balanced', 'GPT balanced', 'Balanced cost', 2)
) as v (provider_slug, external_id, name, display_name, sort_order)
join public.providers p on p.slug = v.provider_slug
on conflict (provider_id, external_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Current api_model mapping for every active model (idempotent overwrite).
-- ---------------------------------------------------------------------------
update public.models m
set capabilities = m.capabilities || jsonb_build_object(
  'api_model', v.api_model,
  'api_model_verified_on', '2026-08-27'
)
from (
  values
    ('claude', 'claude-sonnet', 'claude-sonnet-5'),
    ('claude', 'claude-opus', 'claude-opus-5'),
    ('claude', 'claude-haiku', 'claude-haiku-4-5-20251001'),
    ('claude', 'claude-fable', 'claude-fable-5'),
    ('chatgpt', 'chatgpt-flagship', 'gpt-5.6-sol'),
    ('chatgpt', 'chatgpt-balanced', 'gpt-5.6-terra'),
    ('chatgpt', 'chatgpt-mini', 'gpt-5.6-luna')
) as v (provider_slug, external_id, api_model)
join public.providers p on p.slug = v.provider_slug
where m.provider_id = p.id and m.external_id = v.external_id;

-- ---------------------------------------------------------------------------
-- 4. Keep selector subtitles honest now that Fable 5 is the top tier.
-- ---------------------------------------------------------------------------
update public.models m
set display_name = v.display_name
from (
  values
    ('claude', 'claude-opus', 'Complex agentic work'),
    ('chatgpt', 'chatgpt-flagship', 'Frontier')
) as v (provider_slug, external_id, display_name)
join public.providers p on p.slug = v.provider_slug
where m.provider_id = p.id and m.external_id = v.external_id;

-- ---------------------------------------------------------------------------
-- 5. Documented convenience aliases. These are display/compatibility values
--    only — the canonical id sent to the provider is always api_model above.
--    Anything reading capabilities must prefer api_model and treat api_model_alias
--    as a legacy equivalent, never the other way round.
-- ---------------------------------------------------------------------------
update public.models m
set capabilities = m.capabilities || jsonb_build_object('api_model_alias', v.alias)
from (
  values
    ('claude', 'claude-haiku', 'claude-haiku-4-5')
) as v (provider_slug, external_id, alias)
join public.providers p on p.slug = v.provider_slug
where m.provider_id = p.id and m.external_id = v.external_id;
