# Fases restantes (Etapas 2 e 3)

A Etapa 1 (comentários com editar/excluir/responder, precisão do tradutor) e as figurinhas já estão prontas. Falta o seguinte.

## Etapa 2 — Vídeos e emojis

**Separar vídeos de post e vídeos de feed (reels)**
O campo `post_kind` ('post' | 'reel') já existe no banco, mas ainda não é usado em nenhuma tela. Vamos:
- Gravar `post_kind` na criação: vídeo vertical curto criado pelo fluxo de vídeo entra como `reel`; publicação normal entra como `post`.
- Filtrar o feed inicial para mostrar apenas `post`, e a aba de reels para mostrar apenas `reel`.
- Perfil do usuário: separar as abas de publicações e vídeos pelo mesmo campo.

**Cortar e editar vídeos em qualquer publicação**
Editor leve, sem mudar o visual atual dos fluxos de criação:
- Aparar início/fim com uma barra de recorte sobre a pré-visualização já existente.
- Escolher o quadro da capa.
- Silenciar áudio e ajustar proporção (original / vertical).
- O corte é aplicado no próprio aparelho antes do envio, então o arquivo enviado já sai menor e mais rápido.

**Emojis próprios do app**
- Um conjunto de emojis exclusivos, usáveis em mensagens, comentários e reações, com atalho por código (ex.: `:festa:`).
- Renderização como imagem inline junto do texto, sem alterar o layout das bolhas.

## Etapa 3 — Interface e performance

**Interface de chamadas e legendas**
- Legendas com melhor legibilidade: bloco fixo na parte inferior, original + tradução, tamanho ajustável, e o botão de tentar novamente já existente integrado de forma discreta.
- Controles da chamada reagrupados com hierarquia mais clara, mantendo cores e estilo atuais.

**Interface do chat**
- Cabeçalho mais compacto com presença/digitando.
- Agrupamento de mensagens do mesmo autor, separadores de data, e melhor alvo de toque nas ações.
- Barra de composição reorganizada (anexos, figurinhas, GIF, áudio) sem alterar cores.

**Qualidade de áudio do chat**
- Gravação de voz em 48 kHz mono com cancelamento de eco/ruído já configurado, normalização de volume no envio e forma de onda real no player.

**Otimização geral**
- Carregamento sob demanda das telas pesadas (chamadas, reels, jogos, editor de vídeo).
- Imagens e vídeos com carregamento tardio e miniaturas.
- Menos consultas repetidas ao backend via cache de consultas.

## Detalhes técnicos

- Escrita de `post_kind` em `src/routes/_authenticated/create.tsx` e `create_.video.tsx`; leitura/filtro no feed (`_authenticated/index.tsx`), `reels.tsx` e `u.$username.tsx`.
- Editor de vídeo novo em `src/components/media/video-trimmer.tsx`, usando `MediaRecorder` + `canvas`/`WebCodecs` quando disponível, com fallback para envio sem corte.
- Emojis do app: manifesto em `src/lib/app-emojis.ts` + parser inline reutilizado por `message-body.tsx` e `post-comments.tsx`.
- Legendas: refatorar apenas a camada de apresentação em `call-screen.tsx`; a lógica de `call-provider.tsx` permanece.
- Áudio: ajustes em `chat/audio-recorder.tsx` (normalização) e no player de voz.
- Performance: `React.lazy` nas rotas pesadas e revisão das `queryOptions`.
