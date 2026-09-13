# Refinamento profissional do perfil Vibely

## Objetivo
Elevar a tela de perfil existente sem redesenhar a identidade, remover funções ou alterar lógica, dados e outras áreas do aplicativo.

## Alterações visuais
- Reorganizar o cabeçalho sobre o banner para manter avatar, nome, selos, usuário, estatísticas e ações legíveis em celulares pequenos e grandes.
- Preservar a arte do banner, melhorando enquadramento, contraste progressivo, bordas e transição para o conteúdo.
- Separar bio, localização, link, hashtags e métricas em blocos visuais claros, sem comprimir informações.
- Dar maior destaque às conquistas existentes com progresso, estados bloqueados/desbloqueados e animações leves já suportadas.
- Manter os hexágonos das Coleções de Vibes, refinando dimensões, profundidade, seleção, contadores e rolagem horizontal.
- Transformar o estado vazio de Minhas Realidades em um convite visual para criar a primeira Realidade; melhorar os cartões quando houver conteúdo.
- Refinar abas e grade do perfil com estados ativos mais claros, transições rápidas e skeletons proporcionais às miniaturas reais.
- Ajustar a barra inferior somente quando o perfil estiver aberto, preservando destinos e destaque do botão Criar.

## Responsividade e desempenho
- Usar composições que não cortem nomes, selos, botões ou estatísticas em larguras estreitas.
- Manter imagens com carregamento progressivo, dimensões estáveis e sem deformação.
- Usar animações curtas, baseadas em transformação e opacidade, respeitando redução de movimento.
- Garantir espaço inferior para que o conteúdo não fique atrás da navegação.

## Detalhes técnicos
- Reutilizar `UserAvatar`, `VerifiedBadge`, `Button`, `VibeCollections`, `ProfileRealities`, `AchievementsCard`, abas e mídia assinada existentes.
- Concentrar mudanças na tela de perfil e em seus componentes diretos; nenhuma alteração em Reels, VIR, Lives, mensagens, IA, autenticação ou banco.
- Manter a regra visual 80/15/5 e os tokens atuais de verde, preto, branco e superfícies.
- Validar que o envio de presentes em lives já permanece exclusivamente no fluxo seguro com débito atômico, sem alterar a experiência.

## Verificação
- Conferir carregamento, perfil próprio e de terceiros, ações, coleções, Realidades, conquistas, abas e grade.
- Testar visualmente em 320×568, 384×633, 430×932 e desktop, verificando cortes, sobreposições e conteúdo coberto.
- Confirmar compilação, erros de execução e resposta da tela antes da entrega.
