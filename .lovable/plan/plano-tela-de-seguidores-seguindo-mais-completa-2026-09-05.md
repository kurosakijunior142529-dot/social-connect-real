# Plano: tela de Seguidores/Seguindo mais completa

## Estado atual
A tela já existe em `/u/<usuario>/follows` com abas "Seguidores" e "Seguindo", acessível ao tocar nos contadores do perfil. Hoje ela apenas lista avatar e nome, sem ações.

## O que melhorar

1. **Botões de ação em cada pessoa**
   - Na aba "Seguidores": botão "Seguir de volta" (ou "Seguindo" se já segue).
   - Na aba "Seguindo": botão "Seguindo" que permite deixar de seguir (com confirmação visual).
   - No próprio perfil do usuário logado, na aba "Seguidores": opção de remover seguidor (menu de 3 pontinhos).

2. **Selo "Segue você"** ao lado do nome de quem segue o usuário logado.

3. **Busca dentro da lista** — campo de pesquisa no topo para filtrar por nome ou @usuario.

4. **Estados vazios melhores** — ilustração/texto amigável ("Ainda sem seguidores", "Você ainda não segue ninguém") com botão para explorar pessoas.

5. **Verificado e avatar** mantidos, com navegação ao tocar para o perfil da pessoa.

## Detalhes técnicos
- Arquivo: `src/routes/_authenticated/u.$username.follows.tsx` (somente frontend; usa a tabela `follows` e RPCs já existentes de seguir/deixar de seguir).
- Busca filtra no cliente sobre a lista já carregada (até 500 itens).
- Nenhuma mudança de banco de dados, RLS ou design global — visual segue o padrão neon atual do app.
- Validação: typecheck + build + teste visual nas duas abas.
