alter table public.profiles
  add column if not exists account_type text default 'professional';

alter table public.profiles
  drop constraint if exists profiles_account_type_check;
alter table public.profiles
  add constraint profiles_account_type_check check (account_type in ('client','professional'));
