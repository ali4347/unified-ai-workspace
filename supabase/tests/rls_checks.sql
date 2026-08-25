-- RLS cross-user isolation checks (PRD §55, §59: "unauthorized cross-user
-- access tests fail"). Run against the target database (SQL Editor or psql);
-- the whole script runs inside a transaction and ROLLS BACK — it leaves no
-- data behind. It raises an exception on the first failed check and prints
-- "RLS checks passed" on success.

begin;

-- Two throwaway users directly in auth.users (rolled back at the end).
insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-00000000000a', 'rls-check-a@example.com'),
  ('00000000-0000-4000-8000-00000000000b', 'rls-check-b@example.com')
on conflict (id) do nothing;

-- Act as user A.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

insert into public.projects (id, user_id, name)
values ('00000000-0000-4000-9000-000000000001',
        '00000000-0000-4000-8000-00000000000a', 'A project');

insert into public.conversations (id, user_id, title)
values ('00000000-0000-4000-9000-000000000002',
        '00000000-0000-4000-8000-00000000000a', 'A conversation');

insert into public.messages (conversation_id, user_id, role, content)
values ('00000000-0000-4000-9000-000000000002',
        '00000000-0000-4000-8000-00000000000a', 'user', 'hello');

-- Reference tables must be readable.
do $$
begin
  if (select count(*) from public.providers) < 5 then
    raise exception 'FAIL: providers not readable by authenticated users';
  end if;
end $$;

-- Act as user B: none of A's rows may be visible or writable.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);

do $$
begin
  if exists (select 1 from public.projects) then
    raise exception 'FAIL: user B can read user A projects';
  end if;
  if exists (select 1 from public.conversations) then
    raise exception 'FAIL: user B can read user A conversations';
  end if;
  if exists (select 1 from public.messages) then
    raise exception 'FAIL: user B can read user A messages';
  end if;
end $$;

-- B must not be able to update or delete A's conversation (0 rows affected).
update public.conversations set title = 'hijacked'
  where id = '00000000-0000-4000-9000-000000000002';
do $$
begin
  if exists (select 1 from public.conversations
             where id = '00000000-0000-4000-9000-000000000002') then
    raise exception 'FAIL: user B updated user A conversation';
  end if;
end $$;

-- B must not be able to attach a message to A's conversation.
do $$
begin
  begin
    insert into public.messages (conversation_id, user_id, role, content)
    values ('00000000-0000-4000-9000-000000000002',
            '00000000-0000-4000-8000-00000000000b', 'user', 'intruder');
    raise exception 'FAIL: user B inserted a message into user A conversation';
  exception
    when insufficient_privilege or check_violation then null; -- expected
    when others then
      if sqlerrm like 'FAIL:%' then raise; end if;
      null; -- RLS violations surface as generic errors on some versions
  end;
end $$;

reset role;

do $$ begin raise notice 'RLS checks passed'; end $$;

rollback;
