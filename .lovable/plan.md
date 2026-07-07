## Diagnóstico

O app já tem: auth, feed, posts, curtidas, comentários, seguir, DMs, chamadas 1-a-1, stories, grupos/canais, perfis estendidos, PWA. Faltam camadas de **retenção** (notificações, busca, descoberta) e **polish visual**.

## O que falta pra ficar "completo"

### A. Núcleo social (alta prioridade)
1. **Notificações in-app + realtime** — tabela `notifications`, triggers pra curtida/comentário/seguidor/menção/mensagem/story visto, página `/notifications`, badge no bottom-nav, toast em tempo real.
2. **Busca global** (`/search`) — usuários, posts (legenda), canais/grupos públicos, hashtags.
3. **Reações em stories** — 6 emojis rápidos + resposta como DM; dono vê lista.
4. **Convites para grupos** — em vez de add direto: tabela `chat_invites` + aceitar/recusar via notificação.
5. **Menções `@user`** em posts, comentários e mensagens → viram link e geram notificação.
6. **Salvar posts** (bookmarks) — aba no perfil.
7. **Editar/apagar** — mensagens de DM (grupos já têm), posts e comentários próprios.

### B. Presença e engajamento
8. **Status online / última vez visto** (Realtime presence + `last_seen_at`).
9. **Indicador "digitando…"** em DM e chats.
10. **Silenciar** conversa e stories de um usuário (mute sem bloquear).
11. **Hashtags** clicáveis com página `/tag/$tag`.
12. **Compartilhar post** (link + copiar + repostar).

### C. Stories & mídia
13. **Stories em destaque** (highlights permanentes no perfil).
14. **Múltiplas mídias por post** (carrossel).
15. **Filtros/crop básicos** ao publicar foto.
16. **Reels curtos** (feed vertical de vídeos) — opcional, mais pesado.

### D. Descoberta e moderação
17. **Canais/grupos públicos** com página de descoberta.
18. **Sugestões de quem seguir** no feed e no explore.
19. **Denúncia** de story, mensagem e chat (hoje só user/post).
20. **Verificação/badges** — flag `verified` em profiles.

### E. Chamadas
21. **Chamadas em grupo** (WebRTC mesh até 4 participantes).
22. **Histórico de chamadas** com duração e status (perdida/atendida).

### F. Interface (redesign focado)
23. **Refino do Midnight Indigo** — mais respiro, hierarquia tipográfica com Syne, glow mais contido, cards com bordas mais sutis, transições com framer-motion.
24. **Feed redesenhado** — header sticky com blur, ações do post reposicionadas, densidade ajustada.
25. **Perfil premium** — hero com capa + parallax leve, stats maiores, tabs animadas.
26. **Bottom-nav flutuante refinada** — indicador ativo com spring animation, botão central de criar destacado.
27. **Skeleton loaders** consistentes em todas as listas.
28. **Empty states ilustrados** (feed vazio, sem mensagens, sem notificações).
29. **Dark/light toggle** (hoje só dark).

## Proposta de execução

Como "tudo agora" fica enorme e arriscado, sugiro **3 ondas**:

- **Onda 1 (essencial):** 1, 2, 3, 4, 5, 6, 7 + refino visual 23, 24, 25, 26, 27, 28
- **Onda 2 (engajamento):** 8, 9, 10, 11, 12, 13, 18, 19, 22
- **Onda 3 (avançado):** 14, 15, 16, 17, 20, 21, 29

## Preciso confirmar antes de partir

1. **Escopo:** faço só a Onda 1 agora, ou você quer combinar 1+2, ou tudo?
2. **Notificações push nativas** (fora do app, via Web Push/VAPID) entram já ou depois? Se depois, esta rodada é só in-app + realtime.
3. **Reels** entram no roadmap ou você prefere manter foco em fotos + stories?
4. **Sobre o visual:** manter Midnight Indigo e apenas refinar, ou quer rodar o processo de escolher nova paleta/tipografia/layout?
