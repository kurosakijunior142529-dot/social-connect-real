Com base nas suas respostas, o caminho para o Vibely superar as redes sociais existentes é: primeiro tornar tudo o que já construímos realmente sólido e fluido, depois virar uma plataforma de criadores com monetização clara. Proponho 5 fases executadas nessa ordem.

## Fase 1 — Fundação: tudo deve funcionar perfeitamente
Antes de adicionar qualquer grande feature, eliminar os pontos de frustração que você já mencionou e que aparecem no histórico do app.

- **Chamadas de voz**: garantir áudio bidirecional estável em todos os fluxos (chamada direta, aceite, reconexão, background, voz estilo Discord). Substituição por WebRTC manual já foi tentada várias vezes; manter LiveKit e adicionar fallback de diagnóstico + reconexão automática.
- **Câmera e editor de vídeo**: corrigir permissões, estabilizar getUserMedia, garantir que gravação, filtros e trim funcionem no mobile PWA.
- **Player de vídeo**: finalizar o player imersivo (autoplay, loop, double-tap like, long-press 2×, som, progresso) tanto no Feed quanto nos Reels.
- **Chat**: garantir que "Personalizar conversa" aparece no menu ⋮ de todas as conversas, áudio do chat reproduzível, GIFs funcionando com chave Tenor válida, recibos de leitura e mensagens fixadas.
- **Áudio em background**: PWA keep-alive, foreground service hints e MediaSession para chamadas/voz.

## Fase 2 — Performance e algoritmo de feed
Deixar o app rápido e o feed relevante.

- **Virtualização**: lista virtualizada no Feed e Reels para não renderizar posts fora da tela.
- **Imagens/vídeos otimizados**: lazy loading, placeholders, formatos modernos (WebP/AVIF), pré-carregamento inteligente do próximo vídeo.
- **Skeletons e estados de erro consistentes** em todas as telas.
- **Algoritmo de feed**: além do cronológico, adicionar aba "Para você" com ranking por engajamento, recência, interesses e perfis seguidos.
- **Busca e descoberta**: melhorar Explorar com busca por usuário, hashtag, trends e sugestões personalizadas.

## Fase 3 — Plataforma para criadores e monetização
Transformar o Vibely em lugar onde criadores ganham dinheiro de verdade.

- **Painel do criador**: analytics de views, curtidas, seguidores, ganhos por conteúdo, audiência e horários de pico.
- **Monetização completa**:
  - Assinaturas/Vibely Pro já existem — garantir que benefícios funcionem (selos, destaques, ferramentas exclusivas).
  - Presentes digitais em lives e posts com animações premium e repasse ao criador.
  - Programa de parceria: meta de views/seguidores para liberar monetização.
  - Saques via Pix com validação, antifraude e histórico claro.
- **Lives profissionais**: melhorar estabilidade, layouts variados, moderação de chat ao vivo, destaque de inscritos e presentes.
- **Selos e verificação**: sistema claro de verificação (criador verificado, pioneiro, parceiro) com critérios transparentes.

## Fase 4 — Crescimento e retenção
Mecanismos para trazer e manter usuários.

- **Onboarding de novos usuários**: sugestão de perfis para seguir (Anny, Vibely), tour rápido e feed personalizado desde o primeiro dia.
- **Notificações push**: PWA push para curtidas, comentários, mensagens, lives de criadores seguidos e ganhos.
- **Convites e viralização**: link de convite com recompensa, compartilhamento de posts/reels/lives.
- **Stories**: stories com destaque de 24h, reações e respostas rápidas.
- **Recompensas de engajamento**: moedas por login diário, convite, assistir lives ou interagir.

## Fase 5 — Diferenciais que nenhuma rede tem
Recursos que consolidam a identidade do Vibely.

- **Assistente IA nativa**: Vibely AI já existe — expandir para legendas automáticas em vídeos, tradução em chamadas, moderação de comentários e sugestão de hashtags/caption.
- **Comunidades/Canais**: evoluir os canais de voz para comunidades completas (texto, voz, posts, regras, mods).
- **Jogos e interação**: expandir arcade, torneios, apostas amigáveis com moedas e ranking global.
- **Marketplace de produtos digitais**: criadores venderem conteúdos exclusivos, templates, cursos ou merchandising.
- **Acessibilidade e internacionalização**: legendas, tradução da interface, alto contraste e reduced motion.

## Como prosseguir
Sugiro executar **Fase 1 + início da Fase 2 no próximo turno** (correções críticas + performance do feed/player). Depois seguir Fase 3 → 4 → 5.

Se concordar com a ordem, começo escrevendo o plano detalhado da Fase 1 e executando. Quer ajustar alguma prioridade?
