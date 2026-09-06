# Corte de foto do feed: padrão Instagram (4:5)

## O que está acontecendo

Ao postar foto no feed, o editor oferece 6 tamanhos de corte (Original, Livre, 1:1, 4:5, 9:16, 16:9). Para o feed isso é confuso e desnecessário — o Instagram usa 4:5 como padrão.

## Mudanças

### 1. Editor com tamanhos por contexto
- O `ImageEditor` (`src/components/media/image-editor.tsx`) ganha uma propriedade para escolher o conjunto de proporções por tela:
  - **Feed (`create.tsx`):** padrão **4:5** (proporção do Instagram), já selecionado ao abrir. Opções disponíveis: **4:5**, **Original** (sem corte, respeita o tamanho da foto) e **Livre** (corte manual com moldura, que você pediu para manter). Somem 1:1, 9:16 e 16:9.
  - **Vibes (`stories.new.tsx`):** continua 9:16 como padrão (formato de tela cheia), com Original e Livre.
- Em `create.tsx`, o aspecto inicial da foto muda de `1:1` para `4:5`.

### 2. Nada mais muda
- Filtros, ajustes, rotação, espelhamento, zoom, moldura livre e exportação continuam iguais.
- O feed já exibe fotos sem cortar (`object-contain`), então a foto 4:5 preenche bem o cartão.
- Stories, perfil, chat e demais telas não são tocados.

## Verificação
- Typecheck + build.
- Preview mobile: abrir "Novo post" com uma foto, confirmar que abre em 4:5 e só há 3 opções de tamanho; publicar e conferir no feed sem corte.
