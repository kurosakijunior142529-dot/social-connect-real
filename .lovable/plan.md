## Roadmap em 4 fases

Escopo enorme; entrego por fases e você aprova cada uma antes de eu ir para a próxima. Abaixo o plano completo com o que entra em cada fase.

---

### Fase 1 — Chat completo estilo WhatsApp + limpeza de UI  *(começar por aqui)*

**Mídias no chat** (buckets novos, privados, com signed URLs):
- `chat_audio`, `chat_video`, `chat_docs` (o bucket `chats` continua para imagens).
- Gravação de áudio (MediaRecorder, waveform simples, play inline).
- Envio de foto, vídeo, documento (PDF/qualquer), com preview e progresso.
- GIFs via Tenor API (chave pública via secret) e sticker packs internos (bucket `stickers` público read-only + tabela `sticker_packs`).
- Compartilhar localização (Geolocation API, render em mini-mapa estático via Leaflet + OSM tiles — sem chave).
- Compartilhar contato (picker de amigos → card com avatar/nome/@).
- Preview de links (server fn que faz fetch de OG tags + cache em `link_previews`).

**Mensagens**:
- Encaminhar para 1+ conversas/chats.
- Copiar (menu já existe, garantir em todos os tipos).
- Fixar mensagens (nova coluna `pinned_at` + barra no topo).
- Busca de mensagens dentro da conversa (input + highlight).
- Indicador "digitando…" e "gravando áudio…" (Realtime Presence).
- Read receipts (tabela `message_reads` + tick duplo).
- Reações, responder, editar, excluir para todos/para si — já existem, apenas polir.

**UI da conversa**:
- Remover botão "Silenciar" do header.
- Menu de 3 pontos com: Silenciar, Buscar, Fixadas, Mídia compartilhada, Bloquear, Denunciar, Limpar conversa.
- Header mais limpo (só avatar+nome+chamadas), tudo secundário no menu.

---

### Fase 2 — Feed rico + Perfil a partir do chat

**Feed / posts**:
- Composer no topo do feed (não só página `/create`).
- Múltiplas imagens em um post (carrossel swipeable) — nova tabela `post_media` (post_id, url, order, type).
- Post só de texto (media opcional).
- Enquetes: tabelas `poll_options`, `poll_votes` + UI de voto/resultado.
- Compartilhar publicação (via DM ou link).
- Editar e excluir post próprio (já há delete? garantir + edit de caption).
- Salvar já existe; garantir botão em todos os cards.

**Perfil clicável a partir do chat**:
- Avatar/nome no header da conversa e em cada mensagem viram `<Link to="/u/$username">`.
- Página de perfil já existe; garantir botões Seguir/Deixar de seguir/Bloquear/Denunciar bem visíveis e com estados corretos.

---

### Fase 3 — Chamadas em grupo até 4 + screen share

- Refactor de `call-provider` para mesh WebRTC (N-1 peer connections por participante, N ≤ 4).
- Nova tabela `call_participants` + sinalização via Realtime broadcast (offer/answer/ice por par).
- `getDisplayMedia()` para compartilhar tela; toggle no `call-screen`.
- UI de grade 2x2 responsiva, controles de mute/câmera/tela/encerrar.
- Convite para chamada em grupo a partir de um chat (todos os membros recebem push).

---

### Fase 4 — Streaming Amigo

**Rooms** (`watch_rooms`, `watch_room_members`, `watch_room_state`):
- Criação de sala por qualquer usuário, convite por link e via chat (mensagem-card).
- Chat lateral (reusa `chat_messages` com `room_id` opcional, ou tabela dedicada `watch_room_messages`).
- Chamada de voz/vídeo opcional dentro da sala (reusa Fase 3, até 4 pessoas).

**Provedores**:
- **YouTube (sync real)**: IFrame Player API. Estado `{videoId, positionSec, playing, updatedAt}` broadcast via Realtime; drift > 1.5s dispara seek automático. Host controla; convidados podem pedir controle.
- **Outras plataformas (co-watch)**: usuário cola o link (Netflix/Prime/Disney+/Max/Apple TV+/Paramount+/Crunchyroll), sistema detecta plataforma, mostra card "assistindo em Netflix — <título opcional>" e um timer compartilhado (host clica "iniciei em 0:00"), sem controlar o player. Cada participante abre no app oficial. Chat/voz/vídeo continuam sincronizados na sala.

**UI**:
- Aba nova "Assistir" no bottom nav ou entrada no menu +.
- Tela da sala: player/placeholder à esquerda, chat + participantes à direita (empilhado no mobile).

---

### Fase 5 — Polimento geral *(contínuo, ao fim de cada fase)*

- Revisão de bugs, loading states, empty states, skeletons.
- Performance: virtualização das listas longas (feed, mensagens, notificações).
- Acessibilidade e responsividade em cada tela tocada.
- Passe de design consistente (tokens, espaçamentos, tipografia).

---

### Detalhes técnicos

- **Buckets novos**: `chat_audio`, `chat_video`, `chat_docs`, `stickers` (público SELECT), `watch_rooms` (thumbs).
- **Tabelas novas**: `post_media`, `poll_options`, `poll_votes`, `link_previews`, `message_reads`, `pinned_messages` (ou coluna), `sticker_packs`, `stickers`, `call_participants`, `watch_rooms`, `watch_room_members`, `watch_room_state`, `watch_room_messages`.
- **Realtime**: presença por conversa (typing/recording), broadcast para sinalização WebRTC e para estado do watch room.
- **APIs externas**: Tenor (GIFs) — pedirei chave via `add_secret` quando chegar a hora; YouTube IFrame API (sem chave).
- **Sem violação de DRM**: nenhum stream Netflix/Disney/etc. é reproduzido dentro do app; apenas co-watch com timer + chat.
- **Chamadas**: mesh WebRTC via STUN público já configurado; sem TURN (grupos privados em mesma rede podem falhar — trato só se ocorrer).

---

### Verificação por fase

- Build limpo (`tsgo`/vite).
- Playwright headless: fluxo crítico de cada fase (enviar áudio, criar enquete, iniciar chamada em grupo, criar sala YouTube e sincronizar seek entre 2 abas).
- Screenshots das telas novas.

---

**Confirmando: começo pela Fase 1 (chat + UI) assim que você aprovar este plano. Ao final dela peço aprovação para seguir para a Fase 2.**