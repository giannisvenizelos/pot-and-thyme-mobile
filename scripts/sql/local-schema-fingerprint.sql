\set ON_ERROR_STOP on
SET search_path = pg_catalog;
SET row_security = off;

-- Every result is a single canonical jsonb value. psql's unaligned output is
-- sorted once more by the caller before hashing, so catalog scan order is irrelevant.
WITH app_ns AS (
  SELECT oid, nspname, nspacl FROM pg_namespace
  WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
    AND nspname NOT IN ('auth','extensions','graphql','graphql_public','net','pgbouncer','realtime','storage','supabase_functions','supabase_migrations','vault')
), objects AS (
  SELECT jsonb_build_object('kind','schema','schema',nspname) value FROM app_ns
  UNION ALL
  SELECT jsonb_build_object('kind','column','schema',n.nspname,'table',c.relname,
    'name',a.attname,'position',a.attnum,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),
    'not_null',a.attnotnull,'default',pg_catalog.pg_get_expr(d.adbin,d.adrelid),
    'identity',a.attidentity,'generated',a.attgenerated)
  FROM app_ns n JOIN pg_class c ON c.relnamespace=n.oid
  JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
  WHERE c.relkind IN ('r','p','v','m','f')
  UNION ALL
  SELECT jsonb_build_object('kind','relation','schema',n.nspname,'name',c.relname,
    'relation_kind',c.relkind,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
    'definition',CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) END)
  FROM app_ns n JOIN pg_class c ON c.relnamespace=n.oid WHERE c.relkind IN ('r','p','v','m','f')
  UNION ALL
  SELECT jsonb_build_object('kind','constraint','schema',n.nspname,'table',c.relname,
    'name',x.conname,'type',x.contype,'definition',pg_get_constraintdef(x.oid,true))
  FROM app_ns n JOIN pg_class c ON c.relnamespace=n.oid JOIN pg_constraint x ON x.conrelid=c.oid
  UNION ALL
  SELECT jsonb_build_object('kind','index','schema',n.nspname,'table',c.relname,
    'name',i.relname,'definition',pg_get_indexdef(i.oid))
  FROM app_ns n JOIN pg_class c ON c.relnamespace=n.oid JOIN pg_index x ON x.indrelid=c.oid JOIN pg_class i ON i.oid=x.indexrelid
  UNION ALL
  SELECT jsonb_build_object('kind','routine','schema',n.nspname,'name',p.proname,
    'identity_args',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid),
    'language',l.lanname,'security_definer',p.prosecdef,'config',p.proconfig,'definition',pg_get_functiondef(p.oid))
  FROM app_ns n JOIN pg_proc p ON p.pronamespace=n.oid JOIN pg_language l ON l.oid=p.prolang
  UNION ALL
  SELECT jsonb_build_object('kind','trigger','schema',n.nspname,'table',c.relname,
    'name',t.tgname,'definition',pg_get_triggerdef(t.oid,true),'enabled',t.tgenabled)
  FROM app_ns n JOIN pg_class c ON c.relnamespace=n.oid JOIN pg_trigger t ON t.tgrelid=c.oid WHERE NOT t.tgisinternal
  UNION ALL
  SELECT jsonb_build_object('kind','policy','schema',n.nspname,'table',c.relname,'name',p.polname,
    'permissive',p.polpermissive,'command',p.polcmd,
    'roles',(SELECT jsonb_agg(COALESCE(r.rolname,'public') ORDER BY COALESCE(r.rolname,'public')) FROM unnest(p.polroles) z(role_oid) LEFT JOIN pg_roles r ON r.oid=z.role_oid),
    'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))
  FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.oid IN (SELECT oid FROM app_ns) OR n.nspname='storage'
  UNION ALL
  SELECT jsonb_build_object('kind','grant','object_type','SCHEMA','schema',n.nspname,
    'object',n.nspname,'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
    'privilege',x.privilege_type,'grantable',x.is_grantable)
  FROM app_ns n CROSS JOIN LATERAL aclexplode(n.nspacl) x WHERE n.nspacl IS NOT NULL
  UNION ALL
  SELECT jsonb_build_object('kind','grant','object_type','RELATION','schema',n.nspname,
    'object',c.relname,'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
    'privilege',x.privilege_type,'grantable',x.is_grantable)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) x
  WHERE c.relacl IS NOT NULL AND (n.oid IN (SELECT oid FROM app_ns) OR n.nspname='storage')
  UNION ALL
  SELECT jsonb_build_object('kind','grant','object_type','COLUMN','schema',n.nspname,
    'object',c.relname,'column',a.attname,'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
    'privilege',x.privilege_type,'grantable',x.is_grantable)
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  CROSS JOIN LATERAL aclexplode(a.attacl) x
  WHERE a.attacl IS NOT NULL AND (n.oid IN (SELECT oid FROM app_ns) OR n.nspname='storage')
  UNION ALL
  SELECT jsonb_build_object('kind','grant','object_type','ROUTINE','schema',n.nspname,
    'object',p.proname,'identity_args',pg_get_function_identity_arguments(p.oid),
    'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
    'privilege',x.privilege_type,'grantable',x.is_grantable)
  FROM pg_proc p JOIN app_ns n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(p.proacl) x
  WHERE p.proacl IS NOT NULL
  UNION ALL
  SELECT jsonb_build_object('kind','publication','name',p.pubname,'all_tables',p.puballtables,
    'insert',p.pubinsert,'update',p.pubupdate,'delete',p.pubdelete,'truncate',p.pubtruncate)
  FROM pg_publication p
  UNION ALL
  SELECT jsonb_build_object('kind','publication_relation','publication',p.pubname,'schema',n.nspname,'table',c.relname,
    'columns',(SELECT jsonb_agg(a.attname ORDER BY a.attnum) FROM unnest(CASE WHEN pr.prattrs IS NULL THEN ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid=c.oid AND attnum>0 AND NOT attisdropped) ELSE pr.prattrs::smallint[] END) x(attnum) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=x.attnum),
    'filter',pg_get_expr(pr.prqual,pr.prrelid))
  FROM pg_publication_rel pr JOIN pg_publication p ON p.oid=pr.prpubid JOIN pg_class c ON c.oid=pr.prrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.oid IN (SELECT oid FROM app_ns) OR n.nspname='storage'
  UNION ALL
  SELECT jsonb_build_object('kind','storage_policy_dependency','policy',p.polname,'dependent_schema',dn.nspname,
    'dependent_object',COALESCE(dc.relname,dp.proname),'dependent_kind',COALESCE(dc.relkind::text,'routine'))
  FROM pg_policy p JOIN pg_class sc ON sc.oid=p.polrelid JOIN pg_namespace sn ON sn.oid=sc.relnamespace
  JOIN pg_depend d ON d.classid='pg_policy'::regclass AND d.objid=p.oid
  LEFT JOIN pg_class dc ON d.refclassid='pg_class'::regclass AND dc.oid=d.refobjid
  LEFT JOIN pg_proc dp ON d.refclassid='pg_proc'::regclass AND dp.oid=d.refobjid
  LEFT JOIN pg_namespace dn ON dn.oid=COALESCE(dc.relnamespace,dp.pronamespace)
  WHERE sn.nspname='storage' AND (dc.oid IS NOT NULL OR dp.oid IS NOT NULL)
)
SELECT value::text FROM objects ORDER BY value::text;
