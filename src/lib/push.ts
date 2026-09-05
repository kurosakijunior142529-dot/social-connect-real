import { supabase } from "@/integrations/supabase/client";

/**
 * Notificações fora do app (mensagens, chamadas, curtidas, lives, presentes…).
 * - No app Android (Capacitor) usa o push nativo.
 * - No navegador usa Firebase Cloud Messaging + service worker próprio.
 */

const appId = import.meta.env["VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_APP_ID"] as string | undefined;
const vapidKey = import.meta.env["VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_VAPID_KEY"] as string | undefined;

const firebaseConfig = {
  apiKey: import.meta.env["VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_WEB_API_KEY"] as string | undefined,
  projectId: import.meta.env["VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_PROJECT_ID"] as string | undefined,
  appId,
  messagingSenderId: appId?.split(":")[1] ?? "",
};

export type PushResult =
  | { status: "registered" }
  | { status: "not-configured" | "unsupported" | "open-in-new-tab" | "denied" | "error" };

export function isNativeApp() {
  if (typeof window === "undefined") return false;
  const cap = (window as any).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function pushSupported() {
  if (typeof window === "undefined") return false;
  return isNativeApp() || ("Notification" in window && "serviceWorker" in navigator);
}

export function pushPermission(): NotificationPermission | "unknown" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unknown";
  return Notification.permission;
}

async function saveToken(token: string, platform: "web" | "android" | "ios") {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return;
  await (supabase as any).from("push_tokens").upsert(
    {
      user_id: userId,
      token,
      platform,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "token" },
  );
}

async function enableNative(): Promise<PushResult> {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return { status: "denied" };

    await new Promise<void>((resolve, reject) => {
      let done = false;
      PushNotifications.addListener("registration", async (t) => {
        if (done) return;
        done = true;
        await saveToken(t.value, "android");
        resolve();
      });
      PushNotifications.addListener("registrationError", (e) => {
        if (done) return;
        done = true;
        reject(new Error(String(e?.error ?? "registration error")));
      });
      PushNotifications.register();
      setTimeout(() => {
        if (!done) {
          done = true;
          reject(new Error("timeout"));
        }
      }, 15000);
    });

    PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
      const path = (event.notification.data as any)?.path;
      if (typeof path === "string" && path.startsWith("/")) window.location.assign(path);
    });

    return { status: "registered" };
  } catch {
    return { status: "error" };
  }
}

/** Precisa ser chamado a partir de um clique do usuário. */
export async function enablePush(): Promise<PushResult> {
  if (isNativeApp()) return enableNative();

  if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !appId || !vapidKey || !firebaseConfig.messagingSenderId) {
    return { status: "not-configured" };
  }
  if (typeof window === "undefined" || !("Notification" in window)) return { status: "unsupported" };

  try {
    const { isSupported, getMessaging, getToken } = await import("firebase/messaging");
    if (!(await isSupported())) return { status: "unsupported" };
    if (window.top !== window.self) return { status: "open-in-new-tab" };

    const permission =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") return { status: "denied" };

    const { initializeApp, getApps } = await import("firebase/app");
    const app = getApps()[0] ?? initializeApp(firebaseConfig as Record<string, string>);

    const query = new URLSearchParams(firebaseConfig as Record<string, string>).toString();
    const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${query}`);
    const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration });
    if (!token) return { status: "denied" };
    await saveToken(token, "web");
    return { status: "registered" };
  } catch {
    return { status: "error" };
  }
}

export const PUSH_MESSAGES: Record<PushResult["status"], string> = {
  registered: "Notificações ativadas neste aparelho.",
  denied: "Você bloqueou as notificações. Libere nas configurações do navegador ou do celular.",
  unsupported: "Este aparelho ou navegador não aceita notificações.",
  "open-in-new-tab": "Abra o Vibely em uma aba própria (ou no app) para ativar as notificações.",
  "not-configured": "O serviço de notificações ainda não está configurado.",
  error: "Não deu para ativar agora. Tente novamente.",
};
