# Central de Busca e Descoberta (versão completa)

A aba Explorar vira uma central de descoberta com dois estados bem separados: antes da pesquisa (descobrir) e depois da pesquisa (resultados com abas e filtros). Tudo ligado a dados reais do app — nada de listas fixas, abas decorativas ou filtros sem efeito. Feed, chat, contatos, perfil, chamadas, jogos e lives não são alterados.

## Estado A — sem pesquisa

Ordem na tela:
1. Campo de busca ("Buscar pessoas, vídeos, fotos, hashtags e muito mais…") com botão de microfone (ditado do próprio celular; some quando o aparelho não suporta).
2. **Em alta** — chips de hashtags e assuntos com mais atenção agora, clicáveis.
3. **Pesquisas populares** — ranking numerado (1º, 2º…) com selo "↑ Em alta" e a variação real (ex.: ↑ 340%) quando houver crescimento medido.
4. **Você pode gostar** — recomendações pessoais (hashtags, pessoas, assuntos) a partir do que a pessoa curtiu, viu, seguiu, pesquisou e das hashtags que abriu.
5. **Tendências** — assuntos/hashtags subindo rápido, com número de publicações e crescimento.
6. **Pesquisas recentes** — histórico privado, apagar um a um ou limpar tudo.

Cada bloco só aparece quando tem dado real; nada de espaço vazio ou número inventado.

## Estado B — com pesquisa

1. Campo com o termo.
2. Abas: **Perguntar · Melhores · Vídeos · Fotos · Usuários · Hashtags**.
3. Linha de filtros que muda conforme a aba:
   - Vídeos/Fotos/Melhores: Todos · Não vistos · Já vistos · Recentes.
   - Ordenação: Mais relevantes · Mais recentes · Mais vistos · Mais curtidos · Mais comentados.
   - Período: Hoje · Semana · Mês · Sempre.
   - Filtro de local quando a pesquisa casa com uma cidade presente nos perfis (ex.: Sete Lagoas) — só conteúdo público.
   - Usuários e Hashtags mostram apenas os filtros que fazem sentido para eles.
4. Resultados com rolagem infinita, cartões no visual do app (miniatura real, autor, legenda, views/curtidas; vídeo abre no player de Reels, foto/publicação abre a publicação, pessoa abre o perfil, hashtag abre a página da hashtag).
5. **Você quis dizer…** quando o termo digitado se parece muito com outro bem mais usado.
6. **Pesquisas relacionadas** no fim da lista, calculadas a partir de termos e hashtags que aparecem junto.
7. Sem resultado: mensagem clara + correção sugerida + relacionadas + assuntos populares.

### Aba Perguntar
Resumo em texto gerado pela IA já existente do app, alimentado **somente** com o que foi encontrado no banco (publicações, hashtags, pessoas). Abaixo do resumo, os conteúdos usados como base. Quando o app tem pouco ou nenhum material sobre o assunto, a IA diz isso em vez de inventar.

## Hashtags

- Hashtags nas legendas continuam clicáveis (já implementado) e passam a valer também em comentários e bio.
- Página da hashtag ganha: total de publicações, crescimento/tendência, abas Populares e Recentes, e uma faixa **Relacionadas** com hashtags que mais aparecem juntas nas mesmas publicações.

## Privacidade e proteção

- Bloqueios, publicações ocultas, contas suspensas/banidas e conteúdo removido nunca aparecem.
- Histórico de pesquisa e histórico de visualização são privados de cada pessoa.
- Limite de frequência na busca e no registro de pesquisas para evitar abuso e spam de hashtags.

## Detalhes técnicos

**Banco (migration nova, com GRANT + RLS em toda tabela nova)**
- `post_views(user_id, post_id, viewed_at)` — visualização real (vídeo assistido além de ~3 s ou publicação aberta), privada por usuário; alimenta Não vistos/Já vistos.
- `search_query_stats` materializado por função: contagem por termo em janelas de 24 h / 7 d para calcular crescimento sem varrer a tabela toda; índice em `search_queries(term, created_at)`.
- `hashtags`: colunas novas `recent_count`, `growth`, `description`, atualizadas por função de recálculo; `hashtag_edges(a_id, b_id, weight)` para hashtags relacionadas, mantida por trigger em `post_hashtags`.
- `user_topic_affinity(user_id, topic, weight, updated_at)` — pesos derivados de curtidas, follows, views e hashtags abertas; usado na personalização e em "Você pode gostar".
- Índices trigram adicionais em `comments.content` não serão criados (fora de escopo); mantidos os de posts/perfis/hashtags.

**Funções SQL (SECURITY DEFINER)**
- `search_all(_q,_kind,_filter,_sort,_period,_place,_limit,_offset)` — estende a atual com filtros de visto/não visto, ordenação, período e local; ranking = correspondência exata > prefixo > trigrama, somado a curtidas, comentários, reposts, views, seguidores, recência **e** afinidade do usuário, com teto por sinal para que popularidade sozinha não domine e conteúdo novo tenha espaço.
- `search_suggest(_q)` — amplia para incluir termos compostos ("crimson desert gameplay") a partir de pesquisas reais.
- `search_did_you_mean(_q)`, `related_searches(_q)`, `related_hashtags(_tag)`, `trending_topics()`, `popular_searches()` (com ranking e crescimento), `suggested_for_me()` (usando `user_topic_affinity`), `log_post_view(_post_id)`, `recompute_trends()` com decaimento temporal para assuntos antigos saírem do topo.
- `search_ask_context(_q)` — devolve, num só payload, os melhores posts/hashtags/perfis para a IA resumir.

**Servidor / IA**
- Nova server function `searchAsk` em `src/lib/search-ask.functions.ts`, autenticada, que chama `search_ask_context` e o gateway Gemini já usado no app, com instrução explícita de não inventar e de responder em PT-BR.

**Frontend**
- `src/lib/search.ts` estendido com os novos tipos, filtros e chamadas (React Query, debounce 250 ms, cache curto, paginação).
- `src/routes/_authenticated/explore.tsx` reorganizado nos dois estados, com os componentes novos em `src/components/search/` (chips de tendência, ranking popular, lista de sugestões, barra de filtros, cartões de resultado por tipo, bloco Perguntar, relacionadas).
- `src/routes/_authenticated/t.$tag.tsx` ganha crescimento e faixa Relacionadas.
- Registro de visualização real: chamada a `log_post_view` no player de Reels e na tela de publicação, disparada por tempo/abertura, não por aparecer na lista.
- Busca por voz via reconhecimento de fala do navegador, com fallback silencioso.
