-- Restricted recipe management and private photo storage.
-- Applied through Supabase's migration API; no existing recipes are removed.
create table if not exists private.recipe_management_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null references auth.users(id)
);
revoke all on private.recipe_management_owner from public, anon, authenticated;
insert into private.recipe_management_owner(singleton, user_id)
select true, id from auth.users where lower(email) = 'giannis.venizelos@gmail.com'
on conflict (singleton) do nothing;
do $$ begin
  if not exists(select 1 from private.recipe_management_owner) then
    raise exception 'Recipe management owner account was not found';
  end if;
end $$;

alter table public.recipes add column if not exists deleted_at timestamptz;
create policy recipes_hide_deleted on public.recipes as restrictive
  for select to anon, authenticated using (deleted_at is null);

create or replace function public.recipe_management_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.recipe_management_owner where user_id = (select auth.uid()));
$$;
revoke all on function public.recipe_management_access() from public, anon;
grant execute on function public.recipe_management_access() to authenticated;
create policy recipes_read_management_owner on public.recipes for select to authenticated using (public.recipe_management_access());

create or replace function public.can_manage_recipe(p_recipe_id integer)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists(
    select 1 from public.recipes r where r.id = p_recipe_id and r.deleted_at is null
      and (public.recipe_management_access() or
        (r.recipe_origin = 'community' and r.created_by = (select auth.uid())))
  );
$$;
revoke all on function public.can_manage_recipe(integer) from public, anon;
grant execute on function public.can_manage_recipe(integer) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('recipe-photos','recipe-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create policy recipe_photos_upload on storage.objects for insert to authenticated with check (
  bucket_id='recipe-photos' and (storage.foldername(name))[1]=(select auth.uid())::text
  and array_length(storage.foldername(name),1)=2
  and exists(select 1 from public.recipes r
    where r.id::text=(storage.foldername(name))[2] and public.can_manage_recipe(r.id))
);
create policy recipe_photos_read on storage.objects for select to authenticated using (
  bucket_id='recipe-photos' and exists(select 1 from public.recipes r
    where r.id::text=(storage.foldername(name))[2] and r.deleted_at is null)
);
create policy recipe_photos_delete on storage.objects for delete to authenticated using (
  bucket_id='recipe-photos' and ((storage.foldername(name))[1]=(select auth.uid())::text or public.recipe_management_access())
  and exists(select 1 from public.recipes r
    where r.id::text=(storage.foldername(name))[2] and public.can_manage_recipe(r.id))
);

