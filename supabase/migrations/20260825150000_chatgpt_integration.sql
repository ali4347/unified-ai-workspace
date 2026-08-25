-- Milestone 7: ChatGPT integration modes (same gate decision as Claude:
-- manual + optional official_api with a browser-held user key — see
-- docs/PROVIDER_ADAPTERS.md M7 compliance record).

update public.providers
set integration_type = 'manual'
where slug = 'chatgpt';

-- Map catalog models to OpenAI API model ids for official_api mode.
-- If OpenAI renames models, update these values with a follow-up migration.
update public.models m
set capabilities = m.capabilities || jsonb_build_object('api_model', v.api_model)
from (
  values
    ('chatgpt-flagship', 'gpt-5.1'),
    ('chatgpt-mini', 'gpt-5.1-mini')
) as v (external_id, api_model)
join public.providers p on p.slug = 'chatgpt'
where m.provider_id = p.id and m.external_id = v.external_id;
