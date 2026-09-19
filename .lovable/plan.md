# Câmera AR do Vibely (efeitos que acompanham o rosto)

## O que já existe hoje

- O Vibely é um app web/PWA empacotado para Android (Capacitor). Não há código nativo próprio hoje.
- A câmera é usada em três lugares: o Studio de criação (gravação de clipes), o criador de vídeo e as transmissões ao vivo (LiveKit).
- Gravação e envio de mídia já funcionam e não serão trocados.
- Os "filtros" atuais são só cor/brilho/contraste — não acompanham o rosto.

## Decisão de SDK

O Snap Camera Kit tem uma versão oficial para web que funciona no navegador e dentro do app Android, e entrega exatamente o que você pediu: rastreamento de rosto, olhos, boca, cabeça, mãos, segmentação, objetos 3D e partículas, em tempo real. É a opção escolhida.

Para funcionar de verdade com as Lentes, o Snap exige uma conta aprovada no portal de desenvolvedores e dois dados que só você pode fornecer:

1. um token de API do Camera Kit;
2. um ou mais IDs de grupo de Lentes (as Lentes são criadas/publicadas no Lens Studio).

Sem isso, a câmera nova funciona normalmente com o efeito "Normal" e mostra um aviso claro de que os efeitos ainda não foram configurados — nada quebra e nada é inventado. Assim que você tiver as credenciais, eu as guardo com segurança no servidor (nunca no código) e a galeria passa a carregar as Lentes reais.

## O que será construído

**Motor de efeitos (camada neutra)**
Uma camada única, chamada EffectEngine, com iniciar, carregar efeito, trocar efeito, tirar foto, gravar, parar e liberar. O resto do Vibely fala só com ela, então trocar de SDK no futuro não obriga a mexer nas telas.

**Câmera nova com efeitos**
- Câmera ocupando quase toda a tela, no visual atual do Vibely (escuro, verde só nos detalhes).
- Controles: voltar, flash, trocar câmera, efeitos, galeria e o botão de captura/gravação.
- Galeria horizontal na parte de baixo com miniaturas, abas de categoria (populares, novos, rosto, maquiagem, engraçados, máscaras, animais, 3D, ambiente, partículas, corpo, mãos, tendência) e o efeito "Normal" sempre em primeiro.
- Tocar numa miniatura troca o efeito na hora, sem reiniciar a câmera.
- Foto e vídeo saem com o efeito gravado na imagem, prontos para publicar pelo fluxo de envio que já existe.

**Ao vivo**
A imagem já processada pelo efeito é enviada como a fonte de vídeo da transmissão, substituindo a câmera crua. Se o aparelho não aguentar, o app volta sozinho para a câmera normal e avisa.

**Catálogo de efeitos**
O catálogo fica no banco do Vibely (o app usa Lovable Cloud, não Firestore; o Firebase aqui serve só para notificações). Cada efeito tem id, nome, miniatura, categoria, identificador da Lente, versão, ativo/inativo, ordem e contador de uso. Adicionar um efeito novo é adicionar uma linha — a interface não muda.

**Desempenho e estados**
Carregamento sob demanda, cache, descarte do efeito anterior, limite de quadros em aparelhos fracos, liberação correta da câmera ao sair. Estados visíveis: carregando, carregado, erro, SDK indisponível, permissão negada (com instruções de como liberar), efeito incompatível, gravando e ao vivo.

## Detalhes técnicos

- Dependência nova: `@snap/camera-kit` (web, WebGL/WASM). Token lido só no servidor e entregue por uma server function curta; nenhum segredo no bundle.
- `src/lib/ar/effect-engine.ts` — interface e tipos; `src/lib/ar/camera-kit-engine.ts` — implementação Snap; `src/lib/ar/passthrough-engine.ts` — fallback sem SDK (câmera crua, efeito Normal).
- `src/lib/ar/catalog.functions.ts` + migração `ar_effects` (com GRANTs e RLS: leitura pública dos ativos, escrita só admin).
- `src/components/ar/ar-camera.tsx` (tela), `ar-effect-tray.tsx` (galeria), `use-ar-engine.ts` (ciclo de vida).
- Saída: `session.output.live` → `canvas.captureStream()` → MediaRecorder (gravação, mesmos mimeTypes/bitrates de hoje) e → `LocalVideoTrack` para o LiveKit em `live.$id.tsx`.
- `studio-camera.tsx` passa a usar o EffectEngine mantendo tomadas múltiplas, contador, temporizador, 30/60 fps e a confirmação atual.
- Sem alterações no upload, moderação, publicação ou nas telas de feed/perfil.

## Fora de escopo

Criar Lentes novas no Lens Studio (isso é feito na conta Snap) e módulo nativo Android — só será necessário se a versão web não atingir o desempenho esperado no seu aparelho; nesse caso eu proponho separadamente.
