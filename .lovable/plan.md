# Vibely acima dos grandes: 4 diferenciais que Instagram e TikTok não têm

Objetivo duplo: atrair usuários novos e fazer quem já usa voltar todo dia — com receita sustentando tudo. Nada do que existe é removido; cada frente se encaixa nas telas atuais.

## Frente 1 — Tradução global (nenhum grande tem nativo)

- Mensagens de texto traduzidas automaticamente: cada pessoa lê no próprio idioma, com selo discreto "Traduzido" e opção de ver o original. Preferência por usuário (ativar/desativar e idioma).
- Legendas traduzidas nos vídeos do feed/Reels: botão "Traduzir legenda" em qualquer post.
- Chamadas: a tradução ao vivo já existente continua igual; só unifica a preferência de idioma entre chamada, chat e feed.
- Perfil ganha "Idioma principal", usado em tudo.

## Frente 2 — IA em tudo (coautora, não tela separada)

- Legenda automática com IA no criador de post (3 sugestões a partir da mídia), com um toque para usar.
- "Roteiro de vídeo": usuário dá 3 palavras, a IA sugere estrutura de cenas que abre pronta no Studio.
- Resposta sugerida em DM com o tom da conversa (respeita a preferência existente de ativar/desativar IA no chat).
- Resumo de conversa longa sob demanda.
- Tudo pelo gateway de IA já configurado, sem chave exposta, com erro claro quando o serviço estiver indisponível.

## Frente 3 — Monetização justa (argumento de migração)

- Painel "Ganhos" no perfil: presentes recebidos, assinantes, quanto entra por mês, tudo transparente — coisa que TikTok esconde.
- Assinatura de criador: fã assina um criador por valor mensal, criador define benefícios (Vibes exclusivas, selo no chat, prioridade em comentários).
- Selo de "Apoiador" no perfil de quem assina criadores.
- Pagamentos pela infraestrutura Stripe já existente no app; taxa do Vibely visível e menor que a concorrência.
- Presentes nas lives e nos posts ganham destaque no perfil ("Maiores apoiadores").

## Frente 4 — Streaming Amigo como identidade do app

- Card de salas públicas no topo do feed e seção "Salas ao vivo agora" na aba Salas.
- Eventos agendados: criador marca "Sessão sábado 20h", seguidores recebem notificação push (usa o sistema de push já existente).
- Salas de criador abertas: qualquer um entra para assistir junto; anfitrião mantém controle total.
- Convite direto por chat com um toque (mensagem de convite que abre a sala).

## Ordem de entrega (cada etapa já sai funcionando)

1. Tradução em mensagens + botão traduzir legenda (impacto imediato, base reaproveitada da tradução de chamadas).
2. Ganhos no perfil + assinatura de criador + selo de apoiador.
3. Salas públicas no feed + eventos agendados com push + convite por chat.
4. IA: legenda automática no criador, roteiro de vídeo para o Studio, respostas e resumos em DM.

## Detalhes técnicos

- Tradução: server functions autenticadas chamando o gateway de IA já configurado; cache de traduções em tabela própria (com RLS) para não pagar duas vezes; preferência de idioma em coluna nova em profiles.
- Monetização: Stripe já integrado (`src/lib/stripe.server.ts`); tabelas novas para assinaturas de criador e ganhos, com RLS e grants; webhooks em `/api/public/payments/` seguindo o padrão existente.
- Salas: reaproveita `watch_rooms` e o RPC de listagem pública já corrigido; campo novo para agendamento (`scheduled_at`) e flag de sala pública de criador; push via dispatcher existente.
- IA: novas ferramentas no loop de function calling já existente; nada de chave no cliente.
- Feed, chat, perfil, Studio, login e sistema de usuários continuam intactos — as frentes se encaixam como seções e botões novos nas telas atuais.

## Fora de escopo

Recomendação do feed (algoritmo), espaços de grupo estilo Discord e mudanças visuais amplas — ficam para um próximo ciclo se você quiser.
