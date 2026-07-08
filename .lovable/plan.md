# Corrigir GRANTs faltando no Data API

## Diagnóstico

Todas as 27 tabelas em `public` estão sem `GRANT` para os roles `authenticated`, `anon` e `service_role`. Isso impede o cliente (frontend + edge) de ler ou escrever, apesar das políticas RLS estarem corretas. Sintomas do usuário — "story não publica nada", "feed não deixa publicar" — batem com `permission denied for table posts/stories` mascarado no toast como falha genérica.

Causa raiz: projeto remixado de uma versão anterior aos defaults explícitos do Supabase. RLS não é o bastante — o Data API exige `GRANT` explícito.

## Correção

Uma migration que aplica os `GRANT`s corretos a **todas** as tabelas de `public`, respeitando a natureza de cada uma:

1. **Para todas as 27 tabelas:**
   - `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`
   - `GRANT ALL ... TO service_role`

2. **Adicionalmente para tabelas com policy pública de leitura** (SELECT `USING (true)`), garantir leitura anônima também usada em compartilhamento de links de posts públicos:
   - `posts`, `profiles`, `comments`, `likes`, `follows` → `GRANT SELECT ... TO anon`

Sem alteração em RLS, colunas, tipos, buckets ou código.

## Validação

- Após aplicar: `SELECT` em `information_schema.role_table_grants` confirma privilégios em cada tabela.
- Publicar um post pela aba Criar → aparece no feed.
- Publicar um story em `/stories/new` → aparece na barra de stories.
- Curtir/comentar/salvar continua funcionando.

## Fora de escopo

- Nenhuma mudança de código de aplicação — o bug é 100% de permissão de banco.
- Sem tocar em `auth`, `storage` ou outros schemas de sistema.
