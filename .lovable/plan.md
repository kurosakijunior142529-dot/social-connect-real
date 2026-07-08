## Diagnóstico

Quando alguém completa login (Google ou confirmação de e-mail), a URL do navegador fica com tokens de sessão no fragmento (ex.: `https://social-connect-real.lovable.app/#access_token=...&refresh_token=...`). Se você copia a URL da barra de endereço nesse momento — mesmo poucos segundos depois — e manda para outra pessoa, o navegador dela abre o link, o Supabase lê os tokens da URL automaticamente e ela cai **logada como você**. É por isso que o comportamento parece aleatório: só acontece se o link foi copiado logo após você entrar.

Fatores atuais que deixam esse buraco aberto:
1. O OAuth do Google e o `emailRedirectTo` do cadastro apontam direto para `window.location.origin` (a home), então os tokens ficam colados na URL da própria página que você navega.
2. Não há nenhuma limpeza do fragmento da URL depois que o Supabase consome os tokens — o hash permanece no histórico até você navegar para outra rota.

## Correção

### 1. Nova rota pública `/auth/callback`
Cria `src/routes/auth.callback.tsx` (rota pública, sem gate) que:
- Aguarda o Supabase consumir os tokens do fragmento (`onAuthStateChange` → `SIGNED_IN` ou `getSession()`).
- Usa `history.replaceState` para limpar completamente hash + query da URL.
- Redireciona: se autenticado → `/`; se não → `/auth`.

### 2. Redirecionar todos os fluxos para essa rota
- `src/routes/auth.tsx` → OAuth Google: `redirect_uri: ${window.location.origin}/auth/callback`.
- `src/routes/auth.tsx` → `signUp` `emailRedirectTo: ${window.location.origin}/auth/callback`.
- Qualquer outro `emailRedirectTo`/`redirectTo` (reset de senha etc.) passa a apontar para a mesma rota.

### 3. Rede de segurança no root
No `src/routes/__root.tsx`, dentro do `useEffect` que já ouve `onAuthStateChange`, adicionar um passo: sempre que o evento for `SIGNED_IN` ou `USER_UPDATED` e a URL contiver `access_token=`, `refresh_token=` ou `type=recovery` no hash/query, chamar `window.history.replaceState({}, "", window.location.pathname)` imediatamente. Isso protege qualquer fluxo futuro que esqueça de mandar para `/auth/callback`.

## Notas técnicas

- Não editamos `src/integrations/supabase/client.ts` (auto-gerado). A limpeza de URL fica em código de aplicação.
- A rota `/auth/callback` é pública (fora de `_authenticated`) para o Supabase conseguir hidratar a sessão via `localStorage` no navegador do recém-logado sem redirect loop.
- Não mexemos em nada de backend, RLS ou funções — o problema é 100% de fluxo de URL no cliente.

## O que NÃO faz parte

- Não invalida sessões já existentes (quem já entrou como você via link antigo continua entrando até você trocar a senha — se quiser, depois posso adicionar um botão "Sair de todas as sessões").
- Não altera a UI de login/cadastro além do destino do redirect.