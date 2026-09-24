# Reels com amigos, reações em áudio e Novo post finalizado

## Entrega
1. **Ver Reels com amigos**
   - Adicionar ao Reel uma ação “Ver com amigos” que cria uma sala vinculada ao vídeo atual.
   - Reaproveitar a sincronização, presença, convite e conversa do Streaming Amigo, adaptando o player da sala para mídia interna do Vibely.
   - Manter reprodução, swipe, curtidas, comentários, compartilhamento e feed de Reels atuais intactos.

2. **Reações rápidas em áudio**
   - Permitir gravar uma resposta curta de voz nos comentários de posts e Reels.
   - Exibir reprodução, duração, autor e estados de envio/erro; permitir exclusão pelo autor e pelo dono da publicação.
   - Armazenar os áudios de forma privada, com acesso restrito a quem pode visualizar a publicação.

3. **Finalizar Novo post**
   - Refinar o fluxo Foto/Vídeo, Texto e Enquete em celulares pequenos, sem remover editores, IA, moderação ou Studios.
   - Melhorar seleção e prévia da mídia, legenda e sugestões da Vibely AI, progresso de processamento e ação final de publicar.
   - Corrigir comportamento com teclado, área segura e barra inferior; manter mídia única porque a publicação múltipla ainda não existe nesse compositor.

## Validação
- Testar os três modos de Novo post em 360, 390, 412 e 1280 px.
- Testar criação, convite, entrada, sincronização e encerramento de uma sala de Reel.
- Testar permissão do microfone, gravação, envio, reprodução, erro e exclusão de reação em áudio.
- Confirmar compilação, ausência de erros de execução e que feed principal, Reels e Streaming Amigo não sofreram regressões.

## Detalhes técnicos
- Usar os componentes e tokens atuais do Vibely; sem novas cores ou redesign geral.
- Criar somente as estruturas de dados necessárias, sempre com permissões explícitas e políticas de acesso.
- Reaproveitar o gravador de áudio, armazenamento privado e infraestrutura de salas existentes, evitando lógica duplicada.