// Camadas de integração oficial para serviços com DRM.
// Nenhuma destas camadas captura tela, baixa conteúdo, remove DRM ou
// retransmite vídeo. Elas apenas informam se existe uma integração
// oficial/licenciada disponível neste dispositivo.

import type { StreamingProvider, StreamingProviderAdapter } from "./types";
import { PROVIDER_LABEL } from "./types";

export interface LicensedIntegration {
  provider: StreamingProvider;
  /** Retorna true somente quando existir SDK oficial licenciado disponível. */
  isAvailable(): Promise<boolean>;
  /** Ponto de entrada para o SDK oficial, quando existir. */
  mount(container: HTMLElement, contentId: string | null): Promise<void>;
  unmount(): Promise<void>;
}

function createIntegration(provider: StreamingProvider): LicensedIntegration {
  return {
    provider,
    async isAvailable() {
      // Nenhum SDK oficial licenciado está registrado no app.
      return false;
    },
    async mount() {
      throw new Error(`${PROVIDER_LABEL[provider]}: integração oficial indisponível.`);
    },
    async unmount() {
      /* nada a desmontar enquanto não houver SDK oficial */
    },
  };
}

export const PrimeVideoIntegration = createIntegration("prime");
export const NetflixIntegration = createIntegration("netflix");
export const DisneyPlusIntegration = createIntegration("disney");

/** Adapter genérico para serviços que dependem de integração licenciada. */
export function createLicensedAdapter(
  integration: LicensedIntegration,
  container: HTMLElement | null,
  contentId: string | null,
): StreamingProviderAdapter {
  let available = false;
  const label = PROVIDER_LABEL[integration.provider];

  return {
    provider: integration.provider,
    get playable() {
      return available;
    },
    unavailableMessage: `${label}\nA integração de reprodução ainda não está disponível neste dispositivo.`,
    async initialize() {
      available = await integration.isAvailable();
      if (available && container) {
        await integration.mount(container, contentId);
      }
    },
    async play() {
      /* sem integração oficial não há reprodução */
    },
    async pause() {},
    async seek() {},
    async getCurrentTime() {
      return 0;
    },
    async getDuration() {
      return 0;
    },
    isPlaying() {
      return false;
    },
    async destroy() {
      await integration.unmount();
      available = false;
    },
  };
}

export const PrimeVideoAdapter = (c: HTMLElement | null, id: string | null) =>
  createLicensedAdapter(PrimeVideoIntegration, c, id);
export const NetflixAdapter = (c: HTMLElement | null, id: string | null) =>
  createLicensedAdapter(NetflixIntegration, c, id);
export const DisneyPlusAdapter = (c: HTMLElement | null, id: string | null) =>
  createLicensedAdapter(DisneyPlusIntegration, c, id);
