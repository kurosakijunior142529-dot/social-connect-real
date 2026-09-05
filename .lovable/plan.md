# Chat "Minimalista Moderno" + bolha exclusiva da IA

Aplicar a direção escolhida (Minimalista moderno) nas telas de conversas: lista (`/messages`) e dentro da conversa (`/messages/:id`). Nenhuma função muda — apenas aparência.

## Como vai ficar

**Dentro da conversa:**
- Cabeçalho limpo: fundo preto com blur, linha divisória sutil, avatar redondo com bolinha verde de "online", nome em destaque e status pequeno em cinza
- Minhas mensagens: bolha branca com texto preto, canto inferior direito reto (estilo iMessage); hora embaixo da bolha, fora dela
- Mensagens do outro: bolha verde-lima com texto preto, canto inferior esquerdo reto; hora embaixo
- **Bolha da IA (#vibely) totalmente diferente:** fundo cinza-escuro, filete verde-lima na lateral esquerda, cantos retos à esquerda, selo pequeno "Vibely AI" em verde com ícone do mascote acima da bolha — impossível confundir com mensagem de pessoa
- Data ("Hoje") centralizada em texto pequeno maiúsculo cinza
- Sugestões da IA: mesma linguagem (filete verde + chips escuros)
- Compositor: barra arredondada cinza-escura com campo de texto, ícones de anexo/emoji dentro e botão de envio/microfone verde-lima quadrado-arredondado

**Lista de conversas (por fora):**
- Mesma identidade minimalista: fundo preto, linhas finas separando conversas, avatar redondo, não-lidas com pílula verde-lima, abas com destaque verde

## O que NÃO muda
- Nenhuma função: envio, edição, exclusão, reações, chamadas, anexos, figurinhas, GIFs, voz, tradução, busca, fixar, silenciar, bloquear, #vibely
- Nenhuma consulta ao banco — apenas classes/estilos
- Resto do app intocado

## Detalhes técnicos
- Editar `src/routes/_authenticated/messages.$conversationId.tsx` (bolhas, cabeçalho, compositor, separadores, hora fora da bolha) e `messages.index.tsx` (lista e abas)
- Detectar mensagens da IA (remetente IA / prefixo "🤖 Vibely AI") e renderizar o layout exclusivo com selo + filete lateral
- Tokens de cor em `src/styles.css` em vez de valores soltos; modo claro/escuro compatível
- Verificar typecheck/build e testar as duas telas no preview
