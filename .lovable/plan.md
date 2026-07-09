## Fase 4 — Streaming Amigo (YouTube) + correção de chamadas + fix likes/comments

Três frentes em uma entrega:

---

### 1) Bug de likes / comentários (correção rápida)

**Sintoma:** ao curtir, o like "some" e não dá para comentar.

**Causa provável:** o `onSettled` do `toggleLike` chama `invalidateQueries({ queryKey: ["feed"] })` a cada clique, e o refetch do feed sobrescreve o estado otimista antes do INSERT/DELETE propagar (corrida). Além disso, se houver erro na mutation não há `onError` para reverter — o like some. Comentar depende do mesmo card/rota; se o refetch dispara e retorna vazio por causa de RLS/erro, o botão fica inerte.

**Correção:**
- Adicionar `onError` no `toggleLike` para reverter o estado otimista e mostrar erro.
- Fazer o `mutationFn` retornar erro real (`{ error }` do Supabase) em vez de silenciar.
- Trocar `invalidateQueries` por `refetchQueries` só quando não houver mutation em voo, ou simplesmente remover o `invalidateQueries` já que o estado otimista é suficiente (o contador real é reconciliado na próxima navegação).
- Verificar RLS de `likes` e `comments` (SELECT/INSERT policies) e GRANTs — se estiverem faltando, corrigir por migração.
- Investigar o botão de comentário: confirmar que `/p/$id` abre e que `comments-sheet` está montado corretamente.

---

### 2) Correção do áudio nas chamadas 1:1 + melhorias

**Problema atual:** chamada conecta mas sem áudio audível entre os pares.

**Causas prováveis identificadas em `call-provider.tsx` / `call-screen.tsx`:**
- No modo `audio`, o `remoteRef` é um `<audio>` — mas o elemento é montado dentro de um container com condicional que pode não anexar o `srcObject` antes da faixa chegar (o `useEffect` roda, mas o `<audio>` só existe se `isVideo` for false — ok — porém sem `autoPlay` garantido em iOS até haver gesto).
- Falta `playsInline` no `<audio>` e falta chamar `.play()` explicitamente após atribuir `srcObject` (Safari/iOS bloqueia autoplay de MediaStream sem play() manual).
- O `remoteStream` é reconstruído (`new MediaStream(remote.getTracks())`) a cada `ontrack`, o que reseta o `srcObject` e pode cortar o áudio em alguns navegadores.
- Sem elemento `<audio>` dedicado para a trilha de áudio no modo vídeo — o áudio depende do elemento `<video>`; se `muted` estiver por engano, some.

**Correções:**
- Sempre montar um `<audio autoPlay playsInline>` oculto para a stream remota, independentemente de ser áudio ou vídeo, e chamar `element.play()` no `useEffect` com try/catch.
- Não recriar `MediaStream` a cada `ontrack`; adicionar a track à stream existente e forçar re-render via key/estado separado.
- Garantir que `getUserMedia` peça `audio: { echoCancellation, noiseSuppression, autoGainControl }` (já está) e adicionar sample rate.
- Adicionar renegociação: `pc.onnegotiationneeded` → novo offer/answer.
- Adicionar `pc.oniceconnectionstatechange` → se `failed`/`disconnected`, tentar `pc.restartIce()`.

**Melhorias de UI/áudio:**
- Botão viva-voz (alterna sinkId entre `default` e `speaker` via `HTMLMediaElement.setSinkId()` quando suportado).
- Seletor de saída de áudio (dropdown com `enumerateDevices()` filtrando `audiooutput`).
- Indicador visual de microfone ativo (nível de áudio via `AudioContext` + `AnalyserNode`).
- Controle de volume da chamada (slider ligado a `audio.volume`).
- Wake Lock API para manter tela/áudio ativos em background quando permitido.

---

### 3) Streaming Amigo — YouTube (nova funcionalidade)

**Arquitetura preparada para múltiplas plataformas** (interface `Provider` com métodos `mount/play/pause/seek/getState`), mas nesta entrega apenas YouTube é implementado.

