-- Security-sensitive metadata is deliberately separated for PR 2D review.
begin transaction read only;
select json_build_object('kind','policy','schema',schemaname,'relation',tablename,'name',policyname,
 'permissive',permissive,'roles',roles,'command',cmd,'using',qual,'check',with_check)
from pg_policies order by schemaname,tablename,policyname;
select json_build_object('kind','table_grant','schema',table_schema,'relation',table_name,
 'grantor',grantor,'grantee',grantee,'privilege',privilege_type,'grantable',is_grantable)
from information_schema.role_table_grants order by table_schema,table_name,grantee,privilege_type;
select json_build_object('kind','routine_grant','schema',routine_schema,'routine',routine_name,
 'grantor',grantor,'grantee',grantee,'privilege',privilege_type,'grantable',is_grantable)
from information_schema.role_routine_grants order by routine_schema,routine_name,grantee;
select json_build_object('kind','sequence_grant','schema',n.nspname,'sequence',c.relname,
 'grantor',grantor.rolname,'grantee',case when acl.grantee=0 then 'PUBLIC' else grantee.rolname end,
 'privilege',acl.privilege_type,'grantable',acl.is_grantable)
from pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl,acldefault('S',c.relowner))) acl
join pg_roles grantor on grantor.oid=acl.grantor left join pg_roles grantee on grantee.oid=acl.grantee
where c.relkind='S' and n.nspname !~ '^pg_'
order by n.nspname,c.relname,grantee,acl.privilege_type;
select json_build_object('kind','schema_grant','schema',n.nspname,'role',r.rolname,
 'usage',has_schema_privilege(r.oid,n.oid,'USAGE'),'create',has_schema_privilege(r.oid,n.oid,'CREATE'))
from pg_namespace n cross join pg_roles r
where n.nspname !~ '^pg_' and n.nspname<>'information_schema'
and (has_schema_privilege(r.oid,n.oid,'USAGE') or has_schema_privilege(r.oid,n.oid,'CREATE'))
order by n.nspname,r.rolname;
select json_build_object('kind','default_privilege','owner',owner.rolname,'schema',n.nspname,
 'object_type',d.defaclobjtype,'grantee',case when acl.grantee=0 then 'PUBLIC' else grantee.rolname end,
 'privilege',acl.privilege_type,'grantable',acl.is_grantable)
from pg_default_acl d join pg_roles owner on owner.oid=d.defaclrole
left join pg_namespace n on n.oid=d.defaclnamespace cross join lateral aclexplode(d.defaclacl) acl
left join pg_roles grantee on grantee.oid=acl.grantee
order by owner.rolname,n.nspname,d.defaclobjtype,grantee,acl.privilege_type;
select json_build_object('kind','role_membership','role',role_name.rolname,'member',member_name.rolname,
 'grantor',grantor_name.rolname,'admin_option',m.admin_option)
from pg_auth_members m join pg_roles role_name on role_name.oid=m.roleid
join pg_roles member_name on member_name.oid=m.member
join pg_roles grantor_name on grantor_name.oid=m.grantor
order by role_name.rolname,member_name.rolname;
select json_build_object('kind','publication','name',p.pubname,'all_tables',p.puballtables,
 'insert',p.pubinsert,'update',p.pubupdate,'delete',p.pubdelete,'truncate',p.pubtruncate)
from pg_publication p order by p.pubname;
select json_build_object('kind','publication_relation','publication',p.pubname,'schema',n.nspname,'relation',c.relname)
from pg_publication_rel pr join pg_publication p on p.oid=pr.prpubid
join pg_class c on c.oid=pr.prrelid join pg_namespace n on n.oid=c.relnamespace
order by p.pubname,n.nspname,c.relname;
-- Bucket rows are configuration, not objects. No storage object names or owners are exported.
select json_build_object('kind','storage_bucket','id',id,'name',name,'public',public,
 'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types)
from storage.buckets order by id;
commit;
