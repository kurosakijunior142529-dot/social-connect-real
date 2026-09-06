# Vibely Reality — MVP

Uma nova experiência dentro do Vibely: o usuário fotografa um ambiente, transforma com IA em um cenário (cinema, praia, espaço...) e cria uma sala para receber pessoas — "Entre na minha realidade".

Nada do que já existe é substituído: chat, chamadas, streaming, login, perfil e feed continuam iguais.

## Fluxo

Foto → Transformação → Sua realidade → Criar sala → Convidar → Entrar juntos.

## O que será criado

1. **Entrada na navegação** — item "Vibely Reality" com ícone de portal, no menu lateral (desktop) e no menu "Mais" (celular), no mesmo estilo dos outros itens.
2. **Tela inicial `/reality`** — apresentação curta, botões "Criar minha realidade" e "Explorar realidades", lista "Minhas realidades" e estado vazio com convite para criar.
3. **Criar** — tirar foto ou escolher da galeria, prévia, escolha entre os 10 estilos (Cinema, Praia, Espaço, Cidade futurista, Festa, Sala gamer, Escritório moderno, Universo, Aconchegante, Fantasia) mais "Criar com IA" com descrição livre.
4. **Resultado** — imagem em destaque com "Transformar novamente", "Escolher outro estilo" e "Criar sala"; durante a geração, tela de carregamento "Criando sua realidade..." e mensagem de erro com "Tentar novamente".
5. **Criar sala** — nome, descrição opcional e privacidade (Pública / Somente convidados / Somente amigos).
6. **Página da sala `/reality/$id`** — topo com voltar, nome e nº de pessoas; a imagem da realidade como elemento principal; barra com Voz, Vídeo, Chat, Assistir e Convidar; lista de presentes com avatar e nome.
7. **Explorar realidades** — grade de salas públicas com imagem, nome, criador, nº de pessoas e botão Entrar.
8. **Perfil** — seção opcional "Minhas Realidades" e possibilidade de marcar uma como realidade em destaque.

## Reaproveitamento (sem duplicar sistemas)

- **Chat da sala**: mensagens do Streaming Amigo (`watch_room_messages`) já existentes, em tempo real.
- **Presença/participantes**: membros de sala já existentes.
- **Voz e vídeo**: mesma infraestrutura de chamadas/voz já usada no app.
- **Assistir juntos**: player e sincronização do Streaming Amigo atual, com as mesmas regras (sem burlar DRM).
- **Convite**: link/código de convite e compartilhamento já existentes.
- **Imagem por IA**: mesma integração de IA já usada no Studio (modelo de imagem do gateway Lovable), com erros claros de créditos/limite.
- **Fotos**: mesmo sistema de upload e links protegidos das outras mídias.

## Detalhes técnicos

- Tabela `realities`: `id, creator_id, name, description, original_image, generated_image, transformation_prompt, style, privacy, is_featured, created_at, updated_at`, com RLS (leitura pública só para `privacy = 'public'`; criador sempre; convidados via membro da sala) e os GRANTs necessários.
- Sala: a sala de realidade é criada como uma sala do Streaming Amigo (`watch_rooms`) com uma nova coluna `reality_id`, para herdar chat, membros, convites, presença e o player já prontos. Nenhuma tabela de mensagens ou de usuários nova.
- Bucket privado `realities` para imagem original e gerada, com URLs assinadas em cache (mesmo hook já usado) e miniatura/lazy loading nas listas.
- Server function autenticada `realityGenerate` (`src/lib/reality/*.functions.ts`) que monta o prompt do estilo + descrição livre e chama o gateway de imagem; modular, então trocar o provedor depois não afeta a interface. Sem imagem falsa de placeholder.
- Rotas novas: `src/routes/_authenticated/reality.index.tsx`, `reality.new.tsx`, `reality.$id.tsx`. Nenhuma rota existente é alterada além da adição do item de menu e da seção no perfil.
- Visual: tokens atuais (verde só em ação principal e status, regra 80/15/5), cards de vidro, cantos arredondados e tipografia já usados; animações curtas de entrada, geração e chat.
- Mobile-first: botões grandes, imagens responsivas, skeletons na geração e nas listas.
- Criador pode excluir a realidade, mudar privacidade, editar nome e remover participantes.

## Depois de implementar

Revisão do app: verificação de build/typecheck e conferência de que feed, chat, chamadas, Streaming Amigo, perfil e busca continuam funcionando como antes.
