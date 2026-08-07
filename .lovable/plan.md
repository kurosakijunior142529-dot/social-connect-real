# Corrigir tradução e seletor de idioma na chamada

## Objetivo
Fazer a tradução produzir legendas reais e permitir a troca entre os idiomas já disponíveis, sem alterar o design da tela nem abrir uma segunda captura do microfone.

## Implementação

1. **Destravar o seletor de idioma**
   - Manter o seletor e a lista atual de 10 idiomas.
   - Renderizar o menu acima da sobreposição da chamada; hoje o portal do menu usa `z-index: 50`, abaixo da tela de chamada (`z-index: 100`).
   - Garantir que a seleção atualize imediatamente o idioma exibido e seja usada pelas próximas traduções.

2. **Só ativar após o áudio estar realmente pronto**
   - Tornar a inicialização da transcrição assíncrona e confirmar que o `AudioContext` do WebView está em execução antes de mostrar “Traduzindo”.
   - Continuar usando exclusivamente a faixa de áudio já criada para a chamada, sem novo `getUserMedia`.
   - Se o contexto não puder iniciar, manter a tradução desligada e informar o erro, em vez de ficar indefinidamente em “Ouvindo a conversa...”.

3. **Corrigir a produção dos trechos de voz**
   - Ajustar a detecção de voz/janelamento para que fala normal em microfones mobile gere WAVs completos mesmo com volume baixo ou pausas curtas.
   - Manter apenas uma transcrição em andamento, descartar filas atrasadas e encerrar todos os recursos ao desligar, reconectar ou finalizar a chamada.
   - Adicionar retorno de estado do capturador para distinguir “iniciando”, “ouvindo”, “transcrevendo” e falha, evitando estado ativo sem processamento.

4. **Robustez da transcrição e tradução**
   - Separar os auxiliares de runtime da declaração da server function para manter o módulo compatível com o empacotamento do TanStack Start.
   - Preservar os erros específicos de créditos, indisponibilidade e limite de uso; exibir uma mensagem amigável e desligar a sessão quando a falha impedir novas legendas.
   - Aplicar o idioma selecionado às novas legendas e retraduzir as legendas recentes após cada troca.

5. **Validação**
   - Verificar no viewport mobile que o dropdown aparece acima da chamada e aceita todos os idiomas.
   - Validar que uma chamada conectada gera trecho, transcrição, tradução e legenda; que chamadas desconectadas não iniciam o pipeline; e que desligar/reconectar não deixa listeners ou contextos ativos.

## Arquivos previstos
- `src/components/call-screen.tsx`
- `src/components/call-provider.tsx`
- `src/lib/call-stt-fallback.ts`
- `src/lib/call-transcribe.functions.ts`
- Um helper server-only para os detalhes da transcrição, se necessário