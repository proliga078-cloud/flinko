-- O nome de um perfil é público (homepage, pesquisa, páginas locais), por isso
-- nunca pode ser um endereço de email.
--
-- Acontecia no login com o Google quando a conta não trazia nome: o auth.html
-- usava o email inteiro como nome, e a homepage chegou a mostrar
-- "fulano@gmail.com" na lista de profissionais. O auth.html já foi corrigido,
-- mas a regra fica também aqui, para apanhar qualquer outro caminho (registo
-- manual com o email escrito no campo do nome, edição no dashboard, etc.).
--
-- Regra: se o nome tiver "@", fica só a parte antes do "@", com . _ - + e
-- algarismos trocados por espaços e cada palavra com maiúscula
-- ("ana.silva93@gmail.com" -> "Ana Silva"). Se não sobrar nada, fica
-- "Profissional".

create or replace function public.nome_sem_email(p_name text)
returns text
language sql
immutable
set search_path = 'public'
as $$
  select case
    when p_name is null or position('@' in p_name) = 0 then p_name
    else coalesce(
      nullif(initcap(btrim(regexp_replace(split_part(p_name, '@', 1), '[._+0-9-]+', ' ', 'g'))), ''),
      'Profissional')
  end
$$;

create or replace function public.profiles_nome_sem_email()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  new.name := public.nome_sem_email(new.name);
  return new;
end;
$$;

-- Só corre como trigger: ninguém precisa de a chamar pela API.
revoke all on function public.profiles_nome_sem_email() from public, anon, authenticated;

drop trigger if exists profiles_nome_sem_email_trg on public.profiles;
create trigger profiles_nome_sem_email_trg
  before insert or update of name on public.profiles
  for each row execute function public.profiles_nome_sem_email();

-- Corrige os perfis que já tinham o email como nome.
update public.profiles set name = public.nome_sem_email(name) where name like '%@%';
