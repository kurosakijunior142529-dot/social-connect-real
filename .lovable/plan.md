## Realidade do escopo

Você marcou 4 prioridades + editor de vídeo "completo estilo TikTok" + Spotify OAuth. Sendo honesto: editor TikTok completo (ffmpeg.wasm, timeline, filtros GL, biblioteca de músicas licenciada, stickers, texto animado) é sozinho 2-4 rodadas dedicadas. Spotify OAuth com login do usuário é 1 rodada dedicada (app Spotify Developer, secrets, callback, persistência criptografada da conexão por usuário).

Tentar tudo agora = chamadas continuam mudas, streaming continua quebrado, e o editor sai capenga. Proponho fatiar assim:

---

## Fase 1 — AGORA (esta rodada): destravar o que está quebrado

**1. Chamadas WebRTC — validação real de áudio bidirecional**
- Adicionar servidores TURN (grátis via Metered/Open Relay) — sem TURN, chamadas falham em NAT simétrico (motivo #1 de "atende e fica mudo")
- Consertar ordem `getUserMedia` → `addTrack` → `createOffer` (callee criando PC antes de aceitar)
- Garantir `<audio autoPlay playsInline>` desbloqueado com gesto do usuário no `acceptIncoming` (Safari/iOS silenciam sem isso)
- Debug logs de `iceConnectionState` e `getStats()` visíveis no dev
- Validação: rodar Playwright com 2 contextos (2 usuários fake) fazendo chamada, capturar screenshots do estado "conectado" e checar console

**2. Streaming Amigo — corrigir compartilhamento**
- Fixar bug do `join_watch_room_by_code` quando código vem de URL compartilhada
- Garantir que host reentre na própria sala após refresh (idempotência do trigger `on_watch_room_insert`)
- Provider Twitch: checar embed com `parent` correto para o domínio publicado

**3. GIFs Tenor — corrigir erro**
- Investigar erro atual (provavelmente `TENOR_API_KEY` não sendo lido no server function, ou CORS)
- Adicionar tratamento de erro visível no picker

**4. Papéis de parede — expandir**
- Adicionar 6-8 presets novos (sunset, forest, cosmic, geometric, paper, gradient mesh, etc.)
- Upload próprio: usuário escolhe imagem → upload no bucket `chats` → aplicado como wallpaper daquela conversa via `wallpaper_type='custom'` + `wallpaper_value=<path>`

**5. TypeScript build check**
- Rodar `tsgo` no final para garantir zero erros

**6. Correção de segurança**
- Remover políticas permissivas dos buckets `chat-audio`, `chat-video`, `chat-docs` que expõem mídia privada

---

## Fase 2 — próxima rodada: redesign visual

- Redesign do feed (cards mais respiráveis, transições, empty states)
- Redesign do player de vídeo/reels (controles overlay, progress bar, next/prev)
- Micro-animações consistentes

---

## Fase 3 — rodada dedicada: Spotify OAuth
- Você cria app em developer.spotify.com, me passa Client ID/Secret via `add_secret`
- Callback route, troca de código, armazenamento criptografado da conexão por usuário
- Componente "escolher faixa da minha biblioteca" no perfil
- Player embed oficial do Spotify no perfil público

---

## Fase 4 — 2-3 rodadas dedicadas: editor de vídeo TikTok
- Rodada 4a: gravação multi-clip + trim + preview
- Rodada 4b: filtros (CSS/WebGL), texto animado, stickers
- Rodada 4c: biblioteca de músicas + mixagem áudio (ffmpeg.wasm) + export
- Requer discussão sobre licenciamento de música (Jamendo API grátis? Trilhas próprias?)

---

## O que eu preciso de você para Fase 1

Nada. Posso começar já. Só confirme "vai fase 1" e eu executo tudo acima nesta rodada, com validação Playwright das chamadas no final.

Se quiser adiantar Fase 3 (Spotify), já pode ir criando o app em https://developer.spotify.com/dashboard em paralelo.
