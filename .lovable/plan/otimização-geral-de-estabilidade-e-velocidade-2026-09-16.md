# Otimização geral de estabilidade e velocidade

## Objetivo
Reduzir travamentos, fechamentos inesperados e demora ao abrir/navegar, preservando todas as funções e o visual atual.

## Implementação
1. **Eliminar causas de crash e renderizações em loop**
   - Corrigir atualizações de estado disparadas durante renderização.
   - Remover conflitos de estilos que provocam trabalho repetido do React.
   - Garantir limpeza de eventos, temporizadores, canais em tempo real e mídia.

2. **Aliviar o carregamento global**
   - Evitar iniciar recursos pesados de chamadas, voz, notificações e push antes de serem necessários.
   - Reduzir consultas duplicadas de sessão, perfil, permissões e notificações.
   - Ajustar cache e reconexão para impedir rajadas de requisições ao voltar ao app.

3. **Otimizar imagens e vídeos**
   - Carregar somente mídia visível ou próxima da tela.
   - Pausar e liberar vídeos fora da tela; limitar pré-carregamento e uso simultâneo de decodificadores.
   - Liberar URLs temporárias e outros recursos grandes quando não forem mais usados.

4. **Otimizar telas longas**
   - Reduzir re-renderizações e consultas por item no feed, Reels e listas.
   - Manter paginação progressiva e cache sem alterar VIR nem regras de produto.

5. **Validar antes de concluir**
   - Conferir abertura, troca de telas, retorno do segundo plano e rolagem em celular.
   - Verificar erros do navegador, requisições repetidas, consumo de memória e estado de compilação.

## Limites
- Nenhuma função será removida.
- Nenhuma mudança visual ampla será feita.
- VIR, regras de recomendação, pagamentos e dados de usuários não serão alterados.
