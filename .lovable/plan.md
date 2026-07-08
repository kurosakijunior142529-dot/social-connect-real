
# Redesign "Minimal Escuro Premium" + Gestos

Duas frentes em paralelo: (1) reformar o design system e as 4 telas principais num visual escuro premium coeso, (2) adicionar gestos de arrastar em 4 lugares. Sem mexer em regras de negócio, banco ou server functions — só camada visual e de interação.

## 1. Design system (base pra tudo)

Reescrever `src/styles.css` com uma paleta escura premium única:

- Fundo `#0A0A0B` (quase preto puro), superfície `#111113`, superfície elevada `#17171A`, borda hairline `rgba(255,255,255,0.06)`.
- Texto: primário `#F5F5F7`, secundário `#8E8E93`, terciário `#48484A`.
- Acento único e sutil: verde-limão neon `#D7FF3A` só em CTAs, badges de "ao vivo", indicador de aba ativa e curtidas ativas. Sem gradientes coloridos, sem roxo, sem azul saturado.
- Tipografia: **Geist** (display + body) via `<link>` no `__root.tsx`, pesos 400/500/600/700. Tracking apertado (`-0.02em`) nos headings, `-0.01em` no body. Números tabulares em contadores.
- Raio: 12px padrão, 20px em cards de post e sheets, 999px em pílulas.
- Sombras substituídas por bordas hairline + leve inner glow no acento. Nada de sombra colorida difusa.
- Espaçamento generoso: gutters de 16px no mobile, altura de linha 1.5 no body.
- Motion tokens: `--ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1)`, durações 180ms/260ms/420ms.

Tudo via `@theme` no `styles.css` — nenhum componente ganha classe de cor hardcoded.

## 2. Feed principal (home)

- Header sticky ultra-fino (48px), logo wordmark "vibely" à esquerda, ícones de busca / notificações à direita, borda hairline embaixo.
- Barra de stories: avatares 56px com anel `#D7FF3A` só quando tem novo; sem anel colorido pra "já visto".
- Card de post repensado: sem card container visível — só a mídia (raio 20px) + metadados abaixo em texto. Ações (like/coment/salvar/share) numa linha horizontal com ícones outline finos, contadores em número tabular ao lado. Nome do autor em peso 600, handle em terciário.
- Bottom nav flutuante: pílula centralizada com blur `backdrop-blur-xl`, 5 ícones outline, ativo ganha fill + linha `#D7FF3A` de 2px abaixo.

## 3. Chats/DMs

- Lista de conversas: sem divisores, hairline sutil entre linhas, avatar 44px, última mensagem em terciário com truncate, horário no canto direito em terciário, badge de não-lida como ponto sólido `#D7FF3A` de 8px (sem número, hover mostra).
- Tela de mensagem: header com avatar + nome + status ("online" com ponto verde). Balões:
  - Mensagens do outro: sem fundo, texto direto na superfície com padding.
  - Mensagens minhas: bolha `#17171A`, texto `#F5F5F7`, raio 20px com "tail" só no último da sequência.
- Composer: input pill com blur, botão de anexo (+) à esquerda, mic + enviar à direita. Enviar aparece só quando tem texto.
- Timestamps agrupados por dia com chip central minúsculo.

## 4. Stories/Reels viewer

- Fullscreen preto puro, mídia edge-to-edge.
- Barra de progresso segmentada no topo (altura 2px, gap 2px, hairline branco 20% + fill branco).
- Overlay superior: avatar + nome + tempo relativo à esquerda, botão fechar à direita. Overlay inferior transparente com gradiente sutil pra legibilidade.
- Ações à direita (like/coment/share/save) em coluna vertical, ícones outline brancos com contador embaixo em número tabular pequeno.
- Reels: mesmo layout, com waveform mínimo indicando áudio + botão mute canto superior esquerdo.

## 5. Gestos de arrastar (Framer Motion)

Instalar `framer-motion` se ainda não estiver no projeto. Criar 4 primitivas reutilizáveis em `src/components/gestures/`:

### a. `<SwipeableTabs>` — trocar aba (feed ↔ reels ↔ chats)
Wrapper com `motion.div` + `drag="x"` + `dragConstraints`. Threshold de 25% da largura ou velocity > 500 troca de aba. Indicator do bottom nav anima junto via `layoutId`. Rotas envolvidas: home, reels, chats — mesma stack lateral. Sincroniza com o router (navigate on release).

### b. `<SwipeBackRoute>` — voltar tipo iOS
Detecta `pan` iniciado nos primeiros 20px da borda esquerda. Anima a rota atual pra direita com `motion.div`, se ultrapassar 40% da tela ou velocity, chama `router.history.back()`. Aplicado no `_authenticated/route.tsx` como wrapper de `<Outlet />` em telas não-raiz.

### c. `<StoryReelSwiper>` — trocar de story/reel
Swipe vertical em reels (próximo/anterior), horizontal em stories (próximo autor). Já existe `story-viewer.tsx` — trocar tap-only por `drag` com snap. Preload da mídia adjacente.

### d. `<SwipeMessageRow>` — ações em mensagem/conversa
- Lista de conversas: swipe left revela "Silenciar" + "Arquivar" (ainda não temos backend de arquivar; apenas silenciar já existe). Swipe right revela "Marcar lida".
- Bolha de mensagem: swipe right curto (60px) dispara "Responder" (já existe reply, só plugar o gesto). Snap-back com spring.

Todos os gestos respeitam `prefers-reduced-motion` (sem animação, tap-only fallback).

## 6. Arquivos afetados

**Novos:**
- `src/components/gestures/swipeable-tabs.tsx`
- `src/components/gestures/swipe-back.tsx`
- `src/components/gestures/story-reel-swiper.tsx`
- `src/components/gestures/swipe-message-row.tsx`

**Editados:**
- `src/styles.css` — nova paleta, tipografia, tokens
- `src/routes/__root.tsx` — font `<link>`, meta
- `src/components/app-shell.tsx` — bottom nav flutuante + swipe entre tabs
- `src/components/post-card.tsx` — layout sem container
- `src/routes/_authenticated/route.tsx` — swipe-back wrapper
- `src/routes/_authenticated/index.tsx` (feed) — header slim + stories row
- `src/routes/_authenticated/chats.tsx` (lista) — swipe rows
- `src/routes/_authenticated/chats.$id.tsx` — balões novos + swipe reply
- `src/routes/_authenticated/messages.$conversationId.tsx` — idem
- `src/components/story-viewer.tsx` — swipe entre autores/reels

## 7. Fora de escopo (não mexo)

- Server functions, migrations, RLS, IA — tudo intacto.
- Features novas (Reels feed dedicado, Lives, monetização) ficam pra próxima onda.
- Modo claro — vai continuar existindo mas os tokens escuros são o foco desta rodada.

## 8. Validação

Depois de implementar, capturo screenshots com Playwright em mobile viewport (feed, chat aberto, story) pra confirmar que a hierarquia visual e os gestos funcionam.

---

Se aprovar, começo pelo design system + feed (pra você já ver o novo visual), depois chats, depois viewer, e os gestos por último em cima da base pronta.
