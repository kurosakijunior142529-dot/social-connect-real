O escopo é grande. Proponho fatiar em fases para entregar com qualidade — cada fase é funcional de ponta a ponta, sem placeholder.

## Fase 0 — Correção rápida (agora)
- **Bug do menu ⋮ do chat**: "Personalizar conversa" já foi adicionado no `ConversationMenu`, mas provavelmente não aparece porque a prop `onOpenCustomize` não foi passada em uma das telas (chat de grupo `chats.$id.tsx` ou DM `messages.$conversationId.tsx`). Vou auditar e ligar em ambas, garantindo abertura do sheet unificado (Balões + Papel de parede + Fonte + Bordas + Animações).

## Fase 1 — Player de vídeo imersivo (TikTok-like)
Escopo restrito à **área do vídeo** no Reels e no Feed:
- Player fullscreen sem chrome, overlay flutuante com gradientes topo/rodapé
- Autoplay + loop + pré-carregamento do próximo (IntersectionObserver + `<link rel=preload>`/`preload=auto`)
- Gestos: 1 toque = pause/play · 2 toques = like com coração animado (scale 0.8→1.2→1, fade) · long-press = 2× speed · swipe vertical suave com snap · swipe cancelado com efeito elástico
- Barra de progresso ultra-fina (2px) só na base, sem thumb — aparece só ao toque
- Botão de som discreto animado, inicia com áudio ligado (respeitando policy do browser: fallback muted → primeiro toque libera)
- Vibração leve (`navigator.vibrate`) no like
- Animações 60fps via `transform`/`opacity` (nada de layout thrash)
- Skeleton só no primeiro frame; próximos vídeos entram sem loading visível

## Fase 2 — Chat: personalização completa
Sheet "Personalizar conversa" unificado com abas:
- Balões (10 temas já existentes)
- Cor customizada (color picker) para tema Personalizado
- Papel de parede (já existe, integrar)
- Fonte da conversa (system/serif/mono/rounded)
- Raio de borda (slider)
- Animações on/off
- Persistência por conversa em `localStorage` + sincronização opcional em `conversations.meta` (DM)

## Fase 3 — Onboarding + sugestões
- Detectar `first_login` (ausência de follows do usuário)
- Tela `/onboarding/follow` mostrando Anny + Vibely (junior) com botão Seguir/Seguindo, "Seguir todos" e "Pular"
- Bloco "Sugestões para você" no feed quando o usuário não segue ninguém
- Flag persistida em `profiles.meta` ou tabela `user_preferences`

## Fase 4 — Foto de perfil com editor (Instagram-like)
- Modal com `react-easy-crop` (arrastar, pinça/zoom, máscara circular, preview)
- Compressão via Canvas antes do upload para bucket `avatars`
- Botões Cancelar/Confirmar, obrigatório aplicar ajuste

## Fase 5 — Menu de Conta funcional (financeiro + preferências)
Cada rota real, sem placeholder:
- **Carteira**: saldo disponível/pendente/sacado com contagem animada + Sacar + Histórico
- **Pagamentos**: métodos, adicionar, principal, status
- **Conta bancária & Pix**: CRUD com validação
- **Solicitar saque**: fluxo com mínimo R$10, valida saldo, cria pendente (já existe `request_withdrawal`, faltam validações UI)
- **Histórico financeiro**: lista + filtros entrada/saída
- **Monetização**: ganhos por vídeos/lives/presentes + gráfico + ranking
- **Notificações**: toggles persistentes (mensagens, curtidas, ganhos, lives)
- **Configurações**: editar nome/bio, tema, idioma
- **Privacidade**: conta pública/privada, comentários, mensagens
- **Segurança**: alterar senha, 2FA, sessões ativas
- **Ajuda**: FAQ + abrir chamado

## Fase 6 — Polimento global
- Transições fade+slide entre rotas (respeitando `prefers-reduced-motion`)
- Feedback de toque scale 0.95 nos botões
- Skeletons consistentes em todas as telas
- Auditoria de performance (React.memo, list virtualization no feed/reels)

---

## Como quero prosseguir
Executar **Fase 0 + Fase 1 + Fase 2 agora** (correções + player + chat personalização — o núcleo do pedido).  
Depois seguir Fase 3 → 4 → 5 → 6 em turnos seguintes.

Confirma essa ordem? Se preferir outra prioridade (ex.: começar pelo menu de Conta ou Onboarding), me diga.