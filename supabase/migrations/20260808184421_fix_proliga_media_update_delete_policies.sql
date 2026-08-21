drop policy if exists "proliga_media_update" on storage.objects;
drop policy if exists "proliga_media_delete" on storage.objects;

create policy "proliga_media_update" on storage.objects for update to public
using (
  bucket_id = 'proliga-media' and (
    ((storage.foldername(name))[1] = 'profiles' and (auth.uid())::text = (storage.foldername(name))[2])
    or
    ((storage.foldername(name))[1] = 'portfolio' and (storage.foldername(name))[2] in (select id::text from public.profiles where user_id = auth.uid()))
  )
);

create policy "proliga_media_delete" on storage.objects for delete to public
using (
  bucket_id = 'proliga-media' and (
    ((storage.foldername(name))[1] = 'profiles' and (auth.uid())::text = (storage.foldername(name))[2])
    or
    ((storage.foldername(name))[1] = 'portfolio' and (storage.foldername(name))[2] in (select id::text from public.profiles where user_id = auth.uid()))
  )
);
