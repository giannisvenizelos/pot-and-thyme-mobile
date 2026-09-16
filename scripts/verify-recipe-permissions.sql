-- All fixtures are rolled back; existing recipes and accounts are untouched.
begin;
do $$
declare owner_id uuid; user_id uuid; stranger_id uuid:=gen_random_uuid(); curated_id integer; community_id integer;
  v_path text; denied boolean; data jsonb:='{"title":"Permission test","meal":"Μεσημεριανά","servings":1,"ingredients":[{"qty_min":1,"qty_max":2,"unit":"τεμ.","item":"Test ingredient","category":"Test category","option_code":"A"}],"steps":[{"instruction":"Test step"}]}';
begin
  select id into owner_id from auth.users where lower(email)='giannis.venizelos@gmail.com';
  select id into user_id from auth.users where id<>owner_id order by created_at limit 1;
  if owner_id is null or user_id is null then raise exception 'Owner and one existing user are required for permission verification'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if not public.recipe_management_access() then raise exception 'Owner access failed'; end if;
  curated_id:=public.save_recipe(null,data);
  v_path:=owner_id::text||'/'||curated_id||'/'||gen_random_uuid()||'.jpg';
  insert into storage.objects(bucket_id,name,owner_id) values('recipe-photos',v_path,owner_id::text);
  perform public.set_recipe_photo(curated_id,v_path);
  if not exists(select 1 from public.recipes where id=curated_id and photo_url like '%recipe-photos/%' and recipe_origin='curated') then raise exception 'Owner photo linking failed'; end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'role','authenticated')::text,true);
  if public.recipe_management_access() or public.can_manage_recipe(curated_id) then raise exception 'Ordinary user gained curated access'; end if;
  denied:=false;begin perform public.save_recipe(curated_id,data);exception when others then denied:=position('δικαίωμα' in sqlerrm)>0;end;
  if not denied then raise exception 'Curated edit was not denied'; end if;
  denied:=false;begin perform public.set_recipe_photo(curated_id,null);exception when others then denied:=position('δικαίωμα' in sqlerrm)>0;end;
  if not denied then raise exception 'Curated photo removal was not denied'; end if;
  denied:=false;begin perform public.delete_recipe(curated_id);exception when others then denied:=position('δικαίωμα' in sqlerrm)>0;end;
  if not denied then raise exception 'Curated delete was not denied'; end if;
  denied:=false;begin insert into storage.objects(bucket_id,name,owner_id) values('recipe-photos',user_id::text||'/'||curated_id||'/'||gen_random_uuid()||'.jpg',user_id::text);exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'Curated upload was not denied'; end if;

  community_id:=public.save_recipe(null,data);
  if not public.can_manage_recipe(community_id) then raise exception 'Own community edit failed'; end if;
  v_path:=user_id::text||'/'||community_id||'/'||gen_random_uuid()||'.jpg';
  insert into storage.objects(bucket_id,name,owner_id) values('recipe-photos',v_path,user_id::text);
  perform public.set_recipe_photo(community_id,v_path);
  if not exists(select 1 from public.recipes where id=community_id and recipe_origin='community' and moderation_status='pending') then raise exception 'Community submission did not stay pending'; end if;
  perform public.save_recipe(community_id,data);
  if not exists(select 1 from public.recipe_ingredients where recipe_id=community_id and qty_max=2 and category='Test category' and option_code='A') then raise exception 'Ingredient variant metadata was lost'; end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',stranger_id,'role','authenticated')::text,true);
  if public.can_manage_recipe(community_id) then raise exception 'Foreign community access was allowed'; end if;
  if exists(select 1 from storage.objects where bucket_id='recipe-photos' and name=v_path) then raise exception 'Pending photo leaked to another user'; end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  if not public.can_manage_recipe(community_id) then raise exception 'Owner cannot manage user submissions'; end if;
  perform public.save_recipe(community_id,data);
  perform public.delete_recipe(curated_id);
  if exists(select 1 from public.recipes where id=curated_id) then raise exception 'Deleted recipe remains visible'; end if;
  perform public.restore_recipe(curated_id);
  if not exists(select 1 from public.recipes where id=curated_id) then raise exception 'Undo delete failed'; end if;
  execute 'reset role';
end $$;
rollback;
