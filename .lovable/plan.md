Escopo enxuto e ordenado por impacto. Não vou empilhar 10 features novas — vou destravar o que está quebrado e refinar a UI que você reclamou.

## Fase A — Destravar (nesta rodada)

**1. Editor de vídeo `/create/video` — câmera não abre**
- Causa provável: no preview do Lovable o app roda dentro de um `<iframe>` sem `allow="camera; microphone; display-capture"`, então `getUserMedia` é bloqueado antes de pedir permissão. Também não há mensagem de erro clara pro usuário.
- Ações:
  - Antes de chamar `getUserMedia`, checar `navigator.permissions.query({name:'camera'})` e mostrar tela explicando o motivo (`NotAllowedError`, `NotFoundError`, iframe sem permission-policy, contexto não-HTTPS).
  - Botão explícito "Ativar câmera" (gesto do usuário) em vez de auto-start no mount — evita o silêncio quando o browser bloqueia por falta de gesto.
  - Fallback: se câmera falhar, botão "Enviar do dispositivo" já em destaque.
  - Testar no app publicado (fora do iframe do preview) — é lá que a câmera realmente funciona. Deixar aviso na UI quando detectar `window.self !== window.top`.

**2. Aba Jogos não aparece no mobile**
- Hoje `/games` só existe no sidebar desktop. Bottom nav mobile tem 7 itens e não cabe mais um.
- Ação: mover **Explorar** e **Alertas** para dentro do header do Feed (ícones), e liberar 2 slots no bottom nav → **Feed · Reels · Criar · Jogos · Perfil**. Notificação vira sino no header com badge (já existe hook).

**3. GIFs com erro**
- Investigar `src/lib/gifs.functions.ts` (68 linhas) — verificar chave Tenor/Giphy, tratar 401/429 e mostrar estado de erro no `GifPicker` em vez de ficar em branco.

**4. Streaming Amigo**
- Reproduzir o fluxo criar sala → copiar link → abrir em aba anônima. Corrigir o que quebrar (provável: `code` não sendo carregado quando entra por deep link já autenticado, ou realtime channel).

**5. Áudio das chamadas**
- Já apliquei TURN + MediaStream persistente antes. Se ainda mudo, o próximo passo é logar `iceConnectionState` e `getStats()` no `call-provider`, e forçar `RTCRtpTransceiver` com `direction: 'sendrecv'` explícito nos dois lados. Precisa de log real de uma tentativa entre 2 usuários — vou instrumentar e você me manda o console.

## Fase B — Redesign (próxima rodada, dedicada)

Não misturo com Fase A pra não quebrar nada de novo. Só faço depois que A estiver validado por você.

**Player de vídeo (feed + reels)**
- Controles minimalistas estilo TikTok/Instagram: barra de progresso fina no rodapé, tap = pause com ícone play grande, double-tap = curtir com heart animation, hold = 2x speed.
- Coluna de ações à direita com avatares empilhados de quem curtiu.
- Legenda com "…mais" expansível e hashtags/menções clicáveis.
- Loop suave sem flash preto (preload="auto" + segundo `<video>` invisível pra buffer).

**Feed**
- Header com logo + sino (notificações) + busca (Explorar).
- Cards sem borda, media edge-to-edge, ações em linha só com ícones.
- Skeletons com shimmer.

## Fora do escopo agora (peça em rodada dedicada)
- Editor com músicas/Spotify, filtros AR faciais, exportação com ffmpeg.wasm — cada um é 1 rodada inteira sozinho.

## Como valido antes de fechar
- Editor: rodar Playwright no preview publicado, tirar screenshot da tela de erro amigável e do botão "Ativar câmera".
- Bottom nav: screenshot mobile 384px mostrando Jogos acessível.
- GIFs: abrir picker, buscar "cat", ver resultado ou mensagem de erro.
- Streaming: criar sala, entrar pelo link, ver player YouTube carregando.
- Chamadas: adicionar logs de `iceConnectionState` — te peço 1 teste real depois.

Confirma que ataco Fase A agora nessa ordem?
