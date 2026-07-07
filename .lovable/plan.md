- Plano: Rede Social "All-in-One"

Uma rede social inspirada no melhor do Instagram, Facebook, Telegram e WhatsApp — com foco em fotos/vídeos, feed social e mensagens em tempo real. Visual colorido e divertido.

## Direção visual

- **Estilo**: Colorido e divertido, moderno, com gradientes vibrantes e formas ousadas (inspiração BeReal + Instagram + Threads)
- **Paleta**: Gradientes rosa/laranja/roxo como acentos, fundos claros com muito espaço branco, cards com sombras suaves e cantos generosamente arredondados
- **Tipografia**: Título display marcante (ex: Outfit ou Space Grotesk) + corpo legível (ex: Inter alternativa como Figtree)
- **Motion**: Micro-animações em curtidas (coração pulsando), transições suaves entre telas, skeleton loaders

## Escopo do MVP

### 1. Autenticação

- Cadastro/login com email + senha
- Login com Google
- Criação automática de perfil (username, nome, bio, avatar)
- Página `/auth` pública, rotas do app dentro de `_authenticated/`

### 2. Perfil

- Página `/u/$username` com avatar, bio, contagem de posts/seguidores/seguindo
- Edição de perfil próprio (avatar, bio, nome)
- Botão seguir/deixar de seguir

### 3. Posts (fotos e vídeos)

- Criar post com upload de imagem ou vídeo + legenda
- Feed principal (`/`) com posts de quem você segue + descoberta
- Página `/explore` com grid de posts populares
- Página de detalhe do post `/p/$id`

### 4. Interações

- Curtir/descurtir posts
- Comentar em posts
- Ver lista de curtidas e comentários

### 5. Seguir usuários

- Botão seguir em perfis
- Feed filtrado por quem você segue
- Notificações básicas (nova curtida, comentário, seguidor)

### 6. Mensagens diretas em tempo real

- Lista de conversas em `/messages`
- Chat 1-a-1 com mensagens em tempo real (Supabase Realtime)
- Indicador de mensagem lida

## Estrutura de rotas

```text
/                          → Feed principal (autenticado)
/auth                      → Login/cadastro (público)
/explore                   → Descobrir posts
/create                    → Criar novo post
/u/$username               → Perfil de usuário
/p/$id                     → Detalhe do post
/messages                  → Lista de conversas
/messages/$conversationId  → Chat individual
/notifications             → Notificações
/settings                  → Editar perfil
```

## Backend (Lovable Cloud)

**Tabelas principais:**

- `profiles` — dados públicos do usuário (username, display_name, bio, avatar_url)
- `posts` — post com media_url, media_type (image/video), caption, author_id
- `likes` — user_id + post_id
- `comments` — post_id, author_id, content
- `follows` — follower_id + following_id
- `conversations` — thread de DM entre 2 usuários
- `messages` — conversation_id, sender_id, content, read_at
- `notifications` — user_id, type, actor_id, target_id
- `user_roles` — separação segura de roles (admin/user)

**Storage buckets:**

- `avatars` (público) — fotos de perfil
- `posts` (público) — mídia dos posts

**Segurança:**

- RLS em todas as tabelas
- Perfis públicos legíveis por todos, edição só do dono
- Mensagens visíveis só para os dois participantes
- Trigger `handle_new_user` cria profile automaticamente no signup
- Realtime habilitado em `messages` e `notifications`

## Entregas por fase

**Fase 1 (esta iteração):**

1. Ativar Lovable Cloud + Google OAuth
2. Design system colorido (styles.css + fontes)
3. Auth (login/signup/Google) + criação de perfil
4. Layout autenticado com bottom nav (mobile-first) e sidebar (desktop)
5. Feed, criar post, perfil, curtir, comentar, seguir
6. Storage de mídia
7. Explore
8. DMs em tempo real
9. Notificações básicas

Vou construir tudo em uma iteração robusta, priorizando um app **funcional de verdade** — não uma casca. Depois iteramos com features avançadas (stories, reels, grupos, chamadas etc.) conforme prioridade.

## Detalhes técnicos

- **Stack**: TanStack Start + React + Tailwind v4 + shadcn + Lovable Cloud (Supabase)
- **Server functions** para leituras/escritas autenticadas com `requireSupabaseAuth`
- **Realtime** para chat e notificações via cliente browser Supabase
- **Uploads** direto do browser para Storage com URL assinada quando necessário
- **Validação** com Zod em todos os formulários
- **Mobile-first**: viewport atual é 390px, então priorizo layout mobile com bottom nav
- Função de chamadas reais, vídeo ,normal , ou em grupos 

Aprova para começar a construir?