# Evolução do app: figurinhas, comentários, vídeos e novo chat

Entrega em 3 etapas. Cada etapa é revisável antes da próxima.

## Etapa 1 — Base funcional (tradutor, áudio, comentários)

**Tradutor de chamadas ouvindo errado**
- Reduzir falsos positivos: exigir energia de voz sustentada antes de abrir uma janela de fala, descartar trechos muito curtos e transcrições com baixa confiança/ruído ("ah", "hm", repetições).
- Enviar dica de idioma de origem para a transcrição em vez de deixar o modelo adivinhar, com opção "detectar automaticamente".
- Manter contexto das 2 últimas falas para a transcrição desambiguar frases curtas.
- Anti-eco mais forte: quando o outro lado está falando, a janela local só abre se o volume local for claramente maior.

**Áudio do chat**
- Gravação de voz em Opus 48 kHz mono com bitrate alto e cadeia de captura consistente (EC/NS/AGC), normalização leve antes do upload.
- Player de áudio com pré-carregamento sob demanda e waveform já existente mantida.

**Comentários de post**
- Editar comentário próprio (com marca "editado"), excluir comentário próprio, e o dono do post pode excluir comentários no post dele.
- Responder a comentário (thread simples de 1 nível).
- Enviar figurinha como comentário (habilitado junto da Etapa 2).

## Etapa 2 — Figurinhas/emojis e separação de vídeos

**Pacote próprio + upload do usuário**
- Pacote oficial exclusivo do app (conjunto de figurinhas geradas para a marca) disponível a todos.
- Cada usuário pode enviar as próprias figurinhas (imagem/webp), listadas em "Minhas figurinhas", com limite de tamanho e possibilidade de excluir.
- Seletor de figurinhas no chat (ao lado do GIF), nos comentários e nas respostas.
- Reações rápidas em mensagens usando o pacote próprio.

**Post vs. Reel**
- Na criação, um seletor "Publicar como: Post / Reel", com sugestão automática pelo formato (vertical → Reel) que o usuário pode trocar.
- Feed mostra apenas posts; a aba Reels mostra apenas vídeos marcados como Reel.

**Editor de vídeo em qualquer publicação**
- Cortar início/fim (trim), escolher capa, aplicar os filtros já existentes e silenciar áudio — disponível para post, reel, story e vídeo enviado no chat.

## Etapa 3 — Interface (chat e chamadas) e performance

**Redesenho do chat** (direção visual nova, mantendo a identidade escura do app)
- Cabeçalho compacto com avatar, presença e ações; bolhas com melhor tipografia, agrupamento por autor e horário discreto.
- Barra de composição redesenhada: anexo, figurinha/GIF, áudio e envio em uma linha estável, sem pulos de layout.
- Mídia em bolha com cantos e proporções consistentes; respostas, encaminhamento e reações mais legíveis.

**Chamadas e legendas**
- Controles em uma barra flutuante coesa, seletor de idioma mais claro e legendas em painel legível com original + tradução, estado de erro e "tentar novamente".

**Otimização**
- Divisão de código por rota, carregamento tardio de mídia, listas virtualizadas em chats longos, menos re-renderizações e cache melhor das consultas.

## Notas técnicas

- Banco: colunas novas em `comments` (`parent_id`, `edited_at`, `sticker_url`), coluna de tipo de publicação em `posts`, tabelas `stickers` (pacote oficial) e `user_stickers`, com GRANTs e RLS por dono.
- Storage: bucket de figurinhas do usuário com política por `user_id`.
- Reels passam a filtrar pelo novo campo de tipo em vez de `media_type = 'video'`.
- Trim de vídeo feito no cliente (canvas + MediaRecorder), reaproveitando o estúdio de vídeo existente.
- Transcrição continua usando só o áudio já capturado da chamada, sem segundo `getUserMedia`.

## Perguntas de design (Etapa 3)

Antes de começar a Etapa 3, vou mostrar opções visuais de paleta, tipografia e layout para o chat.
