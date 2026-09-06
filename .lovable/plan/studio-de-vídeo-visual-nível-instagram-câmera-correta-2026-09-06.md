# Studio de vídeo: visual nível Instagram + câmera correta

Foco só no Studio de criação. Feed, chat, perfil, Streaming Amigo, login e usuários não são tocados.

## Problemas a resolver

1. A imagem do vídeo aparece esticada/cortada dentro da área de prévia.
2. A gravação pela câmera sai com qualidade baixa.
3. A prévia ocupa espaço demais e sobra pouco para a linha do tempo e as ferramentas.
4. O visual e o jeito de usar estão básicos demais.

## O que muda

**Prévia sempre correta**
A área de prévia passa a respeitar exatamente o formato escolhido (9:16, 1:1, 4:5, 16:9...), com fundo neutro e a imagem inteira visível — nunca esticada nem cortada. Ela se ajusta sozinha ao tamanho da tela, ficando compacta no celular para dar espaço à linha do tempo, com um botão para expandir em tela cheia quando quiser só assistir.

**Câmera com qualidade real**
A gravação passa a pedir a maior qualidade que o aparelho aceita (até 1080p, 30/60 quadros, câmera frontal ou traseira), grava no melhor formato disponível e mostra o enquadramento certo do formato escolhido antes de gravar, com contador, temporizador e opção de continuar gravando em vários trechos.

**Visual novo (nível Instagram)**
- Topo em vidro escuro com nome do projeto, desfazer/refazer, salvar e um botão de exportar em destaque.
- Prévia sobre fundo escuro com cantos arredondados, sombra suave e controles flutuantes (play, tempo, tela cheia).
- Linha do tempo redesenhada: miniaturas dos clipes, faixas coloridas por tipo (vídeo, áudio, texto, sticker), marcadores de batida discretos, agulha de tempo animada e zoom por pinça.
- Barra de ferramentas com ícones (não só texto), painel deslizante por baixo que abre e fecha com animação e pode ser arrastado para cima/baixo.
- Botões, cartões e controles deslizantes padronizados com o visual neon do Vibely.

**Uso mais fácil**
- Arrastar clipes na linha do tempo para reordenar e arrastar as bordas para cortar.
- Tocar em um elemento na prévia para selecioná-lo; arrastar para mover texto e stickers.
- Toque duplo para dividir, pressionar e segurar para duplicar/apagar.
- Barra de ações rápidas do item selecionado (cortar, dividir, duplicar, apagar, camada).

## Detalhes técnicos

- `studio-preview.tsx`: canvas passa a usar `aspect-ratio` do projeto com contêiner responsivo (`object-contain` real), altura calculada por `dvh` e modo expandido; camada de hit-test para seleção/arrasto de texto e sticker sobre o canvas.
- Novo `src/components/studio/studio-camera.tsx`: `getUserMedia` com `ideal 1920x1080`, `frameRate 30/60`, `facingMode` alternável, escolha do melhor `mimeType` do `MediaRecorder` (`video/mp4;codecs=avc1` → `video/webm;codecs=vp9`) e `videoBitsPerSecond` alto; grava múltiplas tomadas direto para clipes do projeto via `importFile`.
- `studio-timeline.tsx` reescrito: miniaturas geradas por `video-thumbnail`, faixas por tipo, drag/resize com ponteiros, zoom controlado por estado, playhead animado.
- `panels.tsx`: painéis passam a viver numa folha deslizante com cabeçalho e alça de arrasto; barra de ferramentas com ícones `lucide-react`.
- `create_.studio.tsx`: novo layout em grade (topo / prévia flexível / linha do tempo / painel), com alturas responsivas.
- Novos utilitários visuais reaproveitando os tokens já existentes em `src/styles.css` (nada de cor fixa em componente).

## Fora de escopo

Nenhuma função atual do Studio é removida: filtros, ajustes, efeitos, máscaras, keyframes, texto, stickers, overlays, transições, música/beat sync, Auto Edit, IA, presets, projetos, exportação e publicação continuam iguais — só ganham visual e controles melhores.
