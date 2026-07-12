## Plano de implementação

### 1. Corrigir chamadas mudas de forma robusta
- Substituir a sinalização volátil por uma sinalização persistente no backend para ofertas, respostas, candidatos ICE e encerramento da chamada.
- Criar regras seguras para que apenas os dois participantes da chamada possam ler/enviar sinais.
- Ajustar o fluxo WebRTC para:
  - pedir microfone/câmera diretamente no clique de ligar/atender;
  - adicionar transceptores de áudio/vídeo explicitamente;
  - separar stream de áudio remoto do vídeo remoto;
  - reproduzir o áudio remoto em um elemento dedicado, com retry após toque/clique/visibilidade;
  - mostrar erro claro quando o microfone estiver bloqueado, ausente ou em uso;
  - exibir estado real de conexão: chamando, conectando, conectado, reconectando ou falhou.
- Melhorar a tela de chamada mantendo viva-voz visual, mudo, câmera frontal/traseira, volume e indicadores de conexão sem quebrar o fluxo atual.

### 2. Corrigir criação de grupos/canais e Streaming Amigo
- Restaurar/adicionar triggers idempotentes para:
  - ao criar grupo/canal, inserir automaticamente o criador como dono em `chat_members`;
  - ao criar sala do Streaming Amigo, inserir automaticamente o anfitrião como membro e criar o estado inicial da sala.
- Fazer backfill seguro dos grupos/canais e salas já criados sem membro/estado.
- Corrigir o Streaming Amigo para não fechar/quebrar a sala em refresh, troca de rota ou compartilhamento.
- Ajustar entrada por convite para aceitar tanto código quanto link completo e mostrar mensagens amigáveis.
- Polir a interface da sala com player mais estável, chat lateral melhor no mobile e desktop, botão de copiar link/código e status de sincronização.

### 3. Melhorar feed e aba principal
- Redesenhar o topo do feed com ações rápidas para conversas, criar, Streaming Amigo e configurações.
- Melhorar o estado vazio, carregamento e espaçamento dos posts/stories para parecer mais app profissional.
- Ajustar navegação principal no mobile para facilitar acesso às áreas importantes sem sobrecarregar a barra inferior.

### 4. Configurações completas com sair da conta
- Expandir a tela de Configurações além do perfil:
  - conta e sessão;
  - botão “Sair da conta” usando a limpeza segura já existente;
  - atalhos para salvos, marketplace, streaming e notificações;
  - preferências básicas de experiência.
- Reaproveitar a lógica de logout do app shell para evitar duplicação insegura.

### 5. Papel de parede no chat
- Adicionar suporte a papel de parede por conversa.
- Criar opções rápidas de temas/papéis visuais e opção para remover/restaurar padrão.
- Aplicar o papel de parede na área de mensagens com overlay para manter leitura boa.
- Adicionar a ação no menu da conversa.

### 6. Validação
- Testar criação de grupo/canal e verificar se aparece na lista imediatamente.
- Testar criação, compartilhamento e entrada no Streaming Amigo por código/link.
- Testar chamada de áudio/vídeo em dois usuários/janelas quando possível, validando microfone, recebimento de track remoto, autoplay e estado da conexão.
- Verificar layout mobile do feed, settings, chamada, chat e sala de streaming.