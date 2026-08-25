-- Milestone 6: Claude integration modes (compliance gate resolved 2026-08-25,
-- product owner approved: manual + official_api — see docs/PROVIDER_ADAPTERS.md).
-- The primary compliant mode is `manual` (zero credentials); `official_api`
-- is optional per-account with a user-supplied key that is NEVER stored
-- server-side (browser-held, forwarded per request only).

update public.providers
set integration_type = 'manual'
where slug = 'claude';

-- Map catalog models to real Anthropic API model ids for official_api mode.
-- capabilities.api_model is read by the server proxy route.
update public.models m
set capabilities = m.capabilities || jsonb_build_object('api_model', v.api_model)
from (
  values
    ('claude-sonnet', 'claude-sonnet-5'),
    ('claude-opus', 'claude-opus-5'),
    ('claude-haiku', 'claude-haiku-4-5')
) as v (external_id, api_model)
join public.providers p on p.slug = 'claude'
where m.provider_id = p.id and m.external_id = v.external_id;
