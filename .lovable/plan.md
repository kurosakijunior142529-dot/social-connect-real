# Vibes só no feed, destaques animados e corte manual de foto

## 1. Tirar as Vibes do perfil
- Remover do perfil a seção "Vibes" (a fileira de bolhas com as Vibes ativas recentes, o título, o botão "+" e o visualizador que ela abre).
- As Vibes continuam normalmente no feed (fileira do topo) e na criação em /stories/new — nada muda lá.
- Manter no perfil: o contador de Vibes nas estatísticas e os Destaques (coleções permanentes), que ficam sendo a única área de Vibes do perfil.

## 2. Destaques permanentes com animação leve
- Manter os Destaques (coleções de Vibes) exatamente onde estão, com criar, editar, fixar e excluir intactos.
- Adicionar uma animação sutil: entrada em cascata (cada capa surge em sequência com fade + leve subida) e um brilho/escala suave ao tocar ou passar o dedo/mouse sobre uma capa.

## 3. Corte manual no editor de fotos
- Hoje o corte funciona escolhendo proporção (1:1, 4:5, 9:16...) e arrastando a foto.
- Adicionar a opção "Livre": aparece uma moldura de corte sobre a foto com alças nos cantos e nas bordas para redimensionar e mover — o corte fica exatamente onde a pessoa posicionar a moldura, sem precisar arrastar a foto.
- As proporções prontas continuam existindo; ao escolher uma, a moldura trava naquela proporção, mas ainda pode ser movida e redimensionada pelas alças.
- A exportação (JPEG) passa a recortar exatamente a área da moldura, mantendo filtros e ajustes.

## O que não muda
Feed, chat, perfil (demais seções), criação de Vibes, Studio e demais funções.

## Detalhes técnicos
- `src/routes/_authenticated/u.$username.tsx`: remover a `<section>` de Vibes, o estado `vibeViewerOpen` e o `StoryViewer` do perfil; manter `VibeCollections` e o contador.
- `src/components/profile/vibe-collections.tsx`: animação de entrada escalonada (CSS keyframes fade/slide com delay por índice) e hover/active com escala suave.
- `src/components/media/image-editor.tsx`: novo modo de moldura de corte (estado `cropRect` em coordenadas relativas, ponteiros touch/mouse nas alças), integrado ao canvas de exportação; aba Cortar ganha o botão "Livre".
