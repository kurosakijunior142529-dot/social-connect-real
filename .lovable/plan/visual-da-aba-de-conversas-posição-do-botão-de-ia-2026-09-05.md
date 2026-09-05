# Visual da aba de conversas + posição do botão de IA

## Objetivo

Reprojetar a tela "Conversas" (`/messages`) seguindo a direção escolhida "Cartão com borda verde", mantendo todas as funções atuais (abas Diretas/Grupos/Canais, menu +, navegação para conversas e grupos). E corrigir o botão flutuante de IA para aparecer apenas na lista de conversas, nunca dentro de uma conversa aberta.

## Mudanças visuais na lista de conversas (src/routes/_authenticated/messages.index.tsx)

- **Cabeçalho**: título "Conversas" maior e mais encorpado; botão "+" passa a ser um círculo de vidro com borda neon sutil (em vez de preenchimento sólido), com o mesmo menu (Novo grupo, Novo canal, Sala de assistir).
- **Abas**: controle segmentado em pílula sobre fundo escuro; aba ativa com preenchimento verde neon e texto escuro + brilho suave; inativas em tom esmaecido.
- **Linhas de conversa (Diretas, Grupos e Canais)**:
  - Conversa mais recente/ativa vira um **cartão**: fundo elevado, cantos bem arredondados, **borda esquerda verde de 4px**, sombra suave e efeito de "afundar" ao tocar.
  - Demais conversas ficam em linhas limpas que acendem ao passar o dedo/mouse.
  - Avatar com **anel de presença**: ponto verde com brilho quando a pessoa está online (usa `show_online`/dados existentes, sem novas consultas pesadas), cinza quando ausente.
  - Selo de verificado continua ao lado do nome; horário da última mensagem em destaque verde na conversa ativa, discreto nas demais.
  - Conteúdo, consultas, bloqueios (`useBlocks`) e navegação permanecem idênticos — apenas apresentação.
- **Skeleton e estados vazios**: ajustados para o novo visual de cartões.

## Correção do botão de IA (src/components/app-shell.tsx)

- Alterar a condição de exibição de `pathname === "/messages" || pathname.startsWith("/messages/")` para apenas `pathname === "/messages"`, para o botão aparecer somente na lista de conversas.

## Validação

- Build sem erros e captura de tela da aba de conversas confirmando o novo visual e a ausência do botão de IA dentro de uma conversa.