**Backend (migração):**
- `watch_rooms` (id, host_id, provider text default 'youtube', video_id text, title text, is_private bool, invite_code text unique, created_at, closed_at)
- `watch_room_members` (room_id, user_id, joined_at, left_at, is_host bool) — PK composta
- `watch_room_state` (room_id PK, position_sec numeric, playing bool, updated_at, updated_by uuid) — 1 linha por sala; upsert
- `watch_room_messages` (id, room_id, sender_id, content, kind, media_url, created_at)
- Todas com RLS: SELECT/INSERT/UPDATE só para membros da sala; host pode fechar sala e transferir host.
- Função `is_room_member(_room, _user)` SECURITY DEFINER.
- Função `transfer_host(_room, _new_host)` que valida caller = host atual.
- GRANTs completos.
- Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE watch_room_state, watch_room_messages, watch_room_members`.

**Frontend:**
- Nova rota `_authenticated/watch.tsx` — lista salas do usuário + botão "Criar sala" e "Entrar por código/link".
- Nova rota `_authenticated/watch.$roomId.tsx` — sala de streaming.
  - Painel esquerdo: player YouTube (IFrame API, sem chave), controles Play/Pause/Seek/±10s.
  - Painel direito (empilhado no mobile): abas Chat / Participantes.
  - Header: título + código de convite copiável + botão sair.
  - Ao entrar: `INSERT` em `watch_room_members`; ao sair/unmount: `UPDATE left_at`.
  - Se todos saírem: trigger no backend fecha a sala (`closed_at`).
- Sincronização:
  - Host escreve em `watch_room_state` a cada play/pause/seek e a cada 5s (heartbeat).
  - Convidados assinam Realtime em `watch_room_state`; se drift > 1.5s, `seekTo`; ajuste de play/pause.
  - Host pode ser transferido via botão "Passar comando" na lista de participantes (chama `transfer_host`).
  - Qualquer membro pode "pedir controle" (mensagem no chat com botão de aceitar do host) OU controle liberado (flag `open_control` na sala — decisão: liberado por padrão em sala privada).
- Chat: reusa padrão de `chat_messages`, tabela dedicada `watch_room_messages` para isolar.
- Voz/vídeo opcional: botão "Iniciar chamada de voz/vídeo" na sala — reusa mesh WebRTC 1:1 já existente para até 2 pessoas nesta entrega (grupos completos ficam na Fase 3 seguinte). Se a sala tem mais de 2, botão fica desabilitado com tooltip "Chamada em grupo em breve".
- Convite: link `/watch/<code>` (rota pública que redireciona para `/watch/$roomId` após login).
- Entrada no bottom nav: nova aba "Assistir" (ícone Tv) OU item no menu +. Decisão: adicionar ao menu + para não sobrecarregar o nav.
- Fullscreen: usa Fullscreen API sobre o container do player; sincronização continua funcionando.

**Preparação para outras plataformas** (não implementado agora, só estrutura):
- Interface `WatchProvider` em `src/lib/watch/provider.ts` com `youtube.ts` implementando.
- Futuro: `co-watch.ts` para Netflix/Disney+ apenas com timer compartilhado.

---

### Verificação
- `tsgo` limpo.
- Playwright: abrir 2 abas, criar sala com vídeo YouTube, dar play numa e verificar sync na outra; testar transferência de host; testar chat.
- Testar chamada de voz em 2 abas com áudio real (verificar `srcObject` e nível).
- Testar like/comentário: curtir → recarregar → contador correto; comentar → aparece.

---

### Arquivos principais
- **Migração**: `supabase/migrations/<timestamp>_watch_rooms.sql`
- **Novo**: `src/routes/_authenticated/watch.tsx`, `src/routes/_authenticated/watch.$roomId.tsx`, `src/components/watch/*` (player, chat, participants, invite), `src/lib/watch/provider.ts`, `src/lib/watch/youtube.ts`
- **Editar**: `src/components/call-provider.tsx`, `src/components/call-screen.tsx`, `src/lib/webrtc.ts` (renegociação, ICE restart, sinkId)
- **Editar**: `src/components/post-card.tsx` (fix like), possivelmente migração de RLS/GRANT em `likes`/`comments` se faltar.

---

**Confirma para eu iniciar?** Se quiser priorizar apenas 1 ou 2 dessas frentes agora (por exemplo, fix de likes + áudio da chamada primeiro, Streaming Amigo depois), me diga.