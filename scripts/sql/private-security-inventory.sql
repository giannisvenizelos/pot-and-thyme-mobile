-- Focused, read-only evidence for private tables without RLS and SECURITY DEFINER routines.
-- This intentionally reads catalog metadata only; no application rows or function calls.
begin transaction read only;
select json_build_object('kind','private_table_without_rls','schema',n.nspname,
 'relation',c.relname,'owner',pg_get_userbyid(c.relowner),'rls_enabled',c.relrowsecurity,
 'rls_forced',c.relforcerowsecurity,'table_acl',c.relacl)
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='private' and c.relkind in ('r','p') and not c.relrowsecurity
order by n.nspname,c.relname;
select json_build_object('kind','security_definer_function','schema',n.nspname,'name',p.proname,
 'identity_arguments',pg_get_function_identity_arguments(p.oid),
 'owner',pg_get_userbyid(p.proowner),'language',l.lanname,'config',p.proconfig,
 'search_path_fixed',coalesce(p.proconfig,'{}'::text[]) && array['search_path=','search_path=""'],
 'execute_acl',p.proacl,'definition',pg_get_functiondef(p.oid))
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
join pg_language l on l.oid=p.prolang
where p.prosecdef and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid);
commit;
