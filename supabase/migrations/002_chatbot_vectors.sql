-- Run after 001_starter.sql in the Supabase SQL editor.
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
set search_path = public, extensions;

create table if not exists public.chatbot_documents (
  id uuid primary key,
  document_id uuid not null,
  chunk_index integer not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536) not null,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists chatbot_documents_embedding_idx
  on public.chatbot_documents using hnsw (embedding vector_cosine_ops);

alter table public.chatbot_documents enable row level security;
revoke all on public.chatbot_documents from anon, authenticated;
grant select, insert, update, delete on public.chatbot_documents to service_role;

create or replace function public.match_chatbot_documents(
  query_embedding vector(1536),
  match_count integer default 4,
  min_similarity double precision default 0.3
)
returns table (id uuid, content text, metadata jsonb, similarity double precision)
language sql stable security invoker
set search_path = public, extensions
as $$
  select d.id, d.content, d.metadata,
    1 - (d.embedding <=> query_embedding) as similarity
  from public.chatbot_documents d
  where 1 - (d.embedding <=> query_embedding) >= min_similarity
  order by d.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 10);
$$;

revoke all on function public.match_chatbot_documents(vector, integer, double precision) from public, anon, authenticated;
grant execute on function public.match_chatbot_documents(vector, integer, double precision) to service_role;
