# Tradução ao vivo nas chamadas — correção completa

## O que está quebrado hoje

Verifiquei o código atual (`src/components/call-provider.tsx`, `src/components/call-screen.tsx`, `src/components/call-audio-level.ts`):

1. **A minha própria fala nunca é traduzida.** O reconhecimento de voz cria a legenda com o texto original e envia para o outro lado, mas nunca chama a tradução — por isso fica só "traduzindo…" ou o texto cru.
2. **Se o outro não ativar a tradução, nada chega.** As legendas só são enviadas quando quem fala tem o tradutor ligado, e só são exibidas se quem recebe também tem. Com um lado desligado, o painel fica eternamente em "Ouvindo a conversa…".
3. **O idioma parece travado em português.** O seletor muda só o alvo da tradução; o reconhecimento de voz continua fixo no idioma do aparelho e nunca é reiniciado. Além disso o alvo já muda, mas como nada é traduzido, parece que não funciona.
4. **Sem suporte fora do Chrome/Safari.** Em WebView Android e Firefox a Web Speech API não existe e o botão só mostra um toast de erro.

A lista de idiomas já existe (10 idiomas) e o dropdown já renderiza — o problema é o comportamento por trás.

## O que vou fazer

### 1. Traduzir os dois lados
- Minha fala reconhecida passa a ser traduzida para o idioma escolhido e aparece como legenda "Você" com original + tradução.
- A fala do outro continua sendo traduzida ao chegar, mas agora independentemente de o outro ter ativado o tradutor.
- Legendas recebidas são exibidas sempre que **eu** estiver com a tradução ligada.

### 2. Envio de legenda sempre que houver fala
- Enquanto o meu tradutor estiver ligado, transmito minha transcrição para o outro lado mesmo que ele esteja com o recurso desligado (ele só verá quando ligar). Se a tradução for o mesmo idioma da fala, mostro apenas o texto original, sem chamada de IA desnecessária.

### 3. Seletor de idioma funcional
- Um único seletor: **o idioma que eu quero ler**. Trocar o idioma:
  - atualiza o alvo imediatamente,
  - re-traduz as últimas legendas visíveis para o novo idioma,
  - reinicia o reconhecimento de voz sem cortar a chamada.
- O idioma da minha fala continua sendo detectado pelo aparelho, então falo naturalmente e leio no idioma escolhido.
- Idiomas já disponíveis: Português, Inglês, Espanhol, Francês, Alemão, Italiano, Japonês, Coreano, Chinês e Árabe.

### 4. Fallback por IA (funciona em qualquer navegador/mobile)
- Se a Web Speech API não existir (WebView Android, Firefox) ou falhar repetidamente, entro automaticamente no modo de transcrição por IA: gravo trechos curtos do meu microfone (WAV de ~4s, completos e decodificáveis), envio para o servidor, transcrevo e traduzo.
- O microfone da chamada não é interrompido — a captura é feita a partir do stream já existente.
- O painel indica discretamente qual modo está ativo, sem mudar o layout.

### 5. Erros amigáveis, sem travar
- Falha de tradução → mostra o texto original em vez de erro.
- Sem créditos de IA / limite excedido / microfone bloqueado → mensagem curta e clara, tradutor desliga sozinho, a chamada continua normal.
- Todos os erros ficam logados no console para depuração.

### Design
Nenhuma cor, layout ou componente visual muda. O painel, o botão "Traduzir/Traduzindo" e o dropdown continuam exatamente como estão — apenas passam a funcionar.

## Detalhes técnicos

- `src/components/call-provider.tsx`: traduzir legendas locais; remover o gate de `translationEnabledRef` no envio; recriar o `SpeechRecognition` ao trocar idioma; re-tradução das legendas em cache ao trocar alvo; máquina de estados `idle | listening | fallback | error`.
- Novo `src/lib/call-transcribe.functions.ts`: server fn autenticada que recebe um WAV curto e chama o endpoint de speech-to-text do Lovable AI (`openai/gpt-4o-mini-transcribe`), retornando o texto.
- Novo `src/lib/call-stt-fallback.ts`: captura PCM via Web Audio a partir do stream local, encoda WAV 16 kHz mono em janelas de ~4s com detecção de silêncio, e envia para a server fn.
- `src/lib/ai.functions.ts`: `translateText` ganha suporte a lote (traduzir várias legendas de uma vez ao trocar de idioma) mantendo a assinatura atual.
- `src/components/call-screen.tsx`: apenas texto de estado do painel (ex.: "Ouvindo…", "Transcrevendo por IA…", mensagem de erro) — sem mudanças de estilo.
