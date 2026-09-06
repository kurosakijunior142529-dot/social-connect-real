# Chamadas com cara de premium + 5 ganchos que viciam

Duas frentes: primeiro consertar e redesenhar a tela de chamada (hoje ela tem verde demais, três brilhos girando ao fundo, avatar com anel piscando e um painel de tradução colado embaixo). Depois, cinco recursos de hábito que aparecem só na hora certa, sem poluir a tela.

## Parte 1 — Nova tela de chamada

Objetivo: silenciosa, escura, elegante. Nada pisca sem motivo.

- Fundo: preto profundo com um único halo suave atrás da pessoa, que respira de leve conforme a voz. Saem os três borrões coloridos e o gradiente pesado.
- Centro: foto grande e limpa, sem anel cônico girando. Um aro fino que só acende quando a pessoa está falando.
- Nome grande, @usuário discreto, e um único chip com o tempo da chamada. O status ("chamando", "conectando") vira texto simples abaixo do nome, não outro chip.
- Topo: minimizar de um lado, qualidade da conexão do outro, ambos em cinza — verde só quando a conexão cai.
- Controles: uma barra flutuante única em vidro escuro, botões circulares iguais, encerrar em vermelho, ativos em verde. Nada de ícones verdes por padrão.
- Vídeo: sua janelinha com cantos suaves, arrastável para qualquer canto, e toque duplo troca a câmera.
- Legendas/tradução: deixam de ser um painel fixo colado embaixo e passam a flutuar sobre o vídeo como legendas de cinema (2 linhas), com um toque para abrir o histórico completo. Todas as funções atuais ficam: ligar/desligar tradução, escolher idioma, tentar de novo quando falhar, ver o original.
- Chamada recebida: mesma linguagem visual da tela de chamada (hoje é um cartão diferente), com atender/recusar grandes e deslizáveis.
- Barra da chamada minimizada acompanha o novo estilo.

Nada de função removida: mudo, câmera, viva-voz, trocar câmera, minimizar, tradução, legendas, encerrar.

## Parte 2 — Cinco ganchos que prendem (sem poluir)

1. **Retomar de onde parou**: ao abrir o app, se você saiu no meio de um Reel, uma conversa ou uma sala, aparece uma única faixa fina no topo: "Continuar". Some sozinha depois de usada.
2. **Vibe Check noturno**: uma vez por dia, no fim da tarde, chega um convite rápido de 1 toque ("como foi seu dia?" com 5 opções). Quem responde vê o que os amigos responderam — só quem responde vê. Cria retorno diário sem feed novo.
3. **Momento em dupla**: quando você e um amigo estão online ao mesmo tempo, aparece um botão discreto na conversa: "assistir um Reel juntos agora". Abre uma sala instantânea de 2 pessoas com reações ao vivo, sem configuração.
4. **Recados que somem**: mensagem de voz ou foto que se apaga depois de ouvida/vista, com aviso se a pessoa printar. É o gancho de retorno mais forte do Snapchat, aplicado ao chat que já existe.
5. **Placar da semana entre amigos**: um cartão só na aba Conversas mostrando quem manteve sequências, quem mais reagiu e quem apareceu em mais salas. Zera toda segunda. Sem números espalhados pelo app.

Regra de ouro: cada gancho vive em um só lugar, sempre dispensável, sempre em cinza a não ser que exija ação.

## Ordem de entrega

1. Nova tela de chamada + chamada recebida + barra minimizada.
2. Retomar de onde parou e Vibe Check noturno.
3. Recados que somem.
4. Momento em dupla e placar semanal.

## Detalhes técnicos

- `call-screen.tsx`, `incoming-call-dialog.tsx` e `call-mini-bar.tsx` mudam só na camada visual; `call-provider.tsx`, WebRTC/LiveKit, `call-transcribe.functions.ts` e o fallback de STT ficam intactos. Legendas passam a overlay com o mesmo estado `captions` já existente.
- Retomar: estado local (última rota/mídia) em `localStorage`, faixa renderizada no topo do feed.
- Vibe Check: tabela `daily_checkins` (RLS + grants) reaproveitando o padrão de `daily_prompts`; leitura restrita a quem já respondeu no dia.
- Recados efêmeros: coluna `expires_at`/`viewed_at` em mensagens + política de leitura; mídia já usa bucket privado com URL assinada.
- Momento em dupla: reaproveita `watch_rooms` + presença global `vibely-online`.
- Placar: RPC de agregação semanal sobre `chat_streaks`, reações e presença em salas.

## Fora de escopo

Feed, perfil, Studio, login e Streaming Amigo continuam como estão.
