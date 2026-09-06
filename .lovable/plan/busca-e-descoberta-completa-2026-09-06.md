# Busca e descoberta completa

Hoje a aba Explorar só procura pessoas por nome/@ e mostra uma grade dos posts mais recentes. Não existem hashtags, histórico, sugestões nem categorias. O plano transforma essa aba na busca global de verdade, ligada ao banco, sem tocar em feed, chat, contatos, perfil, chamadas, jogos, lives ou notificações.

## O que o usuário vai ver

**Tela inicial da busca (campo vazio)**
- Campo de busca no topo, no visual do app.
- "Pesquisas recentes" (do próprio usuário, com X para apagar uma e "Limpar histórico").
- "Você pode gostar" — sugestões vindas do que a pessoa curtiu, seguiu e das hashtags que ela abriu.
- "Em alta" — hashtags e termos que mais cresceram nos últimos dias.
- A grade de conteúdos que já existe hoje continua abaixo.

**Digitando**
- Sugestões aparecem sozinhas enquanto digita (com pequena espera para não pesar), misturando termos, hashtags e pessoas.

**Resultados**
- Abas: Tudo, Vídeos, Fotos, Usuários, Hashtags, Publicações.
- "Tudo" mistura os melhores de cada tipo, mais relevantes primeiro.
- Vídeo abre no player de Reels que já existe; foto/publicação abrem a tela de publicação; pessoa abre o perfil; hashtag abre a página da hashtag.
- Rolagem infinita, além de estados de carregando, vazio, sem resultado (com sugestões parecidas) e erro de conexão.

**Página da hashtag**
- Nome, total de publicações, abas Populares e Recentes, com fotos e vídeos reais daquela hashtag.

**Hashtags nas publicações**
- Numa legenda como "joguei muito #CrimsonDesert #Xbox", as hashtags viram links clicáveis. O resto da publicação continua igual.

## Detalhes técnicos

**Banco (migration nova, tudo com GRANT + RLS)**
- `hashtags` (id, tag normalizada única, `display_tag`, `post_count`, `score`, timestamps) — leitura pública.
- `post_hashtags` (post_id, hashtag_id) — leitura pública; escrita via trigger.
- `search_queries` (user_id, termo normalizado, created_at) — RLS: cada um lê/apaga só o seu; contagem agregada exposta apenas por função.
- `hashtag_views` (user_id, hashtag_id, created_at) para "Você pode gostar" — privado por usuário.
- Trigger em `posts` (INSERT/UPDATE de `caption`): extrai `#tags`, normaliza (minúsculas, sem acento), faz upsert em `hashtags`, sincroniza `post_hashtags` e mantém `post_count`.
- Backfill das 22 publicações existentes na mesma migration (parte aditiva da mudança de schema).
- Índices: `pg_trgm` em `posts.caption`, `profiles.username`, `profiles.display_name` e `hashtags.tag`; índices em `post_hashtags` e `search_queries(term, created_at)`.

**Funções SQL (SECURITY DEFINER, chamadas por RPC autenticada)**
- `search_all(_q, _kind, _limit, _offset)` — busca unificada com ranking: correspondência exata > prefixo > parcial/trigrama, somado a curtidas, comentários, views, seguidores do autor e recência; respeita bloqueios (`is_blocked_pair`) e posts ocultos.
- `search_suggest(_q)` — autocomplete: hashtags, termos populares e perfis.
- `trending_searches()` e `trending_hashtags()` — crescimento recente calculado sobre `search_queries` e `post_hashtags`.
- `suggested_for_me()` — hashtags/termos derivados de curtidas, seguidos e hashtags visitadas.
- `hashtag_feed(_tag, _sort, _limit, _offset)` — populares ou recentes.
- `log_search(_term)` — registra a pesquisa do usuário logado.

**Frontend**
- `src/routes/_authenticated/explore.tsx` reescrito como a tela de busca/descoberta (mantendo a grade "Em alta" atual).
- Nova rota `src/routes/_authenticated/t.$tag.tsx` para a página da hashtag.
- Novo `src/components/rich-caption.tsx` para renderizar hashtags clicáveis; usado apenas nos pontos de legenda do `post-card` (sem outras mudanças no card).
- `src/lib/search.ts` com normalização, debounce de ~250 ms e as chamadas de RPC via React Query, paginação por página e cache curto.
