# Plano em 4 rodadas

Você marcou **todas** as opções. Cada uma é uma rodada por si só — se eu tentar tudo junto, nada sai bem feito e o build quebra. Vou executar em fases, começando agora pela Fase 1.

## Fase 1 — AGORA (esta rodada)
Correções + redesigns + jogos MVP. Base 100% funcional.

- **GIFs Tenor**: verificar `TENOR_API_KEY`, testar chamada real via server function logs, corrigir causa raiz (não só mensagem de erro)
- **Redesign feed**: cards com melhor hierarquia, avatar+nome/hora mais elegantes, ações (like/comment/save) redesenhadas, media com cantos e ratio consistentes, skeleton mais suave
- **Redesign player de vídeos/Reels**: overlays com gradient mais suave, controles maiores/mais tocáveis, barra de progresso visível, contador de views, transição entre reels mais fluida
- **Melhorias no chat**: bolhas com melhor spacing, timestamps agrupados, avatars em grupo, entrada de mensagem redesenhada, header mais limpo
- **Aba Jogos (MVP com ranking)**:
  - Nova rota `/games` no shell + item no nav
  - 4 jogos: 2048, Snake, Memória, Reação (todos canvas/DOM, sem lib externa pesada)
  - Tabela `game_scores` (user_id, game, score, created_at) + RLS
  - Página de leaderboard global por jogo (top 20)
- Build TypeScript limpo ao final

## Fase 2 — próxima rodada
**Spotify OAuth + música no perfil**
- Registro do app Spotify em developer.spotify.com (você faz, eu guio)
- Secrets `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET`
- Rota `/auth/spotify/callback` + troca de code por token
- Tabela `user_spotify_connections` (token cifrado)
- Componente seletor de faixa no editor de perfil
- Embed do player oficial no perfil público
- Fallback: cola link Spotify → embed simples (sem OAuth) para quem não conectar

## Fase 3 — rodada dedicada
**Editor de vídeo estilo TikTok (parte 1: gravação + filtros + trim)**
- Gravação MediaRecorder multi-clip
- Preview com filtros CSS/WebGL (glow, vintage, bw, warm, cold, vhs, blur)
- Trim de início/fim visual
- Texto animado sobreposto (posição, cor, tamanho, entrada)
- Stickers básicos
- Upload direto para bucket `posts`

## Fase 4 — rodada dedicada
**Editor TikTok (parte 2: música + export)**
- ffmpeg.wasm carregado sob demanda (grande, ~30MB)
- Biblioteca de músicas via Jamendo API (licença livre) — Spotify não permite mixar áudio deles legalmente
- Mix de áudio + vídeo no cliente
- Export final MP4 para o feed

## Tecnicamente
- Nova tabela `game_scores` com RLS: user_id ref auth.users, game TEXT, score INT, created_at. SELECT liberado para authenticated, INSERT só próprio user, sem update/delete.
- Nova rota `/games` (índice com grid dos jogos) e `/games/$id` para cada jogo.
- Jogos escritos em canvas/DOM puro para não pesar o bundle.
- Redesigns só mexem em CSS/JSX (sem tocar lógica de negócio).
- GIF fix: verificar logs, testar a chave, corrigir tratamento.

## Confirme
Digite **"vai fase 1"** para eu começar. Fases 2-4 são rodadas separadas depois.