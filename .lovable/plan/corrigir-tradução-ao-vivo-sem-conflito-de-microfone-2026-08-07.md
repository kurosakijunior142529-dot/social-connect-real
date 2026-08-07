# Corrigir tradução ao vivo sem conflito de microfone

## Objetivo
Estabilizar chamadas e tradução no mobile usando exclusivamente as faixas de áudio já criadas pela chamada, sem alterar o design existente.

## Implementação

### 1. Uma única captura de mídia
- Remover o uso de `SpeechRecognition`, inclusive seu reinício automático em `onend`, pois esse caminho pode abrir uma segunda captura do microfone.
- Alimentar a transcrição somente com o `localStream` já obtido pela chamada e publicado no LiveKit.
- Manter as legendas remotas pelo canal de sinalização: cada participante transcreve sua própria faixa da chamada e envia apenas o texto ao outro lado.
- Garantir que ativar/desativar a tradução nunca chame `getUserMedia`, nunca pare a faixa da chamada e nunca altere seu estado de mute.

### 2. Estado real de conexão
- Criar um estado explícito de mídia conectada, atualizado pelos eventos reais da sala e somente após publicação bem-sucedida da faixa local.
- Permitir iniciar tradução apenas quando a sala estiver conectada e a faixa de áudio estiver ativa; antes disso, manter o tradutor parado.
- Parar imediatamente transcrição, filas e timers ao reconectar, desconectar, encerrar ou trocar de chamada.
- Impedir que “Você está falando” apareça antes da conexão real ou quando a faixa estiver mutada/inativa.

### 3. Pipeline de transcrição controlado
- Refatorar o capturador para observar a faixa existente em janelas curtas, com detecção de silêncio e no máximo uma requisição de transcrição em andamento.
- Remover loops de reinício; usar uma sessão cancelável por chamada, timeout por envio e descarte seguro de resultados atrasados.
- Evitar acúmulo de áudio durante rede lenta e limitar a frequência de atualizações de estado/legendas para preservar a UI no mobile.
- Reutilizar o processamento de áudio quando possível e liberar `AudioContext`, nós, listeners e buffers no cleanup.

### 4. Tradução e idiomas
- Preservar a lista existente de 10 idiomas e validar a seleção antes de atualizar o idioma alvo.
- Fazer o seletor continuar responsivo durante conexão/transcrição e aplicar o novo idioma às próximas legendas e às legendas visíveis.
- Serializar/deduplicar traduções para evitar chamadas repetidas e ignorar respostas pertencentes a idioma ou chamada anteriores.

### 5. Estados e feedback sem mudança visual
- Usar o painel atual para mostrar “Aguardando conexão” enquanto a mídia não estiver pronta.
- Exibir “Ouvindo a conversa…” somente durante uma sessão ativa de transcrição.
- Mostrar legenda original e tradução real quando disponíveis; em timeout/falha, encerrar o estado pendente e apresentar erro amigável sem travar a chamada.
- Desabilitar logicamente a ativação precoce, mantendo cores, layout, componentes e aparência atuais.

## Validação
- Verificar que existe apenas uma chamada a `getUserMedia` por início/aceite de chamada e nenhuma ao alternar tradução.
- Testar ativar/desativar repetidamente, trocar idioma, mutar, reconectar e encerrar sem listeners, contextos ou requisições órfãs.
- Validar chamada de áudio e vídeo em viewport mobile, incluindo conexão lenta e falha de transcrição.
- Confirmar que a chamada permanece funcional quando a IA estiver indisponível e que a interface não exibe fala/conexão incorretamente.

## Detalhes técnicos
- Arquivos principais: provider da chamada, tela da chamada e capturador de áudio existente.
- O backend de speech-to-text e tradução continuará protegido no servidor; áudio curto será processado de forma serial, com cancelamento lógico e timeout.
- A captura será derivada de `MediaStreamTrack` já ativo, sem aquisição adicional de dispositivo.