## Escopo confirmado

**Foco**: Rede social-primeiro + camada de mensagens rica + IA + monetização + privacidade.

## Conflitos e limites que preciso sinalizar antes

1. **E2E nos DMs vs IA no chat (resumo/tradução/respostas)** são incompatíveis por design. E2E significa servidor cego — sem servidor lendo mensagens, não há como resumir/traduzir do lado servidor. Duas opções:
   - **(a)** IA opcional por conversa: usuário liga IA → conversa passa a NÃO ser E2E (rótulo claro). E2E fica default; ou
   - **(b)** IA só nos grupos/canais/DMs "não-privados", E2E só num tipo novo "Chat Secreto" 1:1. **Vou assumir (b)** — melhor UX.
2. **Lives (1→N)** exigem serviço externo pago (LiveKit Cloud, Cloudflare Stream, Mux). Sem isso, no máximo 1:1 WebRTC. **Vou entregar a UI + tabelas de live agora e deixar o transporte plugável; assim que você conectar um provedor, ativa.** Se topar LiveKit gratuito de dev, ligo direto.
3. **Chamadas em grupo com tela compartilhada** — WebRTC mesh escala mal. Vou entregar suporte até 4 participantes; acima disso precisa SFU (LiveKit/Mediasoup).
4. **Monetização** — vou usar o `enable_stripe_payments` da Lovable (sem chave). Requer você preencher formulário curto (email, nome do negócio).
5. **Vídeos curtos (reels)** — armazenamento vai crescer rápido. Vou adicionar limite de tamanho/duração por upload.

## Onda 1 — Mensagens ricas + IA no chat + privacidade fina
Foco em experiência de conversa (o que hoje está mais raso). Sem provedores externos, entrega imediata.

**Mensagens (DM + grupos + canais):**
- Editar mensagem (com histórico de edições visível)
- Apagar pra mim / apagar pra todos
- Responder (quote inline) + encaminhar
- Reações com emoji
- Agendar envio (server-side com pg_cron rodando a cada minuto)
- Mensagens temporárias por conversa (auto-delete 24h/7d/custom)
- "Digitando…" e recibos de leitura por membro
- Anexos: imagem, vídeo, áudio, arquivo genérico até 25 MB

**IA no chat (canais não-privados):**
- Comando `/ia <pergunta>` em qualquer conversa → responde só pra você (efêmero) ou pra todos
- Botão "Resumir conversa" nos grupos
- Botão "Traduzir" por mensagem (auto-detecta idioma origem, 100+ destinos via Lovable AI)
- Respostas inteligentes: 3 sugestões contextuais acima do input
- Transcrever áudio: mensagens de voz caem no `openai/gpt-4o-mini-transcribe` e mostram texto
- Legenda em chamadas: transcrição em tempo real do próprio áudio (STT streaming) exibida como overlay

**Privacidade:**
- Ocultar status online individualmente (whitelist/blacklist por usuário)
- Ocultar "visualizado" por conversa
- Silenciar conversa/story/usuário (mute, sem bloquear)
- Cofre secreto: aba trancada por PIN local que esconde conversas escolhidas (o PIN gera passphrase local; conversas continuam server-side)
- Chat Secreto 1:1 com E2E de verdade (libsignal-like via WebCrypto: ECDH X25519 + AES-GCM, chaves no dispositivo, servidor só encaminha bytes). Sem IA, sem preview em notificação, sem backup.

## Onda 2 — Rede social expandida
**Reels:**
- Novo tipo de post: `video` vertical até 60s
- Rota `/reels` com feed vertical fullscreen, swipe, autoplay, mute default
- Contador de views, curtida-duplo-toque, share

**Novos tipos de post:**
- Enquetes com múltiplas opções + resultado ao vivo
- Eventos com data/local/RSVP
- Blog longo (rich text via TipTap, capa, tempo de leitura)

**Lives (UI + tabelas prontas, transporte plugável):**
- Tabela `live_streams` (host, título, status, viewer_count)
- Tela de host + tela de viewer, chat lateral em tempo real
- Placeholder de vídeo até você conectar LiveKit/Mux/Cloudflare

**Perfis profissionais:**
- Flag `is_professional` + campos: categoria, contato comercial, botões CTA
- Aba "Loja" no perfil pro (produtos digitais)

## Onda 3 — Monetização + chamadas em grupo
**Stripe (via `enable_stripe_payments`):**
- Assinaturas de criadores (mensal/anual)
- Gorjetas em posts/lives
- Venda de produto digital ou curso (arquivo + páginas)
- Painel `/studio` com receita, seguidores, alcance

**Chamadas:**
- Chamada em grupo até 4 (mesh WebRTC), promoção de DM 1:1 para grupo
- Compartilhamento de tela (getDisplayMedia)
- Histórico de chamadas com duração e status

## Onda 4 — Antispam por IA + verificação
- Classificador Lovable AI roda em toda nova mensagem/comentário/post → score de spam/golpe → auto-mute ou aviso
- Denúncia por usuário aciona re-scan com contexto
- Fluxo de verificação: upload de doc + selfie → fila de review → badge azul (moderação manual, sem KYC real)

## Estimativa e formato

- **Onda 1** entrego agora nesta rodada (é grande, mas cabe: reaproveita a infra atual de mensagens e stories).
- **Ondas 2, 3, 4** cada uma em rodada própria depois — se meter tudo junto, nada fica bom.
- Marco cada wave como "publish milestone" no final.

## Tech details (para você, não precisa entender)

- Edição/histórico: coluna `edited_at` + tabela `chat_message_edits(message_id, previous_content, edited_at)`
- Agendamento: `scheduled_messages(...)` + cron `SELECT * FROM scheduled_messages WHERE send_at <= now() AND sent = false` a cada minuto via pg_cron → mesma trigger `bump_chat`
- Temporárias: coluna `expires_at` nas mensagens + job de purga
- E2E: dispositivos com par de chaves gerado no primeiro login, `device_keys(user_id, device_id, public_key)`, mensagens de Chat Secreto vão em tabela separada `secret_messages(ciphertext BYTEA, nonce, sender_device, recipient_device)`. Backend só encaminha; realtime igual às normais.
- IA: server functions `createServerFn` com `@ai-sdk/openai-compatible` no gateway Lovable AI. Modelo default `google/gemini-3-flash-preview`. STT via `openai/gpt-4o-mini-transcribe`. Chaves ficam no server.
- Reels/lives: bucket `reels` privado, live via tabela + placeholder de transporte.

## Pergunta única antes de partir pra Onda 1

Você quer que **Chat Secreto E2E** entre já na Onda 1 (é o item mais pesado — reescreve o cliente de DM), ou fica pra rodada posterior e a Onda 1 sai mais leve/entregável?
