/**
 * PWA Service Worker registration wrapper.
 * Follows the Lovable PWA skill rules:
 * - Never register in dev or Lovable preview
 * - Unregister stale SWs in dev/preview
 * - Support ?sw=off to disable
 */

const SW_PATH = "/sw.js";

function shouldRegister(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;

  // Only in production
  if (!import.meta.env.PROD) return false;

  // Never in iframe
  if (window.self !== window.top) return false;

  // Never in Lovable preview / dev hosts
  const host = window.location.hostname;
  if (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  ) {
    return false;
  }

  // Kill switch
  if (window.location.search.includes("sw=off")) return false;

  return true;
}

async function unregisterMatching(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((r) => r.scope.endsWith(SW_PATH) || r.scope.endsWith("/"))
        .map((r) => r.unregister())
    );
  } catch {
    // ignore
  }
}

export async function registerPWA(): Promise<void> {
  if (shouldRegister()) {
    try {
      const { registerSW } = await import("virtual:pwa-register");
      registerSW({
        immediate: true,
        onNeedRefresh() {
          // Auto-update without prompting
          window.location.reload();
        },
        onOfflineReady() {
          // silently ready
        },
      });
    } catch {
      // virtual:pwa-register may not resolve in some builds; ignore
    }
  } else {
    await unregisterMatching();
  }
}
