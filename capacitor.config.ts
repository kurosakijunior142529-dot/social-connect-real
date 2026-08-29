import type { CapacitorConfig } from '@capacitor/cli';

/**
 * O Vibely roda em TanStack Start com server functions (LiveKit, IA/tradução,
 * moderação, pagamentos). Por isso o app Android carrega a build publicada:
 * assim tudo funciona igual ao navegador e o WebView aproveita o cache do
 * service worker (assets em CacheFirst) — a interface aparece na hora nas
 * aberturas seguintes.
 *
 * `webDir` continua apontando para a pasta real gerada pelo build (dist/client)
 * porque o `npx cap sync` exige um diretório existente. Antes ele apontava para
 * `.output/public`, que este projeto NUNCA gera — era essa a causa da tela
 * branca: o WebView abria um diretório vazio.
 */
const config: CapacitorConfig = {
  appId: 'com.vibely.app',
  appName: 'Vibely',
  webDir: 'dist/client',
  server: {
    androidScheme: 'https',
    url: 'https://vibelyconect.lovable.app',
    cleartext: false,
  },
  android: {
    // Evita o "flash" branco do WebView antes da primeira pintura.
    backgroundColor: '#0B0B0F',
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    CapacitorHttp: {
      // Desligado: o app usa fetch/WebSocket direto (Supabase realtime, LiveKit).
      // Com o plugin ligado, as requisições passam pela ponte nativa e ficam
      // mais lentas no boot.
      enabled: false,
    },
    Keyboard: {
      resize: 'native',
    },
  },
};

export default config;
