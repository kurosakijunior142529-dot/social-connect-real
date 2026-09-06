# Deixar as novidades visíveis no celular

Descobri o motivo: quase tudo o que foi criado nas últimas etapas só tem atalho no menu lateral, que **só aparece no computador**. No celular a barra de baixo tem apenas Início, Reels, Buscar, Criar, Conversas e Perfil — então Por perto, Streaming Amigo, Jogos, Canais de voz, Marketplace, Salvos, Carteira, Vibely Pro e Vibely AI ficam invisíveis, mesmo já funcionando.

A personalização do chat (balões, cores, fonte, cantos arredondados) existe, mas está escondida dentro do menu "..." da conversa, com o nome "Personalizar conversa".

## O que vou fazer

1. **Botão "Mais" no celular**
   - A barra de baixo passa a ter um item "Mais" (Perfil continua acessível por ele e pelo topo).
   - Ao tocar, abre uma gaveta com todas as seções: Por perto, Streaming Amigo, Jogos, Canais de voz, Marketplace, Salvos, Notificações, Lives, Carteira, Vibely Pro, Vibely AI, Conta, Ajustes e Sair — com ícone, nome e uma frase curta explicando o que é.
   - Itens novos ganham uma marca "Novo" por alguns dias.

2. **Personalização do chat mais fácil de achar**
   - Dentro da conversa, o item "Personalizar conversa" ganha destaque no topo do menu com o ícone de paleta.
   - Na primeira vez que a pessoa abre uma conversa, aparece uma dica discreta: "Toque aqui para mudar as cores dos balões" (some depois de fechada).

3. **Descoberta na tela inicial**
   - Um cartão de novidades no topo do feed (dispensável) apresentando o que chegou: balões personalizados, Por perto, Vibe do dia, sequência de conversas e Streaming Amigo, cada um levando direto à tela.

## Observações técnicas

- Alterações concentradas em `src/components/app-shell.tsx` (novo item "Mais" + `Sheet` reutilizando a lista do menu lateral), `src/components/chat/conversation-menu.tsx` (ordem/destaque) e um novo componente de cartão de novidades usado em `src/routes/_authenticated/index.tsx`.
- Textos entram nos dicionários de idioma existentes (`src/lib/i18n/locales/*`).
- Estados "Novo" e dicas ficam em preferência local, sem mexer no banco.
- Nada é removido: rotas, feed, perfil, chat, Studio e Streaming Amigo seguem iguais.
