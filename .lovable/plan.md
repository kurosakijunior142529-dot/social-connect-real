# Reels — feed vertical de vídeos (estilo TikTok)

Nova aba `/reels` com feed vertical fullscreen, snap por vídeo, autoplay do vídeo visível, e ações laterais (curtir, comentar, compartilhar, salvar).

## Escopo

- Nova rota `src/routes/_authenticated/reels.tsx` no design "Minimal Escuro Premium".
- Item de posts existente já suporta `media_type = 'video'`; reels reaproveita `posts` filtrando por vídeo (sem nova tabela). Salvar usa `saved_posts`, curtir usa `likes`, comentar usa `comments` (tudo já existe).
- Adicionar item "Reels" na bottom nav do `AppShell` (substitui/entra ao lado de "Explorar").
- Integrar com `SwipeableTabs` já existente (feed ↔ reels ↔ alertas ↔ chats).

## UX

- Fullscreen preto puro, um vídeo por "página", snap vertical (`scroll-snap-type: y mandatory`).
- Autoplay + loop + muted por padrão; tap no vídeo → play/pause; tap no ícone de som → unmute.
- Barra de progresso fina no rodapé do vídeo.
- Overlay:
  - Esquerda inferior: avatar + @username + botão Seguir, legenda truncada (expandir on tap).
  - Direita (coluna vertical de ações): Curtir (coração + contagem), Comentar (abre bottom sheet), Compartilhar (Web Share API + fallback copiar link), Salvar (bookmark), menu "…".
- Swipe vertical entre vídeos (nativo via scroll-snap; sem lib extra).
- Header transparente com "Para você" / "Seguindo" (tabs simples; "Seguindo" filtra por `follows`).

## Comentários

- Bottom sheet (Drawer shadcn já disponível) com lista de comentários do post + composer, reaproveitando o mesmo componente usado no feed. Sem tela nova.

## Dados

- Server fn `listReels` em `src/lib/reels.functions.ts` (publishable client) → `posts` onde `media_type = 'video'`, join com `profiles`, contagens de likes/comments, e flags `liked_by_me` / `saved_by_me` (via `requireSupabaseAuth`).
- Paginação por cursor (created_at desc, limit 10). `useInfiniteQuery` do TanStack Query.
- Mutations reutilizam handlers existentes de like/save/comment do feed.

## Performance

- Só o vídeo visível toca; vizinhos ficam em `preload="metadata"`. IntersectionObserver com threshold 0.7 pausa os demais e dá `.play()` no ativo.
- `playsInline`, `muted` inicial (necessário para autoplay em mobile).

## Arquivos

**Novos**
- `src/routes/_authenticated/reels.tsx` — rota + layout snap.
- `src/components/reels/reel-item.tsx` — vídeo + overlay + ações.
- `src/components/reels/reel-actions.tsx` — coluna de ações à direita.
- `src/components/reels/comments-sheet.tsx` — bottom sheet de comentários.
- `src/lib/reels.functions.ts` — `listReels` server fn.

**Editados**
- `src/components/app-shell.tsx` — adiciona item "Reels" na bottom nav (ícone Play) e no `SwipeableTabs`.
- `src/routeTree.gen.ts` — regenerado automaticamente.

## Fora de escopo

- Upload/gravação de vídeo (usa vídeos já existentes em `posts`).
- Lives, efeitos, música, duetos.
- Migrations/RLS novas — nada muda no backend.

## Validação

- Playwright mobile viewport: abrir `/reels`, confirmar snap vertical, autoplay do primeiro vídeo, tap toggle play/pause, like incrementa, sheet de comentários abre, share dispara.
