# Ping Pong: reconstrução 3D premium (Three.js) + VS IA + 40 novos poderes

Reconstrução da camada visual e de jogo do Ping Pong para 3D real (WebGL via Three.js), mantendo intactos o multiplayer atual (salas, código tipo `107R3`, sincronização Realtime), os 34 poderes existentes, o HUD de uso/cooldown e o restante do aplicativo.

Como o escopo é enorme, a entrega é dividida em 5 fases. Cada fase é jogável ao final.

## Fase 1 — Motor 3D e arena

- Instalar `three` + `@react-three/fiber` + `@react-three/drei` + `postprocessing`.
- Novo componente `PongScene3D` carregado com `React.lazy` + `<ClientOnly>` (nada de WebGL no SSR), substituindo o `<PongCanvas>` dentro da mesma rota `/games/pong/$room`.
- Arena futurista: mesa com geometria/rede/bordas, arquibancadas, painéis luminosos, telões, hologramas, estruturas de fundo, neblina volumétrica leve.
- Iluminação dinâmica (key/rim/spots emissivos), sombras, materiais PBR, environment map para reflexos.
- Pós-processamento: bloom, tone mapping ACES, vinheta, SSAO e depth of field apenas em qualidade alta.
- A simulação de física atual (autoritativa no anfitrião) permanece intacta: a cena 3D apenas lê o estado do `simRef`.

## Fase 2 — Bola, raquetes, personagens e câmera

- Bola 3D com trail, motion streak, partículas e distorção em alta velocidade; quique/spin refletidos visualmente.
- Raquetes 3D com material próprio e reação de impacto (flash, onda de choque, partículas).
- Personagens 3D estilizados (geometria procedural low-poly com rig simples, sem depender de assets externos pesados): idle, preparação, rebatida, defesa, dano, vitória, derrota, com transições interpoladas.
- Câmera cinematográfica: segue bola/jogadores com amortecimento, zoom em pontos decisivos, shake controlado em impactos, enquadramento especial em habilidades, retorno rápido à visão jogável.
- Fluxo de entrada: arena em idle enquanto espera → detecção do adversário → transição cinematográfica → tela VS → countdown 3/2/1 → partida.

## Fase 3 — 40 poderes novos

- Auditoria dos 34 poderes atuais em `src/lib/pong/config.ts` (lista interna de nome + mecânica) para garantir zero duplicata.
- 40 poderes inéditos com mecânicas próprias, distribuídos por: manipulação de bola avançada, espaço, tempo, arena, movimentação, defesa, contra-ataque, armadilhas, risco/recompensa, precisão/timing, blefe, combos, poderes interrompíveis e counterplay.
- Cada poder é implementado no motor de simulação (efeito real na física/regras), com efeito 3D próprio, som próprio, cooldown e balanceamento.
- Todos os poderes antigos continuam funcionando sem alteração de mecânica.
- Nova tela de seleção estilo jogo: ícone, categoria, raridade, cooldown, dificuldade, preview animado.

## Fase 4 — VS IA

- Modo VS IA usando exatamente o mesmo motor de partida (física, arena, poderes, HUD, câmera, regras); a IA apenas substitui a entrada do adversário remoto.
- Arquitetura modular em `src/lib/pong/ai/`: `BallPrediction`, `MovementController`, `DecisionSystem`, `DefenseSystem`, `AttackSystem`, `PowerManager`, `DifficultyManager`, `PersonalitySystem`.
- 6 dificuldades (Fácil → Lendário) variando reação, precisão, previsão, decisão, posicionamento, taxa de erro, uso de poderes e adaptação — não apenas velocidade.
- 6 personalidades: Agressivo, Defensivo, Estratégico, Rápido, Imprevisível, Mestre.
- Campanha com 6 adversários progressivos (aparência, poder favorito, arena, apresentação) e recompensas de XP.

## Fase 5 — Áudio, HUD, performance e acabamento

- Expansão do áudio procedural existente com identidade sonora por poder e áudio espacial.
- HUD integrado ao mundo do jogo: placar, energia, habilidade, cooldown, combo, velocidade da bola, estados.
- Qualidade gráfica LOW/MEDIUM/HIGH/ULTRA com detecção automática no celular, resolução dinâmica, object pooling, instancing e limpeza de recursos ao sair da rota.
- Controles touch (retrato e paisagem) e teclado/mouse no desktop, sem cobrir a ação.

## Detalhes técnicos

- Rotas e chaves de sala não mudam: `/games/pong`, `/games/pong/$room`, `pong_find_match`, `pong_record_result`, canais Realtime e o hook `usePongMatch` seguem como fonte de verdade do estado.
- A separação atual (simulação a 60Hz em `ref`, React em ~10Hz) é mantida; o loop 3D lê os refs por frame, sem re-render do React.
- Banco: nenhuma mudança obrigatória nas fases 1–3. Fase 4 pode adicionar uma tabela de progresso de campanha, se aprovado.
- Risco principal é peso do bundle; mitigado com carregamento sob demanda apenas na rota da partida.

## Fora de escopo

- Modo claro e o redesenho geral do chat (pedidos anteriores) continuam pendentes e podem ser retomados depois.
