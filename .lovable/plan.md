# Reels em tela vertical completa

## Objetivo
Corrigir somente o aproveitamento vertical da página de Reels, sem redesenhar, alterar ícones, lógica, feed principal ou outras telas.

## Alterações
- Remover o cálculo que desconta 96 px da altura da lista de Reels e usar `100dvh` no contêiner rolável.
- Fazer cada Reel, inclusive cards de live, ocupar `100dvh` com altura mínima igual à viewport e scroll snap preservado.
- Fazer vídeos e mídias do carrossel preencherem toda a tela com `object-cover`, sem `aspect-ratio`, altura fixa ou `object-contain`.
- Neutralizar apenas na rota `/reels` o espaço inferior do conteúdo geral; a navegação continuará fixa e sobreposta ao vídeo.
- Aplicar safe areas aos controles sobrepostos, sem criar faixas vazias ou reduzir o vídeo.

## Validação
- Testar em larguras móveis e desktop se topo e base chegam aos limites da viewport, sem espaço vazio ou rolagem externa.
- Confirmar scroll snap e swipe vertical, reprodução automática e controles existentes.
- Confirmar que o feed principal e demais páginas não foram alterados.

## Detalhes técnicos
Arquivos previstos: `src/routes/_authenticated/reels.tsx`, `src/components/reels/reel-item.tsx`, `src/components/reels/reel-slide.tsx` e uma condição isolada em `src/components/app-shell.tsx` para retirar o espaço inferior somente em `/reels`. Nenhuma dependência será adicionada.