create or replace function public.set_recipe_photo(p_recipe_id integer,p_path text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_url text; v_owner boolean;
begin
  perform 1 from public.recipes where id=p_recipe_id for update;
  if not public.can_manage_recipe(p_recipe_id) then raise exception 'Δεν έχεις δικαίωμα αλλαγής αυτής της φωτογραφίας.'; end if;
  v_owner := public.recipe_management_access();
  if p_path is not null then
    if split_part(p_path,'/',1) is distinct from (select auth.uid())::text
      or split_part(p_path,'/',2) is distinct from p_recipe_id::text
      or array_length(string_to_array(p_path,'/'),1)<>3
      or not exists(select 1 from storage.objects where bucket_id='recipe-photos' and name=p_path)
    then raise exception 'Η φωτογραφία δεν αντιστοιχεί στη συνταγή σου.'; end if;
    v_url := 'https://ccvdkbdnykfhenhqkicm.supabase.co/storage/v1/object/authenticated/recipe-photos/' || p_path;
  end if;
  update public.recipes set photo_url=v_url,
    moderation_status=case when not v_owner and recipe_origin='community' then 'pending' else moderation_status end,
    moderated_at=case when not v_owner and recipe_origin='community' then null else moderated_at end,
    moderated_by=case when not v_owner and recipe_origin='community' then null else moderated_by end,
    published_at=case when not v_owner and recipe_origin='community' then null else published_at end
    where id=p_recipe_id;
  return v_url;
end;
$$;
revoke all on function public.set_recipe_photo(integer,text) from public,anon;
grant execute on function public.set_recipe_photo(integer,text) to authenticated;

create or replace function public.save_recipe(p_recipe_id integer,p_data jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_id integer; v_owner boolean; v_ingredients jsonb; v_steps jsonb; v_item jsonb;
  v_pos integer:=0; v_title text; v_meal text; v_servings numeric; v_prep integer; v_cook integer;
begin
  if (select auth.uid()) is null then raise exception 'Χρειάζεται σύνδεση.'; end if;
  v_owner:=public.recipe_management_access();
  v_title:=nullif(btrim(p_data->>'title'),''); v_meal:=case p_data->>'meal' when 'Πρωινό' then 'Πρωινά' when 'Μεσημεριανό' then 'Μεσημεριανά' when 'Βραδινό' then 'Βραδινά' else p_data->>'meal' end;
  v_servings:=coalesce(nullif(p_data->>'servings','')::numeric,1);
  v_prep:=nullif(p_data->>'prep_minutes','')::integer; v_cook:=nullif(p_data->>'cook_minutes','')::integer;
  v_ingredients:=p_data->'ingredients'; v_steps:=p_data->'steps';
  if v_title is null or length(v_title)>180 then raise exception 'Ο τίτλος πρέπει να έχει 1–180 χαρακτήρες.'; end if;
  if v_meal is null or v_meal not in ('Πρωινά','Μεσημεριανά','Βραδινά','Σνακ') then raise exception 'Μη έγκυρη κατηγορία.'; end if;
  if v_servings<0.5 or v_servings>100 or v_servings::text='NaN' then raise exception 'Μη έγκυρος αριθμός μερίδων.'; end if;
  if coalesce(v_prep,0) not between 0 and 1440 or coalesce(v_cook,0) not between 0 and 1440 then raise exception 'Μη έγκυρος χρόνος.'; end if;
  if length(coalesce(p_data->>'description',''))>5000 then raise exception 'Η περιγραφή είναι πολύ μεγάλη.'; end if;
  if jsonb_typeof(v_ingredients) is distinct from 'array' or jsonb_typeof(v_steps) is distinct from 'array' then raise exception 'Συμπλήρωσε υλικά και βήματα.'; end if;
  if jsonb_array_length(v_ingredients) not between 1 and 100 or jsonb_array_length(v_steps) not between 1 and 100 then raise exception 'Χρειάζονται 1–100 υλικά και βήματα.'; end if;
  if p_recipe_id is null then
    insert into public.recipes(title,meal,subcategory,description,servings,prep_minutes,cook_minutes,created_by,recipe_origin,moderation_status,published_at)
    values(v_title,v_meal,nullif(p_data->>'subcategory',''),nullif(p_data->>'description',''),v_servings,v_prep,v_cook,(select auth.uid()),
      case when v_owner then 'curated' else 'community' end,case when v_owner then 'approved' else 'pending' end,
      case when v_owner then now() else null end) returning id into v_id;
  else
    perform 1 from public.recipes where id=p_recipe_id for update;
    if not public.can_manage_recipe(p_recipe_id) then raise exception 'Δεν έχεις δικαίωμα επεξεργασίας αυτής της συνταγής.'; end if;
    v_id:=p_recipe_id;
    update public.recipes set title=v_title,meal=v_meal,subcategory=nullif(p_data->>'subcategory',''),
      category_id=case when meal is distinct from v_meal then null else category_id end,
      subcategory_id=case when subcategory is distinct from nullif(p_data->>'subcategory','') then null else subcategory_id end,
      description=nullif(p_data->>'description',''),servings=v_servings,prep_minutes=v_prep,cook_minutes=v_cook,
      moderation_status=case when not v_owner and recipe_origin='community' then 'pending' else moderation_status end,
      moderated_at=case when not v_owner and recipe_origin='community' then null else moderated_at end,
      moderated_by=case when not v_owner and recipe_origin='community' then null else moderated_by end,
      published_at=case when not v_owner and recipe_origin='community' then null else published_at end where id=v_id;
    delete from public.recipe_ingredients where recipe_id=v_id;
    delete from public.recipe_steps where recipe_id=v_id;
  end if;
  for v_item in select value from jsonb_array_elements(v_ingredients) loop
    v_pos:=v_pos+1;
    if nullif(btrim(v_item->>'item'),'') is null then raise exception 'Συμπλήρωσε όνομα για κάθε υλικό.'; end if;
    if nullif(v_item->>'qty_min','') is null and nullif(btrim(v_item->>'raw'),'') is null then raise exception 'Συμπλήρωσε ποσότητα ή περιγραφή για κάθε υλικό.'; end if;
    if nullif(v_item->>'qty_max','') is not null and nullif(v_item->>'qty_min','') is null then raise exception 'Η μέγιστη ποσότητα χρειάζεται και ελάχιστη ποσότητα.'; end if;
    if nullif(v_item->>'qty_min','') is not null
      and ((v_item->>'qty_min')::numeric<0 or (v_item->>'qty_min')::numeric::text in ('NaN','Infinity','-Infinity')) then raise exception 'Μη έγκυρη ποσότητα.'; end if;
    if nullif(v_item->>'qty_max','') is not null
      and ((v_item->>'qty_max')::numeric<(v_item->>'qty_min')::numeric or (v_item->>'qty_max')::numeric::text in ('NaN','Infinity','-Infinity')) then raise exception 'Μη έγκυρη μέγιστη ποσότητα.'; end if;
    insert into public.recipe_ingredients(recipe_id,position,raw,qty_min,qty_max,unit,item,category,option_code)
    values(v_id,v_pos,coalesce(nullif(v_item->>'raw',''),nullif(btrim(concat_ws(' ',nullif(v_item->>'qty_min',''),v_item->>'unit',v_item->>'item')),'')),
      nullif(v_item->>'qty_min','')::numeric,case when nullif(v_item->>'qty_max','') is not null then (v_item->>'qty_max')::numeric else nullif(v_item->>'qty_min','')::numeric end,coalesce(v_item->>'unit',''),btrim(v_item->>'item'),nullif(v_item->>'category',''),nullif(v_item->>'option_code',''));
  end loop;
  v_pos:=0;
  for v_item in select value from jsonb_array_elements(v_steps) loop
    v_pos:=v_pos+1;
    if nullif(btrim(v_item->>'instruction'),'') is null or length(v_item->>'instruction')>5000 then raise exception 'Συμπλήρωσε κάθε βήμα.'; end if;
    insert into public.recipe_steps(recipe_id,position,instruction) values(v_id,v_pos,btrim(v_item->>'instruction'));
  end loop;
  return v_id;
end;
$$;
revoke all on function public.save_recipe(integer,jsonb) from public,anon;
grant execute on function public.save_recipe(integer,jsonb) to authenticated;

-- Recoverable deletion preserves references from existing household plans.
create or replace function public.delete_recipe(p_recipe_id integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.recipes where id=p_recipe_id for update;
  if not public.can_manage_recipe(p_recipe_id) then raise exception 'Δεν έχεις δικαίωμα διαγραφής αυτής της συνταγής.'; end if;
  update public.recipes set deleted_at=now() where id=p_recipe_id;
end;
$$;
revoke all on function public.delete_recipe(integer) from public,anon;
grant execute on function public.delete_recipe(integer) to authenticated;

create or replace function public.restore_recipe(p_recipe_id integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Χρειάζεται σύνδεση.'; end if;
  update public.recipes set deleted_at=null where id=p_recipe_id and deleted_at is not null
    and (public.recipe_management_access() or (recipe_origin='community' and created_by=(select auth.uid())));
  if not found then raise exception 'Δεν μπορείς να επαναφέρεις αυτή τη συνταγή.'; end if;
end;
$$;
revoke all on function public.restore_recipe(integer) from public,anon;
grant execute on function public.restore_recipe(integer) to authenticated;
notify pgrst,'reload schema';
