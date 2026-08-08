# Tradução resiliente + áudio de alta qualidade

## 1. Fallback quando a tradução falha

Hoje, se a tradução falha, a legenda ou fica em branco ("traduzindo…" eterno) ou mostra o texto original sem explicar nada — e ao trocar de idioma, se o lote falhar, as legendas visíveis ficam sem tradução para sempre.

O que muda:
- Cada legenda passa a ter um estado: traduzindo / traduzida / falhou.
- Em caso de falha, aparece a transcrição original com uma nota curta ("não foi possível traduzir") e um botão discreto **Tentar novamente** que re-traduz só aquela legenda.
- Ao trocar de idioma, se a re-tradução em lote falhar, as legendas voltam ao texto original marcadas como "falhou" (nunca ficam vazias) e há um **Tentar novamente** para o lote.
- O seletor de idioma nunca trava: a troca de idioma é aplicada imediatamente, independentemente do sucesso da tradução, e continua clicável durante a re-tradução.
- Erros de crédito/limite de IA mostram a mensagem real (curta) uma única vez, sem desligar a chamada.

## 2. Qualidade de áudio muito superior

Chamadas:
- Captura em 48 kHz mono com cancelamento de eco, supressão de ruído e ganho automático explícitos, e latência baixa.
- Publicação do áudio com preset de alta qualidade (Opus ~48–64 kbps, com correção de perda de pacote), em vez do bitrate padrão baixo.
- Reprodução sem processamento extra, volume total e desbloqueio automático de áudio já existente mantido.

Áudios do chat e vídeos:
- Gravação de voz com bitrate de áudio bem maior (128 kbps) e preferência por Opus 48 kHz.
- Estúdio de vídeo: áudio gravado em 128 kbps junto ao vídeo (hoje o bitrate de áudio não é definido, ficando no mínimo do navegador).
- Lives e sala de voz recebem as mesmas constraints de captura.

Nada disso muda cores, layout ou componentes.

## 3. Tradução mais precisa quando os dois falam juntos

Causa provável: o trecho enviado para transcrição inclui a voz do outro vazada pelo alto-falante, e trechos são cortados no meio da frase.

Ajustes:
- Detectar quando o áudio remoto está ativo e, nesses momentos, exigir voz local mais forte antes de aceitar o trecho (evita transcrever a voz do outro).
- Janelas de fala cortadas em pausas naturais, com pequena sobreposição no início do trecho seguinte para não perder palavras no corte.
- Descartar trechos muito curtos/ruidosos e legendas praticamente idênticas às já recebidas do outro lado (anti-eco).
- Enviar contexto de idioma correto ao transcrever e pedir tradução com o texto anterior como contexto, melhorando frases quebradas.

## Detalhes técnicos

- `src/components/call-provider.tsx`: `CallCaption` ganha `status: "pending" | "done" | "failed"` e `error?`; `pushMyCaption`, o handler de legenda recebida e `changeTranslationLanguage` passam a setar esses estados; nova função `retryCaption(id)` exposta no contexto; troca de idioma aplicada antes da chamada de rede.
- `src/components/call-screen.tsx`: renderiza nota de falha + botão "Tentar novamente" usando os componentes/estilos já existentes.
- `src/lib/call-stt-fallback.ts`: VAD com limiar adaptativo, gate contra áudio remoto (stream remoto passado como referência), sobreposição de ~300 ms entre janelas, descarte de trechos abaixo do mínimo de voz.
- `src/lib/webrtc.ts`, `src/routes/_authenticated/live.$id.tsx`, `src/components/voice/voice-provider.tsx`: constraints de captura unificadas (48 kHz, mono, EC/NS/AGC).
- `src/components/call-provider.tsx` (publishTrack): `audioPreset` de alta qualidade + `red: true`, `dtx` mantido.
- `src/components/chat/audio-recorder.tsx` e `src/routes/_authenticated/create_.video.tsx`: `audioBitsPerSecond: 128_000`.
- `src/lib/ai.functions.ts`: `translateText` aceita contexto opcional da legenda anterior; `translateBatch` retorna falhas parciais em vez de rejeitar tudo.
