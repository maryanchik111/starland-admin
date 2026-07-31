-- AlterTable
ALTER TABLE "app_users" ADD COLUMN     "avatar_path" TEXT;

-- Create private storage bucket for people photos
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public)
    values ('people-photos', 'people-photos', false)
    on conflict (id) do nothing;
  end if;
end $$;
