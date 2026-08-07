# Correções técnicas: GIFs, Estúdio de vídeo, Tradutor, Performance e WebView

Nenhuma cor, layout ou componente visual muda. Todo o trabalho é em lógica, rede, cache e tratamento de erro.

## 1. GIFs (Tenor)

Estado atual verificado no código: a busca de GIFs **já passa por um servidor** (`src/lib/gifs.functions.ts`, server function autenticada) — o navegador nunca chama a Tenor diretamente, então CORS não é a causa. O erro "GIFs indisponíveis no momento" é a mensagem genérica que aparece quando a Tenor responde erro; nas últimas verificações a resposta foi de API desativada/negada no lado do provedor.

O que será feito:

- Endpoint de proxy dedicado (`/api/public/...` não; rota interna autenticada) para servir busca **e** as próprias imagens de GIF por streaming pelo nosso domínio, eliminando qualquer bloqueio de origem/mixed-content em WebView Android.
- Classificar os erros da Tenor em códigos internos (`api_disabled`, `invalid_key`, `rate_limited`, `network`, `unknown`) e devolvê-los ao cliente.
- No seletor de GIFs: banner de diagnóstico dentro da área já existente (mesmo estilo/cores atuais) explicando exatamente o que ativar ("ativar Tenor API no projeto Google Cloud da chave"), o código do erro e um botão "Tentar de novo" com contagem de re-tentativa.
- Fallback: quando a Tenor falha, mostra os últimos GIFs em cache (sessionStorage) em vez de tela vazia.
- Loading interno já existe (skeleton) e é mantido; será adicionado timeout menor + cancelamento de requisições antigas.

Observação: se a chave continuar bloqueada no Google Cloud, o proxy não resolve sozinho — o banner passa a dizer exatamente isso.

## 2. Estúdio de vídeo

O botão hoje é um `Link` para `/create/video`. Será mantido igual visualmente, mas ganha um handler `openVideoStudio` que:

- Pede permissão de câmera + microfone antes de navegar (`getUserMedia` sob gesto do usuário — obrigatório em WebView Android).
- Trata `NotAllowedError`, `NotFoundError`, `NotReadableError`, `OverconstrainedError` e ausência de `mediaDevices` (contexto não-seguro), com toast já existente do app.
- Navega mesmo se a permissão for negada, mas a tela do estúdio mostra o motivo e um botão de repetir.
- Logs `[video-studio]` em cada etapa para debug.
- Na própria tela do estúdio: retry de `getUserMedia` com constraints progressivamente mais simples e liberação correta das tracks ao sair.

## 3. Tradutor automático no chat

- Detecção automática de idioma da mensagem (heurística local rápida + confirmação pelo modelo apenas quando ambíguo).
- Tradução automática das mensagens recebidas quando o idioma difere do idioma do aparelho, exibida **abaixo do texto original** usando o mesmo estilo de texto secundário já existente na bolha (nenhum componente novo visualmente distinto).
- Cache em duas camadas: memória + `localStorage` por (hash do texto + idioma alvo), evitando chamadas repetidas.
- Fila com lote: várias mensagens visíveis são traduzidas numa única chamada, e só as visíveis na tela (IntersectionObserver) são traduzidas.
- Estrutura de tradução extraída para um módulo reutilizável, já pronto para uso futuro nas chamadas de voz.

## 4. Performance

- Lazy loading e `decoding="async"` em todas as mídias de chat e feed; GIFs só animam quando visíveis.
- Cancelamento de requisições obsoletas e deduplicação de chamadas repetidas do React Query (staleTime coerente por tipo de dado).
- Code-splitting das telas pesadas (estúdio de vídeo, jogos, live) para reduzir o bundle inicial.
- Remoção de re-renderizações desnecessárias nas listas de mensagens.

## 5. Compatibilidade Android / WebView

- Verificação de contexto seguro (HTTPS) antes de pedir câmera/microfone, com mensagem clara.
- Permissões pedidas sempre dentro de um gesto do usuário.
- Manifesto PWA e metadados revisados para permitir captura de mídia em WebView.
- Toda mídia servida por HTTPS do próprio domínio (inclui o proxy de GIFs).

## 6. Robustez geral

- `try/catch` com log padronizado (`[modulo] mensagem`) em todos os fluxos de rede e mídia.
- Nenhum clique sem resposta: cada botão dá feedback (toast, estado de carregando ou log).

## Detalhes técnicos

- `src/lib/gifs.functions.ts`: classificação de erro + endpoint de proxy de imagem.
- `src/components/chat/gif-picker.tsx`: banner de diagnóstico, fallback de cache, retry.
- `src/routes/_authenticated/create.tsx` e `create_.video.tsx`: `openVideoStudio` + retry de constraints.
- Novo `src/lib/translate.ts` (cache/detecção/lote) consumido por `src/components/chat/message-body.tsx`.
- Ajustes pontuais de `React.lazy`, `IntersectionObserver` e opções do React Query.
