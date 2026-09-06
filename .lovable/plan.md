# Verificação e polish dos quatro diferenciais

O plano dos quatro diferenciais (tradução global, IA em tudo, monetização justa e Streaming Amigo central) já foi aprovado e a maior parte está implementada. Esta fase final verifica que tudo funciona e faz os últimos ajustes.

## O que já está pronto

- **Tradução global**: cache de tradução no banco, auto-tradução nas conversas, tradução sob demanda em posts, seleção de idioma nas configurações, `suggestCaptions` no criador de posts e no Studio.
- **Monetização justa**: botão "Apoiar" no perfil com checkout Stripe, selo "Apoiador" visível publicamente, assinatura de criador.
- **Streaming Amigo central**: salas públicas agendadas, convite pelo chat, faixa de salas no feed, RPC corrigida.
- **IA em tudo**: roteiro por 3 palavras no Studio, chat de IA com ferramentas, respostas/sugestões controláveis.

## O que falta verificar e polir

1. Rodar typecheck e build para confirmar que não há erros após as últimas edições (selo em `u.$username.tsx`, faixa de salas em `index.tsx`).
2. Verificar visualmente o perfil `mljunior061` no preview para confirmar que o selo "Apoiador" aparece corretamente ao lado do nome.
3. Verificar que a faixa de salas públicas aparece no feed sem erros.
4. Confirmar que a conversa com auto-tradução funciona sem travar.
5. Corrigir qualquer erro encontrado nos passos acima.

## Fora de escopo

Feed, chat (estrutura), perfil (estrutura), Streaming Amigo (funcionamento), login e sistema de usuários permanecem intocados além dos ajustes já feitos.
