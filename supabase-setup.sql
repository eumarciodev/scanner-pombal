-- Execute no SQL Editor do Supabase. Os arquivos e registros ficam privados por conta.
create table if not exists public.scanned_documents (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null default 'Geral',
  ocr_text text not null default '',
  pages integer not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table public.scanned_documents add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.scanned_documents add column if not exists category text not null default 'Geral';
alter table public.scanned_documents add column if not exists ocr_text text not null default '';
alter table public.scanned_documents enable row level security;

drop policy if exists "public can read scanned documents" on public.scanned_documents;
drop policy if exists "public can add scanned documents" on public.scanned_documents;
drop policy if exists "users read own scans" on public.scanned_documents;
drop policy if exists "users add own scans" on public.scanned_documents;
drop policy if exists "users update own scans" on public.scanned_documents;
drop policy if exists "users delete own scans" on public.scanned_documents;
create policy "users read own scans" on public.scanned_documents for select to authenticated using (auth.uid() = user_id);
create policy "users add own scans" on public.scanned_documents for insert to authenticated with check (auth.uid() = user_id);
create policy "users update own scans" on public.scanned_documents for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users delete own scans" on public.scanned_documents for delete to authenticated using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('scans', 'scans', false)
on conflict (id) do update set public = false;

drop policy if exists "public can upload scans" on storage.objects;
drop policy if exists "public can read scans" on storage.objects;
drop policy if exists "users upload own scans" on storage.objects;
drop policy if exists "users read own scans files" on storage.objects;
drop policy if exists "users delete own scans files" on storage.objects;
create policy "users upload own scans" on storage.objects for insert to authenticated
  with check (bucket_id = 'scans' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users read own scans files" on storage.objects for select to authenticated
  using (bucket_id = 'scans' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users delete own scans files" on storage.objects for delete to authenticated
  using (bucket_id = 'scans' and (storage.foldername(name))[1] = auth.uid()::text);

-- Registros antigos sem user_id permanecem sem acesso até serem associados manualmente a uma conta.
