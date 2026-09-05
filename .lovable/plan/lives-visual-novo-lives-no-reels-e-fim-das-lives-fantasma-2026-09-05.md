# Lives: visual novo, lives no Reels e fim das lives "fantasma"

## 1. Nova aparência da aba de Lives

Reformular `src/routes/_authenticated/lives.index.tsx` mantendo a paleta neon atual:

- Topo com destaque: a live mais assistida no momento vira um card grande (16:9) com capa, badge "AO VIVO" pulsante, contador de espectadores, nome e avatar do criador e botão "Assistir agora".
- Faixa de categorias em pílulas roláveis (Todas, Jogos, Música, Conversa, Esportes, etc.) derivadas das categorias reais das lives ativas, combinando com a busca já existente.
- Grade de lives com cartões mais ricos: capa com gradiente, anel neon no avatar do criador, selo verificado, tempo no ar ("há 12 min"), tags e contagem de espectadores animada.
- Seção "Replays" (lives passadas) em carrossel horizontal compacto, separada visualmente das lives ativas.
- Estados vazios e de carregamento redesenhados no mesmo estilo; nada de mudanças em consultas de dados além das necessárias.

## 2. Lives dentro do Reels (estilo TikTok)

Em `src/routes/_authenticated/reels.tsx`:

- O cabeçalho passa a ter duas abas: **Para você** e **Ao vivo**, com sublinhado deslizante, no mesmo lugar do rótulo atual.
- A aba "Ao vivo" só aparece quando houver pelo menos uma transmissão ativa; com zero lives, o Reels continua idêntico ao de hoje.
- "Ao vivo" mostra as transmissões em tela cheia com rolagem vertical por encaixe (mesmo gesto dos vídeos), cada uma com capa, título, criador, espectadores e botão "Entrar na live" que abre `/live/$id`.
- Um selo "N ao vivo" com ponto pulsante na aba, atualizado a cada 15 segundos.

## 3. Lives passadas que continuam aparecendo como ativas

Causa: quando o transmissor fecha o app ou perde conexão, ninguém chama `endLive`, então a linha fica com `status = "live"` para sempre.

Correções:

- **Batimento (heartbeat):** enquanto transmitindo, a tela da live atualiza um carimbo de tempo a cada 30s.
- **Encerramento automático:** listagens passam a ignorar lives sem batimento há mais de 3 minutos, e uma função no banco marca essas como encerradas.
- **Encerrar ao sair:** o host encerra a live ao fechar/abandonar a página (`pagehide`), além do botão existente.
- **Ao abrir uma live morta:** se o quarto de transmissão não existe mais, a tela mostra "Esta live já terminou" em vez de ficar carregando.

## Detalhes técnicos

- Migração: adicionar `last_heartbeat_at timestamptz` em `public.lives` (default `now()`), índice parcial por `status`, e função `end_stale_lives()` SECURITY DEFINER (`search_path = public`) que marca `status='ended'`/`ended_at=now()` para lives com `status='live'` e `last_heartbeat_at < now() - interval '3 minutes'`. GRANT EXECUTE apenas para `authenticated`/`service_role`.
- `src/lib/lives.functions.ts`: nova server fn `heartbeatLive` (host apenas, atualiza `last_heartbeat_at`); `listLives` — ou as queries do cliente — chamam `end_stale_lives()` antes de listar e filtram por `last_heartbeat_at > now() - 3min`.
- `live.$id.tsx`: `setInterval` de 30s chamando `heartbeatLive` quando `isHost && status === 'live'`; `pagehide`/`visibilitychange` dispara `endLive` para o host.
- Reels: nova query `["reels-lives"]` com `refetchInterval: 15000`, estado local `tab: "fyp" | "live"`; a lista de lives usa o mesmo container com `snap-y snap-mandatory`.
- Nenhuma mudança em cores/tokens globais; apenas composição e classes utilitárias já existentes (`glass`, `surface`, `shadow-elegant`).
