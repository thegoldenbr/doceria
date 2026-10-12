-- ============================================================
-- SCRIPT DE BANCO DE DADOS — Controle de Estoque da Doceria
-- Cole este script inteiro no SQL Editor do Supabase e clique em "Run".
-- ============================================================

-- Extensão necessária para gerar IDs únicos (gen_random_uuid)
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- TABELA: produtos
-- ------------------------------------------------------------
create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text not null default 'geladinho',
  preco numeric(10,2),
  quantidade integer not null default 0 check (quantidade >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Se a tabela já existia antes desta coluna ser criada, adiciona agora
-- (não afeta nada se você já rodou este script com a coluna incluída).
alter table produtos add column if not exists ativo boolean not null default true;
alter table produtos add column if not exists categoria text not null default 'geladinho';
alter table produtos drop constraint if exists produtos_categoria_check;
-- Categorias são livres (o usuário cria novas na aba Config.), então não há mais restrição de valores.

-- Ajuda a migrar produtos antigos para a aba correta.
update produtos
  set categoria = 'trufas'
  where lower(nome) like '%trufa%';

-- Nome único por categoria, sem diferenciar maiúsculas/minúsculas
drop index if exists produtos_nome_unico;
create unique index if not exists produtos_nome_categoria_unico
  on produtos (lower(nome), categoria);

-- ------------------------------------------------------------
-- TABELA: movimentacoes
-- quantidade guarda a variação aplicada ao estoque (delta):
--   venda   -> negativa (ex: -1)
--   entrada -> positiva (ex: +1)
--   ajuste  -> diferença entre o valor novo e o antigo (pode ser + ou -)
-- ------------------------------------------------------------
create table if not exists movimentacoes (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos(id) on delete cascade,
  tipo text not null check (tipo in ('venda', 'entrada', 'ajuste')),
  quantidade integer not null,
  preco_unitario numeric(10,2),
  criado_em timestamptz not null default now()
);

create index if not exists movimentacoes_produto_idx on movimentacoes (produto_id);
create index if not exists movimentacoes_criado_em_idx on movimentacoes (criado_em);

-- ------------------------------------------------------------
-- FUNÇÃO: registrar_venda
-- Dá baixa no estoque e registra a movimentação numa única operação.
-- Recusa a venda se não houver estoque suficiente.
-- ------------------------------------------------------------
create or replace function registrar_venda(p_produto_id uuid, p_quantidade integer default 1)
returns movimentacoes
language plpgsql
as $$
declare
  v_produto produtos;
  v_movimentacao movimentacoes;
begin
  if p_quantidade <= 0 then
    raise exception 'Quantidade da venda deve ser maior que zero';
  end if;

  select * into v_produto from produtos where id = p_produto_id for update;

  if not found then
    raise exception 'Produto não encontrado';
  end if;

  if v_produto.quantidade < p_quantidade then
    raise exception 'Estoque insuficiente para essa venda';
  end if;

  update produtos
    set quantidade = quantidade - p_quantidade
    where id = p_produto_id;

  insert into movimentacoes (produto_id, tipo, quantidade, preco_unitario)
    values (p_produto_id, 'venda', -p_quantidade, v_produto.preco)
    returning * into v_movimentacao;

  return v_movimentacao;
end;
$$;

-- ------------------------------------------------------------
-- FUNÇÃO: registrar_entrada
-- Soma unidades ao estoque (reposição) e registra a movimentação.
-- ------------------------------------------------------------
create or replace function registrar_entrada(p_produto_id uuid, p_quantidade integer default 1)
returns movimentacoes
language plpgsql
as $$
declare
  v_produto produtos;
  v_movimentacao movimentacoes;
begin
  if p_quantidade <= 0 then
    raise exception 'Quantidade da entrada deve ser maior que zero';
  end if;

  select * into v_produto from produtos where id = p_produto_id for update;

  if not found then
    raise exception 'Produto não encontrado';
  end if;

  update produtos
    set quantidade = quantidade + p_quantidade
    where id = p_produto_id;

  insert into movimentacoes (produto_id, tipo, quantidade, preco_unitario)
    values (p_produto_id, 'entrada', p_quantidade, v_produto.preco)
    returning * into v_movimentacao;

  return v_movimentacao;
end;
$$;

-- ------------------------------------------------------------
-- FUNÇÃO: registrar_ajuste
-- Define a quantidade exata em estoque (ex: contagem manual do dia)
-- e registra a diferença como movimentação do tipo 'ajuste'.
-- ------------------------------------------------------------
create or replace function registrar_ajuste(p_produto_id uuid, p_nova_quantidade integer)
returns movimentacoes
language plpgsql
as $$
declare
  v_produto produtos;
  v_delta integer;
  v_movimentacao movimentacoes;
begin
  if p_nova_quantidade < 0 then
    raise exception 'Quantidade não pode ser negativa';
  end if;

  select * into v_produto from produtos where id = p_produto_id for update;

  if not found then
    raise exception 'Produto não encontrado';
  end if;

  v_delta := p_nova_quantidade - v_produto.quantidade;

  update produtos
    set quantidade = p_nova_quantidade
    where id = p_produto_id;

  insert into movimentacoes (produto_id, tipo, quantidade, preco_unitario)
    values (p_produto_id, 'ajuste', v_delta, v_produto.preco)
    returning * into v_movimentacao;

  return v_movimentacao;
end;
$$;

-- ------------------------------------------------------------
-- FUNÇÃO: desfazer_movimentacao
-- Reverte o efeito de uma movimentação no estoque e a remove.
-- ------------------------------------------------------------
create or replace function desfazer_movimentacao(p_movimentacao_id uuid)
returns void
language plpgsql
as $$
declare
  v_mov movimentacoes;
begin
  select * into v_mov from movimentacoes where id = p_movimentacao_id for update;

  if not found then
    raise exception 'Movimentação não encontrada (pode já ter sido desfeita)';
  end if;

  update produtos
    set quantidade = quantidade - v_mov.quantidade
    where id = v_mov.produto_id;

  delete from movimentacoes where id = p_movimentacao_id;
end;
$$;

-- ------------------------------------------------------------
-- SEGURANÇA (RLS)
-- Não há login: o app usa a chave pública "anon" para tudo.
-- Liberamos leitura/escrita para o papel anon nestas duas tabelas.
-- Nunca exponha a chave "service_role" no front-end.
-- ------------------------------------------------------------
alter table produtos enable row level security;
alter table movimentacoes enable row level security;

drop policy if exists "produtos_select_anon" on produtos;
create policy "produtos_select_anon" on produtos for select to anon using (true);

drop policy if exists "produtos_insert_anon" on produtos;
create policy "produtos_insert_anon" on produtos for insert to anon with check (true);

drop policy if exists "produtos_update_anon" on produtos;
create policy "produtos_update_anon" on produtos for update to anon using (true) with check (true);

drop policy if exists "produtos_delete_anon" on produtos;
create policy "produtos_delete_anon" on produtos for delete to anon using (true);

drop policy if exists "movimentacoes_select_anon" on movimentacoes;
create policy "movimentacoes_select_anon" on movimentacoes for select to anon using (true);

drop policy if exists "movimentacoes_insert_anon" on movimentacoes;
create policy "movimentacoes_insert_anon" on movimentacoes for insert to anon with check (true);

drop policy if exists "movimentacoes_delete_anon" on movimentacoes;
create policy "movimentacoes_delete_anon" on movimentacoes for delete to anon using (true);

grant usage on schema public to anon;
grant select, insert, update, delete on produtos to anon;
grant select, insert, delete on movimentacoes to anon;
grant execute on function registrar_venda(uuid, integer) to anon;
grant execute on function registrar_entrada(uuid, integer) to anon;
grant execute on function registrar_ajuste(uuid, integer) to anon;
grant execute on function desfazer_movimentacao(uuid) to anon;
