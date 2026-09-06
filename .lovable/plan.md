# Fotos sem corte no feed + vídeo abre em tela cheia

## O que está acontecendo

- **Fotos cortadas:** as imagens do feed estão presas em um quadrado (`aspect-square` com `object-cover` em `post-card.tsx`), então qualquer foto que não seja quadrada tem as bordas cortadas — mesmo postada no tamanho original.
- **Vídeos:** ficam em 4:5 no feed e não abrem em tela cheia.

## Mudanças

### 1. Imagens no tamanho original (sem corte)
- Em `post-card.tsx`, a foto deixa de ser quadrada fixa:
  - `object-cover` vira `object-contain`, com altura mínima/máxima para não quebrar o layout (ex.: altura máxima ~4:5 do Instagram para fotos muito altas, e fundo neutro nas sobras).
  - A moldura arredondada e o restante do cartão não mudam.
- Vale para feed, e o mesmo tratamento em qualquer outro lugar que use o mesmo cartão.

### 2. Toque no vídeo → abre em tela cheia no Reels
- Clicar no vídeo do feed navega para `/reels?post=<id do post>`.
- Em `reels.tsx`:
  - Novo parâmetro de busca `post` validado na rota.
  - Se o vídeo já for um reel, a lista abre direto nele.
  - Se for um vídeo comum do feed, ele entra como **primeiro item** da fila do Reels (a query passa a incluir esse post específico mesmo sem ser `post_kind = reel`), e o resto do Reels carrega normal depois.
  - Rolagem automática até o item inicial ao abrir.
- Imagens **não** ganham esse comportamento — tocar numa foto continua abrindo a página do post (`/p/<id>`), como hoje.

### O que não muda
- Layout do feed, cartões, ações (curtir, comentar, salvar, compartilhar), Reels em si, player, legendas e todas as funções atuais.

## Verificação
- Typecheck + build.
- Preview mobile: postar/ver foto vertical e horizontal sem corte; tocar num vídeo do feed e confirmar que abre em tela cheia já naquele vídeo; tocar numa foto e confirmar que abre a página do post.
