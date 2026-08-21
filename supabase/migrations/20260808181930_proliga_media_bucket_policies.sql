create policy "proliga_media_select" on storage.objects for select to public
using (bucket_id = 'proliga-media');

create policy "proliga_media_insert" on storage.objects for insert to public
with check (bucket_id = 'proliga-media' and auth.role() = 'authenticated');

create policy "proliga_media_update" on storage.objects for update to public
using (bucket_id = 'proliga-media' and (auth.uid())::text = (storage.foldername(name))[2]);

create policy "proliga_media_delete" on storage.objects for delete to public
using (bucket_id = 'proliga-media' and (auth.uid())::text = (storage.foldername(name))[2]);
