# Novo post premium do Vibely

Refinar somente a tela “Novo post”, preservando publicação, upload, legenda por IA, moderação, enquete, editor de foto, vídeo e links dos Studios.

## Direção escolhida
- Neon editorial escuro, verde Vibely usado como destaque controlado.
- Space Grotesk expressiva nos títulos e DM Sans na leitura.
- Compositor modular mobile, compacto e sem blocos gigantes.

## Implementação
1. Criar cabeçalho seguro para notch, retorno discreto e título sempre legível.
2. Transformar Foto/Vídeo, Texto e Enquete em controle segmentado com ícones e transições rápidas.
3. Compactar os acessos Estúdio de vídeo e Vibely Studio, mantendo seus destinos e hierarquia.
4. Reorganizar upload, prévia e editor existente para reduzir vazio e valorizar o conteúdo.
5. Refinar legenda, sugestões da Vibely AI, enquete e estados de publicação.
6. Garantir espaço correto acima da navegação inferior e durante uso do teclado.
7. Manter mídia única no compositor atual: múltiplas mídias não serão simuladas, pois este fluxo ainda não possui publicação múltipla implementada.
8. Validar Foto/Vídeo, Texto, Enquete e abertura dos dois Studios em celulares pequenos, médios e grandes.

## Detalhes técnicos
- Alterações concentradas na apresentação de `/create`, sem mudanças em VIR, banco, autenticação ou navegação geral.
- Reuso dos editores e funções atuais; apenas controles já funcionais serão exibidos.
- Tokens globais existentes continuarão sendo a fonte de cores e estados.
