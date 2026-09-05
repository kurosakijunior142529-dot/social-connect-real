# Novo visual "Neon Lime" para o chat privado

Aplicar a direção escolhida (Neon Lime) nas duas telas de conversas: a lista (`/messages`) e dentro da conversa (`/messages/:id`). Todas as funções continuam iguais: mensagens de texto, voz, figurinhas, GIFs, mídia, chamadas, tradução, reações, respostas, fixados, IA e sugestões.

## Como vai ficar

**Dentro da conversa:**
- Cabeçalho em vidro fosco (blur) sobre o conteúdo, avatar com anel em gradiente verde-lima e bolinha verde pulsante de "online"
- Minhas mensagens: bolha verde-lima com texto escuro e brilho neon suave; mensagens do outro: bolha escura translúcida com borda sutil
- Mensagem de voz dentro da bolha com ondas sonoras e botão de play
- Data ("Hoje") em pílula flutuante com blur
- Sugestões de resposta: bloco com filete verde à esquerda + chips escuros arredondados
- Compositor: campo de texto em pílula escura com ícones de emoji/anexo dentro, botão de microfone/envio verde-lima com brilho
- Botão do mascote de IA flutuante com gradiente verde e sombra neon

**Lista de conversas (por fora):**
- Mesma identidade: cartões escuros com borda, avatar com anel gradiente, não-lidas com pílula verde-lima brilhante, abas Diretas/Grupos/Canais com destaque verde-lima

## O que NÃO muda
- Nenhuma função: envio, edição, exclusão, reações, chamadas, anexos, tradução, busca, fixar, silenciar, bloquear
- Nenhuma consulta ao banco ou lógica de dados — apenas aparência (classes/estilos)
- Resto do app (feed, Reels, perfil etc.) intocado

## Detalhes técnicos
- Editar `src/routes/_authenticated/messages.$conversationId.tsx` (bolhas, cabeçalho, compositor, sugestões, separadores) e `src/routes/_authenticated/messages.index.tsx` (lista, abas, cabeçalho)
- Cores lima definidas como tokens em `src/styles.css` (ex.: `--chat-mine`) em vez de valores soltos, mantendo compatibilidade com modo claro/escuro
- Respeitar `prefers-reduced-motion` nas animações de pulso
- Verificar typecheck/build e testar as duas telas no preview ao final
