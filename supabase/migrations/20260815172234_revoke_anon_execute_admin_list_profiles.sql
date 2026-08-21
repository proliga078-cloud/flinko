-- O Supabase concede EXECUTE automaticamente a anon/authenticated sempre
-- que uma funcao nova e criada (via ALTER DEFAULT PRIVILEGES), independente
-- de "revoke ... from public" — a mesma licao ja aprendida antes com outras
-- funcoes. admin_list_profiles() verifica is_admin() por dentro, por isso
-- nao ha fuga de dados mesmo assim, mas nao faz sentido nenhum visitante
-- anonimo conseguir sequer chamar esta funcao.
revoke execute on function public.admin_list_profiles() from anon;
