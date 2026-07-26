## Escopo

Você pediu 16 blocos ao mesmo tempo (Perfil, Carteira, Bancária, Saque, Histórico, Premium, Pagamentos, Monetização, Notificações, Configurações, Privacidade, Segurança, Ajuda, Banco de dados, etc). Fazer tudo de uma vez em uma única entrega vira código raso, telas quebradas e migrações difíceis de reverter. Vou fatiar em 5 fases entregáveis, cada uma com rotas próprias, tabelas próprias, RLS e UI real — sem remover nada do que já existe.

Muita coisa da lista já existe hoje (Carteira em `/wallet`, Pro em `/pro`, Notificações em `/notifications`, Saque + Admin, Configurações em `/settings`, Bank accounts, Withdrawals, Subscriptions, User coins). O trabalho é **reorganizar em rotas dedicadas + preencher os vazios**, não recriar do zero.

## Fase 1 — Perfil + Menu + Hub de Conta (esta entrega)

**Perfil (`/u/$username`)** reorganizado na ordem exata pedida:
Capa → Avatar → Nome → @user → Bio → Links → Localização → Selos → Stats (Seguidores · Seguindo · Curtidas · Views) → Botões (Seguir · Mensagem · Compartilhar · Editar) → Abas (Posts · Vídeos · Mídia · Curtidos · Salvos*) → Grade.

*Curtidos e Salvos só aparecem para o dono. Curtidas totais e Views agregadas vêm de `likes` e `posts.view_count` (adicionar coluna se faltar).

**Remover do perfil**: o card Carteira e a seção "Conta" que coloquei antes. O perfil volta a ser só vitrine.

**Menu ⚙️ no canto superior direito do próprio perfil** abre `/account` — hub central com todos os atalhos agrupados:
- Financeiro: Carteira, Pagamentos, Conta bancária/Pix, Solicitar saque, Histórico financeiro, Monetização
- Premium: Assinaturas
- Preferências: Notificações, Configurações, Privacidade, Segurança, Ajuda

Cada item leva à sua **rota própria** (não abre modal, não redireciona pra mesma tela).

## Fase 2 — Financeiro dedicado

Rotas novas (hoje tudo mora dentro de `/wallet` e `/settings`):
- `/account/wallet` — saldo, moedas, BRL, últimos ganhos, últimos saques, pendentes, gráfico simples (recharts)
- `/account/bank` — CRUD de contas + Pix, marcar principal, validação
- `/account/withdraw` — fluxo isolado com seleção de conta, valor, taxas, líquido, cancelar antes de análise
- `/account/history` — extrato unificado com filtros (entradas/saídas/saques/presentes/assinaturas/lives/compras) + busca + data
- `/account/payments` — métodos salvos + histórico de cobranças + recibos

Tabela nova: `wallet_transactions` (id, user_id, kind, amount_coins, amount_brl, ref_type, ref_id, metadata, created_at) — hoje isso está espalhado em `coin_purchases`, `withdrawals`, `live_gifts`, `subscriptions`. Cria uma view/tabela que unifica pra alimentar Histórico e Monetização sem duplicar lógica.

## Fase 3 — Premium + Monetização

- `/account/premium` — planos, benefícios, status atual, histórico
- `/account/monetization` — ganhos por vídeos, lives, assinaturas, presentes, programa de criadores, metas, gráficos
- Nova tabela `creator_earnings` alimentada por triggers em `live_gifts`, `channel_subscriptions`, `subscriptions`

## Fase 4 — Preferências profissionais

- `/account/notifications` — central com filtros, marcar lido, excluir; toggles push por categoria (tabela `notification_preferences`)
- `/account/settings` — idioma, tema (claro/escuro/sistema), cache, qualidade de vídeo, autoplay, exportar dados, desativar/excluir conta
- `/account/privacy` — conta privada, quem comenta/mensagem/liga/marca/segue, bloqueados, silenciados, filtro de palavras (tabela `privacy_settings` + `word_filters`)
- `/account/security` — trocar senha, email, telefone, 2FA, PIN, sessões ativas, dispositivos, histórico de login, encerrar sessões
- `/account/help` — FAQ + abrir ticket com anexos (tabelas `support_tickets`, `ticket_messages`)

## Fase 5 — Polimento e integração

- Push notifications reais (Web Push + service worker)
- Realtime no histórico financeiro
- Gráficos com dados reais (7d, 30d, 12m)
- Auditoria de rotas: nenhum botão redireciona pra mesma tela; skeletons; error boundaries; empty states

## Nesta resposta eu entrego a Fase 1 completa

1. Reorganizar `src/routes/_authenticated/u.$username.tsx` na ordem exata + abas novas (Vídeos, Mídia, Curtidos, Salvos)
2. Remover carteira/seção "Conta" do perfil
3. Botão ⚙️ no header do perfil (só do dono) → `/account`
4. Criar `src/routes/_authenticated/account.index.tsx` — hub agrupado
5. Migração: coluna `view_count` em `posts` se não existir, para a métrica de Visualizações
6. Adicionar rota `/account` ao sidebar (renomeando "Configurações" pra "Conta")

Depois eu volto e pergunto qual fase seguinte quer priorizar.

## Detalhes técnicos

- Stack: TanStack Start + Supabase, tudo existente reaproveitado
- Curtidas totais do usuário: `SELECT count(*) FROM likes l JOIN posts p ON p.id=l.post_id WHERE p.author_id=$1`
- Views totais: soma de `posts.view_count` (adicionar coluna `integer default 0 not null` + GRANT + policy pra incrementar via RPC futura)
- Abas Vídeos/Mídia: filtrar `posts` por presença de vídeo/mídia (`media_urls`)
- Curtidos: `likes` do próprio usuário
- Salvos: `saved_posts` do próprio usuário
- Selos: usa `has_role(admin)` + `is_verified` já existente
- Nada é removido: `/wallet`, `/pro`, `/settings`, `/notifications`, `/admin/withdrawals` continuam funcionando; novas rotas `/account/*` são adicionadas nas fases seguintes

Aprova a Fase 1 para eu implementar agora?