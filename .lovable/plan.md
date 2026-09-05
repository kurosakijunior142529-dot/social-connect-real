# Vibely AI: mascote, interface e respostas melhores

## 1. Mascote Vibely no lugar da estrelinha

Criar um mascote próprio do Vibely (personagem redondo em verde neon, com onda sonora no corpo, olhos simpáticos), gerado como imagem com fundo transparente.

Onde ele passa a aparecer:
- Botão flutuante na aba de Conversas (hoje é uma estrelinha genérica).
- Avatar das respostas da IA dentro do chat.
- Tela inicial do chat quando não há mensagens.
- Cabeçalho do chat da IA.

O mascote ganha um leve brilho e uma animação sutil de "respiração" quando a IA está pensando.

## 2. Interface do chat mais bonita e agradável

- Bolhas de conversa refinadas: suas mensagens em verde com bom contraste, as respostas da IA sem caixa colorida, texto mais legível e espaçamento maior.
- Estado "pensando" com o mascote animado e texto em brilho pulsante, em vez do círculo de carregamento.
- Tela inicial mais acolhedora: saudação com o nome do usuário, mascote grande e cartões de sugestão com ícones.
- Campo de escrita mais alto e confortável, botão de enviar redondo bem alinhado, atalhos rápidos em rolagem horizontal com visual mais leve.
- Cada resposta ganha ações discretas: copiar, refazer e (na última) continuar.
- Lista lateral de conversas com data agrupada e melhor destaque da conversa atual.

Cores, fontes e identidade atuais do app são mantidas.

## 3. IA mais inteligente e mais rápida

- Resposta em streaming: o texto aparece palavra por palavra assim que a IA começa a responder, em vez de esperar tudo pronto — é a maior diferença percebida em velocidade.
- Menos espera: envio da mensagem e criação da resposta em uma única chamada, sem recarregar a lista inteira a cada passo.
- Memória melhor: resumo do início da conversa quando ela fica longa, para a IA não "esquecer" o começo nem ficar lenta.
- Instruções reforçadas: respostas mais diretas e organizadas em português, com uso melhor das ações que ela já sabe fazer (ver publicações do momento, publicar texto, criar enquete, gerar imagem).
- Sugestões de continuação após cada resposta, com um toque para enviar.

## Detalhes técnicos

- Imagem do mascote gerada em `src/assets/vibely-mascot.png`, usada em `app-shell.tsx` e `ai.$threadId.tsx`.
- `src/lib/ai-chat.functions.ts`: manter `google/gemini-3.7-flash` com `service_tier: priority`; adicionar streaming via rota de servidor `src/routes/api/ai-stream.ts` (autenticada) que repassa SSE do gateway, gravando a mensagem final no banco ao terminar. O caminho atual com ferramentas continua como fallback quando a IA decide chamar uma ferramenta.
- Histórico: manter últimas 16 mensagens completas + resumo curto das anteriores.
- Frontend consome o stream e faz append incremental, mantendo o realtime existente apenas para reconciliação.
- Sem mudanças de schema; RLS e middleware de autenticação atuais preservados.
