# Compartilhar vídeo no privado como vídeo (não link)

Hoje, ao escolher um amigo na aba "Enviar" da folha de compartilhamento, o app envia uma mensagem de texto com o link. O objetivo é enviar o próprio vídeo, que aparece no chat como player, igual a um vídeo enviado pelo anexo.

## O que muda

- Ao tocar em "Enviar" para uma conversa, a mensagem criada passa a ser do tipo vídeo, apontando para o arquivo do vídeo original (mesmo arquivo já armazenado no app), com miniatura quando existir.
- O destinatário vê o vídeo tocável direto na conversa, com opção de abrir em tela cheia — sem link solto.
- Se o conteúdo não tiver arquivo de vídeo (por exemplo, compartilhar um perfil), o comportamento atual de enviar o link continua.
- Opcional e mantido: uma legenda curta com o título/autor junto ao vídeo, para dar contexto.
- Nenhuma mudança visual: mesmas abas, mesmos botões e mesmo estado "Enviado".

## Detalhes técnicos

- `src/components/share/share-sheet.tsx`: `sendTo()` deixa de inserir `{ kind: "text", content: link }`. Quando `target.media` existir, insere `{ kind: "video", media_bucket, media_url: path, media_type: "video/mp4", media_name, poster_url? , content: legenda opcional }` na tabela `messages`, mesma forma do envio por anexo em `messages.$conversationId.tsx`.
- `ShareTarget.media` ganha campos opcionais `posterPath` e `mimeType`; `src/components/reels/reel-item.tsx` passa `post.poster_url` quando disponível.
- `src/components/chat/message-body.tsx` já resolve URL assinada por `media_bucket`, então vídeos no bucket `posts` tocam sem alteração.
- Verificação necessária: as políticas de leitura do bucket `posts` precisam permitir que o destinatário gere URL assinada. Se a checagem mostrar que não permite, o envio copia o arquivo para o bucket de chat antes de inserir a mensagem (mesma UX, apenas mais lento no primeiro envio).
- Erros com `toast` e log de console; botão fica em estado de carregamento durante o envio.
