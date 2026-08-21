alter table plan_limits add column if not exists ai_actions boolean not null default false;
update plan_limits set ai_actions=true where plan in ('pro','premium');
