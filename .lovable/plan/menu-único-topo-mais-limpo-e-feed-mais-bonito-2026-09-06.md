# Menu único, topo mais limpo e feed mais bonito

## O que muda

### 1. Um só menu de "três barrinhas"
- Remover o botão de menu que fica no canto da capa do perfil (ele levava para a conta).
- O acesso a Conta/Configurações continua garantido pelo menu "Mais" da barra de baixo.

### 2. Menu "Mais" completo
Além do que já tem (Por perto, Streaming Amigo, Vibely AI, Lives, Notificações, Salvos, Jogos, Voz, Marketplace, Carteira, Pro, Conta, Admin), acrescentar:
- Meu perfil
- Explorar
- Criar publicação
- Vibely Studio (editor de fotos e vídeos)
- Nova Vibe
- Conquistas
- Música
- Conversas
- Configurações
- Tema claro/escuro dentro da própria lista

Organizado em grupos com títulos curtos (Descobrir, Criar, Diversão, Conta) para não virar uma lista gigante.

### 3. Topo do feed mais limpo
Na barra onde está escrito "vibely", manter apenas:
- alternar claro/escuro
- Lives
- Notificações

Sair: o atalho da TV (Streaming) e o de Jogos — os dois continuam no menu "Mais".

### 4. Bolhas "Online agora" mais bonitas
- Anel gradiente animado em volta de cada foto, ponto verde com brilho pulsante.
- Primeira bolha "Convidar" quando houver poucos amigos online.
- Rolagem mais suave, nomes menores e melhor espaçamento.
- Cabeçalho da faixa com contagem de pessoas online.

### 5. Cartões de publicação mais legais
- Cartão com cantos mais arredondados, borda fina luminosa e leve elevação.
- Cabeçalho mais claro: avatar com anel, nome, verificado, horário discreto.
- Mídia com cantos arredondados e sombra interna suave.
- Barra de ações redesenhada: ícones maiores, contadores com números alinhados, animação ao curtir.
- Legenda com melhor leitura e o botão "Traduzir" mais discreto.
- Posts de texto mantêm o visual atual em vidro escuro, ajustado ao novo cartão.

## Detalhes técnicos
- `src/routes/_authenticated/u.$username.tsx`: remover o `Link` para `/account` com ícone `Menu` na capa (e o import se ficar sem uso).
- `src/components/mobile-more-sheet.tsx`: agrupar entradas por seção, adicionar novas rotas (`/u/$username`, `/explore`, `/create`, `/create/studio`, `/stories/new`, `/achievements/$username`, `/music`, `/messages`, `/settings`) e embutir o `ThemeToggle`; novas chaves em `src/lib/i18n/locales/pt.json` e `en.json`.
- `src/routes/_authenticated/index.tsx`: remover os `HeaderAction` de `/watch` e `/games` e ajustar o tipo da prop `to`.
- `src/components/presence/online-bubbles.tsx` e `src/components/post-card.tsx`: apenas apresentação, usando tokens já existentes em `src/styles.css` (nada de cor fixa).
- Nenhuma função, rota, tabela ou consulta é removida.
