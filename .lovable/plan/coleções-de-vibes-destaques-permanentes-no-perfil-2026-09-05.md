# Coleções de Vibes — destaques permanentes no perfil

Inspirado nos destaques do Instagram, mas com identidade própria: no Vibely eles viram **Coleções** — capas em formato de "gema" hexagonal com anel neon, contador de Vibes, cor escolhida pelo dono e um player em tela cheia com o nome da coleção no topo.

## O que o usuário vai poder fazer

- Criar uma Coleção a partir das suas Vibes (ativas ou já expiradas), dando nome, cor de destaque e capa.
- Ver as Coleções logo abaixo do nome no perfil, em uma faixa horizontal de capas hexagonais com brilho neon.
- Tocar em uma capa para abrir a Coleção em tela cheia, no mesmo visualizador das Vibes, com o nome da coleção e a numeração no topo.
- Editar: renomear, trocar cor/capa, adicionar ou remover Vibes, reordenar e apagar a Coleção.
- Qualquer visitante vê as Coleções do perfil; só o dono vê os botões de criar e editar.

## Diferenças em relação ao Instagram

- Capa hexagonal com anel animado na cor da coleção, em vez do círculo simples.
- Contador de Vibes e prévia empilhada das próximas mídias na capa.
- Coleção "Fixada": uma pode ser marcada como favorita e ganha destaque maior no início da faixa.
- Contagem de visualizações da coleção mostrada só para o dono.

## Detalhes técnicos

Banco (uma migração):
- `vibe_collections`: id, user_id, title, accent (cor), cover_path, cover_bucket, is_pinned, position, view_count, created_at, updated_at.
- `vibe_collection_items`: id, collection_id, story_id (referência opcional), bucket, media_path, media_type, caption, position, created_at. Guardar o caminho da mídia no item torna a coleção permanente mesmo depois de a Vibe original expirar ou ser apagada.
- GRANTs para `authenticated` (CRUD) e `anon` (SELECT, já que perfis são públicos), `service_role` completo; RLS: leitura pública, escrita apenas pelo dono (`auth.uid() = user_id`, e nos itens via `EXISTS` na coleção do dono).

Frontend:
- `src/components/profile/vibe-collections.tsx` — faixa de capas + estado vazio + botão "Nova coleção" (só dono).
- `src/components/profile/vibe-collection-editor.tsx` — sheet com nome, seletor de cor, seleção múltipla de Vibes (ativas e arquivadas do próprio usuário), definição de capa e ordenação.
- Reutilizar `StoryViewer` para exibir os itens da coleção, adaptando o cabeçalho para mostrar o título; sem mexer na lógica de Vibes existentes.
- Inserir a faixa em `src/routes/_authenticated/u.$username.tsx` entre a seção de bio e "Vibes recentes"; `SignedMediaThumb`/`useSignedUrl` para as capas do bucket `stories`.
- Tokens de cor existentes; sem alterar o restante do perfil.
