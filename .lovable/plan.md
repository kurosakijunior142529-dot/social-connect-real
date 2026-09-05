# Vibely Studio — novo editor de fotos e vídeos

Vou substituir o editor atual (corte de imagem + trim de vídeo com filtros) por um estúdio de criação completo dentro do app, sem tocar em feed, chat, perfil, Streaming Amigo, login ou usuários.

## O que existe hoje

- Editor de imagem com cortar, zoom, filtros e ajustes.
- Vídeo: gravação pela câmera, corte simples, lista de 10 filtros, música do catálogo, marca d'água e exportação no próprio aparelho.
- A exportação já roda no dispositivo (canvas + gravador), então dá para evoluí-la para uma linha do tempo com camadas.

Tudo isso é preservado e passa a ser parte do novo estúdio.

## Como o novo editor funciona

Tela única em tela cheia: topo com voltar / "Estúdio" / confirmar, centro com a pré-visualização, e embaixo uma linha do tempo com trilhas. Abaixo, uma barra de ferramentas em carrossel que abre painéis por baixo: Editar, Áudio, Efeitos, Filtros, Ajustar, Texto, Stickers, Transições, Velocidade, Aparência, IA, Camadas. Nada aparece tudo de uma vez.

## Entrega em fases (cada fase é utilizável sozinha)

**Fase 1 — Base do estúdio**
Linha do tempo real com múltiplos clipes e trilhas (vídeo, áudio, texto, sticker, imagem, efeito, overlay); cortar, dividir, duplicar, apagar, reordenar, mover, copiar/colar; seleção de qualquer elemento; camadas com ocultar/bloquear; formatos 9:16, 16:9, 1:1, 4:5, 4:3, 3:4 com presets Vibely/TikTok/Instagram/Story/YouTube; rascunhos salvos (continuar, duplicar, excluir); exportação 720p/1080p/1440p (4K só quando o aparelho aguenta), 24/30/60 fps, com progresso real e publicação pelo fluxo de post já existente.

**Fase 2 — Visual**
Biblioteca grande de filtros por categoria com intensidade; ajustes completos (brilho, contraste, exposição, saturação, temperatura, matiz, realces, sombras, nitidez, clareza, fade, vinheta, granulação) e curvas de cor; efeitos por categoria (glitch, câmera, luz, blur, cor, distorção, atmosfera) com parâmetros; overlays com mistura, opacidade, posição e duração; transições com duração ajustável; máscaras círculo/retângulo/gradiente/forma livre.

**Fase 3 — Movimento e ritmo**
Velocidade por presets de 0,25x a 4x e speed ramp com pontos e curva suave; keyframes reais para posição, escala, rotação, opacidade, zoom, blur e intensidade de efeito, com interpolação; texto avançado com fontes, contorno, sombra, fundo, alinhamento, espaçamento e animações (fade, zoom, slide, bounce, máquina de escrever, glitch, pop, shake); stickers com posição, escala, rotação, opacidade, animação e duração.

**Fase 4 — Música e beat sync**
Trilhas múltiplas (música, áudio original, narração, efeitos sonoros) com volume, mudo, fade in/out, corte e posição; catálogo de áudio por gênero com busca, favoritos, recentes e em alta — só com áudio que o app tem direito de usar (o catálogo atual entra como base); forma de onda e detecção de batidas no próprio aparelho; efeitos de beat (flash, zoom, shake, blur, RGB, glitch, corte, transição, rotação) aplicáveis em massa nos marcadores.

**Fase 5 — IA e aparência**
Suavização de pele, iluminação facial, filtros de beleza e deformação rodando localmente sobre os frames; remover/trocar/desfocar fundo, remover objeto, melhorar foto, colorização, retoque, estilo cinematográfico/anime/artístico via processamento no servidor com a IA já usada no app. Em vídeo, o processamento pesado roda por frame amostrado quando viável; se um serviço não estiver disponível, a ferramenta aparece desativada com o motivo — nada de botão que finge funcionar.

**Fase 6 — Automático**
Auto Edit (escolhe mídias + música e o sistema monta cortes, zoom, transições, efeitos e beat sync) e AI Edit por texto ("faça um edit agressivo com essa música"), gerando uma estrutura de edição que continua 100% editável à mão. Presets salvos pelo usuário juntando filtros, efeitos, transições, velocidade, keyframes, textos e overlays.

## Detalhes técnicos

- Novo módulo `src/lib/studio/` (modelo do projeto, timeline, keyframes, speed ramp, render graph, detecção de batida) e `src/components/studio/` (preview, timeline, painéis).
- Rota nova `create_.studio.tsx`; `create.tsx`, `create_.video.tsx` e `stories.new.tsx` passam a abrir o estúdio, mantendo os fluxos atuais como caminho rápido.
- Render por WebGL/canvas com cadeia de shaders para filtros/efeitos/overlays; exportação reaproveita e amplia `video-export.ts` (marca d'água e compressão preservadas), com fallback para canvas 2D em aparelhos fracos.
- Áudio via Web Audio (mixagem de trilhas, fades, análise de energia para beats).
- Projetos salvos localmente por padrão, com tabela no backend para rascunhos sincronizados (com RLS por usuário) na Fase 1.
- IA/aparência pesada em server functions autenticadas usando o gateway de IA já configurado; nenhuma chave exposta.
- Performance: carregamento sob demanda de cada painel, miniaturas/proxy de baixa resolução na timeline, render em worker/offscreen quando disponível, e pré-visualização em resolução reduzida.

## Fora de escopo

Feed, chat, perfil, Streaming Amigo, login e sistema de usuários ficam intocados; a publicação usa o sistema de posts existente.
