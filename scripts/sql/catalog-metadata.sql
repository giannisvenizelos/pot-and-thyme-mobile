-- One JSON object per row. Catalog metadata only: no application table rows are read.
begin transaction read only;
select json_build_object('kind','server','version',version(),'database',current_database(),'user',current_user);
select json_build_object('kind','schema','name',nspname,'owner',pg_get_userbyid(nspowner))
from pg_namespace where nspname !~ '^pg_' and nspname <> 'information_schema' order by nspname;
select json_build_object('kind','relation','schema',n.nspname,'name',c.relname,'type',c.relkind,
 'owner',pg_get_userbyid(c.relowner),'rls_enabled',c.relrowsecurity,'rls_forced',c.relforcerowsecurity,
 'replica_identity',c.relreplident)
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname !~ '^pg_' and n.nspname <> 'information_schema' and c.relkind in ('r','p','v','m','S','f')
order by n.nspname,c.relname;
select json_build_object('kind','column','schema',n.nspname,'relation',c.relname,'position',a.attnum,
 'name',a.attname,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,
 'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated)
from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
where a.attnum>0 and not a.attisdropped and n.nspname !~ '^pg_' and n.nspname<>'information_schema'
order by n.nspname,c.relname,a.attnum;
select json_build_object('kind','constraint','schema',n.nspname,'relation',c.relname,'name',x.conname,
 'type',x.contype,'definition',pg_get_constraintdef(x.oid,true))
from pg_constraint x join pg_class c on c.oid=x.conrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname !~ '^pg_' order by n.nspname,c.relname,x.conname;
select json_build_object('kind','index','schema',schemaname,'relation',tablename,'name',indexname,'definition',indexdef)
from pg_indexes where schemaname !~ '^pg_' order by schemaname,tablename,indexname;
select json_build_object('kind','trigger','schema',n.nspname,'relation',c.relname,'name',t.tgname,
 'definition',pg_get_triggerdef(t.oid,true),'enabled',t.tgenabled)
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and n.nspname !~ '^pg_' order by n.nspname,c.relname,t.tgname;
select json_build_object('kind','function','schema',n.nspname,'name',p.proname,
 'identity_arguments',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid),
 'owner',pg_get_userbyid(p.proowner),'language',l.lanname,'volatility',p.provolatile,
 'security_definer',p.prosecdef,'config',p.proconfig,'definition',pg_get_functiondef(p.oid))
from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
where n.nspname !~ '^pg_' and n.nspname<>'information_schema' order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid);
select json_build_object('kind','extension','name',e.extname,'version',e.extversion,'schema',n.nspname)
from pg_extension e join pg_namespace n on n.oid=e.extnamespace order by e.extname;
commit;
