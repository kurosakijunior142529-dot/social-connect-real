# Próxima leva: o que faz baixar e não parar de usar

Objetivo: hábito diário + efeito de rede (amigos puxando amigos) + identidade única. Nada do que existe é removido; cada item se encaixa nas telas atuais.

## Frente 1 — Streaks e ritual diário (o motor do Snapchat)

- Sequência (streak) de conversa: chama entre amigos que trocam mensagem todo dia, com contador e alerta antes de "esfriar".
- Vibe diária: um prompt por dia ("mostra seu almoço", "som que você tá ouvindo") — quem posta entra numa faixa especial no topo do feed.
- Recompensa de presença: XP e conquistas por dias seguidos usando o app (usa o sistema de conquistas já existente).

## Frente 2 — Mapa de amigos e presença real (ninguém grande faz bem)

- "Quem tá por perto": mapa opcional (ativado pelo usuário) mostrando amigos próximos e lives/salas abertas perto de você.
- Status ao vivo: bolhas de amigos online no topo das conversas, com um toque para chamar para sala, call ou jogo.

## Frente 3 — Vibely em todo lugar (distribuição)

- Compartilhamento que viraliza: todo post/reel compartilhado fora do app abre numa página pública bonita com preview e botão "Abrir no Vibely" — cada compartilhamento vira propaganda.
- Deep links de convite: link de perfil e de sala que já cai dentro do app (ou na página de download com contexto).

## Frente 4 — Duelo de criadores (aquisição barata)

- Batalhas de lives 1x1 com placar de presentes ao vivo (a audiência decide o vencedor) — formato que explode retenção e receita.
- Desafios semanais com hashtag oficial do app e destaque no Explorar.

## Ordem de entrega

1. Streaks de conversa + Vibe diária (retorno diário imediato, base já existe).
2. Página pública de compartilhamento + deep links (crescimento).
3. Presença: amigos online + quem tá por perto (opcional).
4. Batalhas de lives + desafios semanais (receita + aquisição).

## Detalhes técnicos

- Streaks: tabela `chat_streaks` com trigger em `messages`/`chat_messages` e RPC de leitura; notificação push reusa o dispatcher existente.
- Vibe diária: tabela `daily_prompts` (1 ativa por dia) + selo no post/Vibe que responde o prompt.
- Compartilhamento público: rota pública SSR `/p/$id` já existe; ganha OG tags completas e página de "abrir no app".
- Batalhas: campos em `lives` (opponent_live_id, score) reaproveitando `send_live_gift`; placar via Realtime.

## Fora de escopo

Algoritmo de recomendação do feed e mudanças visuais amplas — ficam para um ciclo futuro.
