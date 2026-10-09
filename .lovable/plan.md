# Corrigir o erro "infinite recursion" ao criar e abrir lives

## O que está acontecendo
As regras de acesso das lives entram em loop. Para ver uma live, o banco checa se você é moderador dela. Para ver os moderadores, ele checa se você é dono da live. Uma regra chama a outra e as duas travam. Por isso a live não é criada e nem abre.

## O que vou fazer
1. Criar duas checagens seguras e independentes: "sou o dono desta live?" e "sou moderador desta live?". Elas leem os dados direto, sem passar pelas regras, então o loop acaba.
2. Reescrever as regras que se cruzam para usar essas checagens:
   - quem pode ver a live
   - quem pode ver, adicionar e remover moderadores
   - quem pode ver, banir e desbanir pessoas
   - quem pode ver quem está assistindo
3. O que cada pessoa pode fazer continua igual. Só o jeito de checar muda.
4. Trocar a mensagem técnica em inglês por um aviso em português, caso algum erro aconteça ao criar a live.
5. Testar criando uma live e abrindo-a.

## Detalhes técnicos
- Nova migração com `public.is_live_host(_live_id uuid)` e `public.is_live_moderator(_live_id uuid)`, as duas `SECURITY DEFINER STABLE` com `search_path = public`, e `GRANT EXECUTE` para `authenticated`.
- Remover e recriar estas regras: "Lives visible", "Mods visible to host and self", "Host add mods", "Host remove mods", "Bans visible", "Host/mods insert bans", "Host/mods remove bans", "Viewers visible". As subconsultas `EXISTS` que se cruzam entre `lives` e `live_moderators` passam a usar as funções novas.
- Em `lives.new.tsx`, o toast de erro fica com um texto genérico em português no lugar de `err.message`, mas os bloqueios de moderação continuam mostrando o motivo.
