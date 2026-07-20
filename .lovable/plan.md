Você marcou 4 prioridades. Realisticamente cabem 2-3 nesta rodada sem quebrar o resto. Multiplayer online (xadrez/UNO com Realtime) é uma rodada inteira sozinha — sincronização de estado, salas, matchmaking, reconexão, anti-cheat básico. Se eu tentar tudo junto vai sair meia-boca.

## Rodada 1 — AGORA (esta atualização)

**1. Cor verde 💚 mais brilhante**
- Trocar `--primary` de `#D7FF3A` (lima) para verde vibrante estilo emoji 💚 (algo como `#22C55E` ou `#00E676`).
- Ajustar `--ring`, `--sidebar-primary` no mesmo tom.

**2. Câmera do feed 100% funcional**
- Reforçar o fluxo em `/create/video`: botão explícito "Ativar câmera", tratar `NotAllowedError`/`NotFoundError`/iframe com mensagens claras.
- Adicionar captura de FOTO (não só vídeo) com botão dedicado, publicar direto no feed via bucket `posts`.
- Detectar preview iframe e mostrar CTA "Abrir no app publicado" (link para social-connect-real.lovable.app).

**3. GIFs estáveis**
- Auditar server function `searchGifs`: já trata 401/429, mas `GifPicker` chama a cada 250ms mesmo com query vazia. Adicionar debounce real + cache de resultados por query + retry uma vez em falha de rede.
- Testar com Playwright: abrir picker, buscar "gato", confirmar imagens carregando.

**4. Aba Jogos dedicada + 4 jogos solo novos**
Já existe `/games` com 2048, Snake, Memória, Reação. Adiciono:
- **Xadrez (vs CPU)** — engine minimax simples, 3 níveis
- **Jogo da Velha (vs CPU)** — minimax perfeito
- **Campo Minado** — 3 dificuldades, ranking por tempo
- **Sudoku** — gerador + validador, 3 dificuldades

Reorganizar `/games` em categorias: "Solo", "Puzzle", "Reflexo". Ranking global via `game_scores` (já existe).

**5. Chat IA Gemini dedicado (`/ai`)**
- Nova rota `/ai` e `/ai/$threadId` (conversas persistentes com threads).
- Tabelas novas: `ai_threads` (id, user_id, title, updated_at) + `ai_messages` (id, thread_id, role, content, image_url, created_at). RLS por dono.
- UI: sidebar de threads + área de chat com markdown, streaming, avatar Gemini.
- Streaming via server route `/api/ai/chat` usando `google/gemini-3.1-pro-preview` (rápido e capaz).
- Geração de imagem: comando `/imagem <prompt>` ou botão dedicado → `google/gemini-3.1-flash-image`, salva no bucket e exibe inline.
- Sem tool-calling complexo nesta rodada (evita bugs).

**6. Limpeza visual do feed**
- Já movi Explorar/Alertas pra header. Agora: remover badges duplicados, apertar spacing dos cards, cards sem borda dupla.
- Bottom nav mobile: **Feed · Reels · Criar · Jogos · Perfil** (5 slots, sem apertar).

## Rodada 2 — próxima (dedicada a multiplayer)

Só depois que rodada 1 estiver validada. Faço:
- **Xadrez online 1v1** — salas, matchmaking simples (fila), sincronização de jogadas via Supabase Realtime, chat na partida, timer.
- **UNO 4 players** — mais complexo (deck, ordem, cartas especiais). Pode virar rodada 3 sozinho se ficar grande.
- Reconexão automática se perder conexão em partida ativa.

## Rodada 3 — se necessário

- Mais jogos (batalha naval, dominó, damas).
- Torneios/ranking sazonal.

## Como valido rodada 1

- Playwright no app publicado: abrir /create/video, clicar "Ativar câmera", tirar screenshot.
- Buscar GIF "gato", screenshot dos resultados.
- Abrir /games, screenshot mostrando novos jogos.
- Criar thread no /ai, mandar "olá" e "/imagem gato astronauta", screenshot do resultado.

## Detalhes técnicos (você não precisa ler)

- Verde novo: `oklch(0.72 0.20 145)` ≈ `#22C55E`. Ajustar contraste do `--primary-foreground` pra `#0A0A0B` continua ok.
- IA threads: `ai_threads` com FK cascade em delete de usuário; `ai_messages.role` enum `user|assistant|system`; `image_url` nullable aponta pro bucket `posts` (reaproveitar).
- Streaming Gemini: `streamText` do AI SDK + `toUIMessageStreamResponse`, `useChat` no cliente com transport apontando pra `/api/ai/chat`.
- Imagens: fluxo `/v1/images/generations` com `stream: true` (ver `ai-image-generation-tanstack`), salva blob final no bucket `posts/ai/{uid}/`.
- Xadrez engine: biblioteca `chess.js` pra regras + minimax próprio (3-4 plies) pra IA. Evita `stockfish.wasm` (peso alto).
- Sudoku gerador: algoritmo simples de remoção de células a partir de solução válida.

Confirma que ataco Rodada 1 agora e multiplayer fica pra próxima?