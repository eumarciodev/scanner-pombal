-- Setup inicial do Folha. No Supabase, crie o bucket `scans` como público
-- para que os links compartilhados pelo WhatsApp possam abrir o PDF.
-- A aplicação está sem login nesta primeira versão; estas políticas permitem
-- acesso público. Para uso com documentos pessoais, adicione autenticação e
-- restrinja as políticas por usuário antes de publicar para outras pessoas.

create table if not exists public.scanned_documents (
  id uuid primary key,
  name text not null,
  pages integer not null,
  storage_path text not null,
  public_url text not null,
  created_at timestamptz not null default now()
);

alter table public.scanned_documents enable row level security;
create policy "public can read scanned documents"
  on public.scanned_documents for select to anon using (true);
create policy "public can add scanned documents"
  on public.scanned_documents for insert to anon with check (true);

-- Crie o bucket pelo painel Storage com o nome `scans` e marque Public.
-- Políticas do bucket para o protótipo sem login:
create policy "public can upload scans"
  on storage.objects for insert to anon with check (bucket_id = 'scans');
create policy "public can read scans"
  on storage.objects for select to anon using (bucket_id = 'scans');
