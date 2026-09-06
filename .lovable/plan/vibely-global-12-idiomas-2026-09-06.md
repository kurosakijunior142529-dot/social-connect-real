# Vibely global: 12 idiomas

Objetivo: lançar o app fora do Brasil sem separar por região. Um app só, um feed só, e cada pessoa vê a interface no idioma dela — com botão "Traduzir" no conteúdo dos outros.

Idiomas: português, inglês, espanhol, francês, alemão, italiano, árabe, hindi, japonês, coreano, chinês (simplificado) e russo.

## Como vai funcionar para o usuário

- Na primeira abertura, o app já entra no idioma do celular. Se o idioma não estiver na lista, entra em inglês.
- Em Ajustes tem um seletor de idioma; a escolha fica salva na conta e acompanha a pessoa em qualquer aparelho.
- Em árabe a tela inteira espelha (texto e navegação da direita para a esquerda), como é o padrão desses idiomas.
- Datas, horas ("há 3 min"), números e valores aparecem no formato de cada país automaticamente.
- Posts, comentários, legendas de Vibes e mensagens ganham um "Traduzir" discreto embaixo do texto quando estão em outro idioma. Ao tocar, o texto vira o idioma da pessoa e aparece "Ver original". A tradução fica guardada, então a segunda pessoa que traduzir a mesma frase recebe na hora e sem custo.
- Nada de feed separado por país: todo mundo vê tudo, e o "Traduzir" derruba a barreira.

## Ordem de trabalho

1. Base de idiomas: sistema de textos, detecção automática, seletor em Ajustes, salvamento na conta, suporte da direita para a esquerda e formatação de datas/números.
2. Tradução das telas principais: feed, Vibes, conversas, perfil, criação/Studio, notificações, login e Ajustes.
3. Botão "Traduzir" no conteúdo: posts, comentários, legendas de Vibes e mensagens, reaproveitando a tradução que o app já tem.
4. Telas restantes: Streaming Amigo, lives, jogos, marketplace, conquistas, monetização, IA, "Por perto", admin (admin fica só em português/inglês).
5. Acabamento global: e-mails e notificações no idioma da pessoa, textos de compartilhamento e prévia de link no idioma certo, revisão de telas onde o texto traduzido fica maior e quebra o layout.

## Detalhes técnicos

- Camada i18n própria e leve em `src/lib/i18n/`: dicionários JSON por idioma (`pt`, `en`, `es`, `fr`, `de`, `it`, `ar`, `hi`, `ja`, `ko`, `zh`, `ru`), provider no `__root.tsx`, hook `useT()` com chaves tipadas e interpolação/plural via `Intl.PluralRules`. Sem nova dependência de runtime pesada; carregamento do dicionário por idioma sob demanda, com `pt`/`en` no bundle inicial.
- Idioma resolvido nesta ordem: `profiles.language` (já existe) → preferência salva localmente → `navigator.languages` → `en`. Persistência via atualização do perfil; `lang` e `dir` aplicados no `<html>` pelo root.
- RTL: `dir="rtl"` no root + revisão das classes direcionais (trocar `ml/mr/left/right` fixos por `ms/me/start/end` nos componentes tocados).
- Extração dos textos atuais: script único de migração que varre `src/routes` e `src/components`, gera as chaves em `pt.json` e substitui as strings pelas chaves; os demais 11 idiomas são gerados por lote pelo gateway Gemini já existente (`ai-gateway.server.ts`) e revisados manualmente nas telas críticas. Os JSONs ficam versionados no repositório — nada de tradução de interface em tempo de execução.
- Botão "Traduzir" reaproveita `translateText`/`translateBatch` em `src/lib/ai.functions.ts` e a tabela `translation_cache`; detecção do idioma de origem no cliente para só mostrar o botão quando o idioma for diferente do da pessoa. Nenhum texto é traduzido sem toque do usuário, o que mantém o custo baixo.
- Formatação por `Intl.DateTimeFormat`/`NumberFormat`/`RelativeTimeFormat`, substituindo os formatadores fixos em português.
- SEO: `head()` das rotas públicas (incluindo `/s/$id`) passa a emitir título/descrição no idioma detectado e `hreflang` para os 12 idiomas.
- Migração de banco: apenas garantir default e índice em `profiles.language`; nenhuma tabela nova, nenhuma coluna removida.
- Preservado sem alteração de comportamento: feed, chat, perfil, Studio, Streaming Amigo, login e contas existentes (quem já usa continua em português).
