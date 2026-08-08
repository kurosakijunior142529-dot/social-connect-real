# Pacote de 50 figurinhas + compartilhamento de vídeo

## 1. Pacote oficial com 50 figurinhas

Um novo pacote oficial "Vibely 50" aparece na aba Figurinhas do painel de expressões (chat e comentários), junto com o pacote atual.

- **20 figurinhas estáticas**: geradas em estilo 3D com fundo transparente (reações, mãos, corações, animais, comida, símbolos), enviadas para o armazenamento do app.
- **30 figurinhas animadas**: GIFs/WebP animados reais, curados do catálogo Tenor (busca por figurinhas com fundo transparente) e salvos como itens fixos do pacote, para que animem em qualquer lugar — no chat, nos comentários e fora do app.

Cada figurinha entra no banco como item oficial com nome, posição e pacote, então continua funcionando com recentes, favoritos e busca já existentes.

Observação: a curadoria dos 30 GIFs depende da API da Tenor estar respondendo. Se ela continuar desativada no momento da execução, o pacote entra com as 20 estáticas e as animadas ficam pendentes até a chave ser liberada — aviso claro no final.

## 2. Compartilhar vídeo

Uma folha de compartilhamento única, reutilizada em todos os lugares onde há vídeo (reels, post de vídeo, watch, perfil):

- **Enviar para usuários do app**: lista de conversas com busca; ao escolher, o vídeo é enviado como mensagem no chat (mesma lógica de envio já existente).
- **Redes externas**: WhatsApp, Facebook, Telegram, X e copiar link. Em celular, usa o compartilhamento nativo quando disponível; senão abre o link da rede.
- **Baixar o vídeo**: salva o arquivo no dispositivo.

O botão de compartilhar que já existe passa a abrir essa folha em vez do compartilhamento nativo direto. Nenhuma mudança de cores ou layout das telas — só o conteúdo do menu de compartilhar.

## Detalhes técnicos

- Migração: coluna `pack` e `animated` em `public.stickers` (default no pacote atual), com GRANTs e políticas de leitura mantidas; inserção das 50 linhas por migração (URLs de armazenamento para as estáticas, URLs Tenor para as animadas).
- Estáticas: `imagegen` com fundo transparente → upload no bucket `stickers` (pasta `official/`) → URL pública/assinada conforme o padrão atual do `useStickers`.
- Animadas: consulta ao endpoint de stickers da Tenor via a server function existente (`src/lib/gifs.functions.ts`), fixando as URLs `.gif`/`.webp` escolhidas.
- `src/components/chat/sticker-picker.tsx` / `expression-panel.tsx`: agrupamento por pacote na barra de pacotes já existente; render com `<img loading="lazy">` (GIF anima sozinho).
- Novo `src/components/share/share-sheet.tsx`: props `{ url, title, mediaBucket, mediaPath }`; abas "Enviar" (conversas via consulta existente) e "Compartilhar"; download via URL assinada + `<a download>`.
- Pontos de uso atualizados: `src/components/reels/reel-item.tsx`, `src/routes/_authenticated/p.$id.tsx`, `watch.*`, `u.$username.tsx` — apenas troca do handler `share`.
- Todos os fluxos com `try/catch`, `toast` de erro e logs de console para depuração.
