-- Single-user-first cloud model. Every row belongs to auth.uid(); the schema can add space members later.
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '多米', identity jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.recordings (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  cat_id uuid references public.cats(id) on delete set null,
  title text not null, mood text not null default 'sweet', tags text[] not null default '{}', note text not null default '',
  duration_seconds numeric not null default 0, pitch numeric, level numeric, waveform jsonb,
  trim_start numeric not null default 0, trim_end numeric not null default 0, favorite boolean not null default false,
  audio_path text, mime_type text, client_updated_at timestamptz not null default now(), deleted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.devices (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  device_key text not null, platform text not null check (platform in ('web','windows','macos','android','ios')),
  label text, last_seen_at timestamptz not null default now(), created_at timestamptz not null default now(),
  unique (user_id, device_key)
);

create table public.pet_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cat_name text not null default '多米', work_minutes integer not null default 50 check (work_minutes between 5 and 240),
  rest_minutes integer not null default 3 check (rest_minutes between 1 and 30),
  corner text not null default 'bottom-right' check (corner in ('top-left','top-right','bottom-left','bottom-right')),
  reminders_paused boolean not null default false, custom_moods jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.cats enable row level security;
alter table public.recordings enable row level security;
alter table public.devices enable row level security;
alter table public.pet_settings enable row level security;

create policy "profiles_owner_all" on public.profiles for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "cats_owner_all" on public.cats for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "recordings_owner_all" on public.recordings for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "devices_owner_all" on public.devices for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "settings_owner_all" on public.pet_settings for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cat-audio', 'cat-audio', false, 26214400, array['audio/webm','audio/mp4','audio/ogg','audio/wav','audio/mpeg'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "audio_owner_select" on storage.objects for select to authenticated
using (bucket_id = 'cat-audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "audio_owner_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'cat-audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "audio_owner_update" on storage.objects for update to authenticated
using (bucket_id = 'cat-audio' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'cat-audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "audio_owner_delete" on storage.objects for delete to authenticated
using (bucket_id = 'cat-audio' and (storage.foldername(name))[1] = auth.uid()::text);

create index cats_user_idx on public.cats(user_id);
create index recordings_user_updated_idx on public.recordings(user_id, updated_at desc);
create index recordings_user_deleted_idx on public.recordings(user_id, deleted_at);
create index recordings_cat_idx on public.recordings(cat_id);
