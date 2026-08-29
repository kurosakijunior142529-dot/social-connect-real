import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vibely.app',
  appName: 'Vibely',
  webDir: '.output/public',
  server: {
    androidScheme: 'https',
    cleartext: true,
    errorHandler: (error) => {
      console.error('Capacitor error:', error);
    },
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    Keyboard: {
      resize: 'native',
    },
  },
};

export default config;
