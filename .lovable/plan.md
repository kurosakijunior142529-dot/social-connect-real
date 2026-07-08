## Causa

Ao criar `src/routes/auth.callback.tsx`, o roteador transformou `src/routes/auth.tsx` em rota-pai de `/auth/*`. Como `auth.tsx` renderiza o formulário de login (sem `<Outlet />`), a rota `/auth` falha na hidratação (`Hydration failed ... matchId="/auth/auth"`) e o formulário não funciona.

O backend continua OK: os logs mostram login Google `status:200` às 01:50:39 e `/user 200`. É só a página que está quebrada.

## Correção

Renomear os arquivos para o padrão que o TanStack espera quando uma rota tem filhos:

- `src/routes/auth.tsx` → `src/routes/auth.index.tsx`
  - Muda `createFileRoute("/auth")` para `createFileRoute("/auth/")` (é o único ajuste no código; o restante da página fica igual).
- `src/routes/auth.callback.tsx` permanece igual (`/auth/callback`).

Com isso:
- `/auth` volta a ser uma rota-folha e renderiza o formulário de login normalmente.
- `/auth/callback` continua funcionando como rota irmã, sem exigir Outlet.

## Verificação

1. Abrir `/auth` no preview e confirmar que o formulário monta sem erro de hidratação no console.
2. Fazer login com e-mail/senha e com Google e confirmar redirect para `/`.
3. Abrir `/auth/callback` diretamente e confirmar que redireciona para `/auth` (se sem sessão) ou `/` (se logado).

## Fora de escopo

- Não mexer no backend, RLS, políticas ou funções.
- Não alterar o fluxo de OAuth do Google — só corrigir o roteamento da página de login.