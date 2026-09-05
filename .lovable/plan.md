# Perfil mais limpo e compacto (sem remover funções)

## Objetivo
Reduzir a poluição visual da página de perfil (`/u/<username>`), deixando tudo menor e mais organizado, mantendo todas as funções existentes: seguir, mensagem, compartilhar, capa, bio, coleções de Vibes, Vibes recentes, estatísticas, conquistas e as abas de posts/vídeos/republicados/curtidos/salvos.

## Mudanças visuais (só em `src/routes/_authenticated/u.$username.tsx`)

1. **Capa mais baixa**: de ~430px para ~300px no celular (~260px no desktop). Avatar menor (80px celular / 112px desktop) e nome menor (2xl/4xl), mantendo capa, botão de trocar capa e menu da conta.

2. **Estatísticas principais em linha única**: Seguidores, Seguindo, Vibes continuam clicáveis, mas com tamanho menor e alinhadas ao lado do nome, sem quebrar o layout.

3. **Bio mais discreta**: sai do cartão grande `social-card` e vira um bloco simples, sem moldura pesada; localização, site, pronome e interesses ficam em linha compacta (chips menores).

4. **Remover a faixa duplicada de números**: o cartão com Curtidas / Views / Posts / Reposts é redundante e ocupa espaço. Posts e Reposts já aparecem nas abas; Curtidas e Views entram como dois números pequenos e discretos junto às estatísticas em linha (ou em uma linha fina de texto, ex.: "1,2 mil curtidas · 34 mil visualizações").

5. **Conquistas vira item compacto**: em vez de cartão grande, um link de linha única (troféu pequeno + "Conquistas") abaixo da bio.

6. **Vibes recentes mais compactas**: cabeçalho menor (sem título duplo "Momentos / Vibes recentes" — só "Vibes"), círculos um pouco menores e botão "Nova Vibe" como botão de ícone `+`.

7. **Coleções de Vibes**: manter o componente, apenas garantir espaçamento consistente (sem margens extras ao redor).

8. **Abas**: manter tudo, mas com barra um pouco mais fina e ícones centralizados; grade de posts com espaçamento levemente menor no celular.

9. **Espaçamento geral**: reduzir `space-y-8` para `space-y-5` e os paddings internos, dando respiro sem empilhar blocos pesados.

## O que NÃO muda
- Nenhuma função removida: seguir/deixar de seguir, mensagem, compartilhar, troca de capa, edição de perfil, coleções, Vibes, conquistas, todas as abas e a grade.
- Nenhuma mudança de cores/tema, banco de dados ou rotas.

## Verificação
- `bunx tsgo --noEmit` sem erros.
- Checar `/tmp/observability/build-errors.log`.
- Screenshot autenticado do perfil no celular e desktop para confirmar o visual mais limpo.
