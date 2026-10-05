// Desbloqueio do Cofre por digital/rosto usando o sensor do próprio aparelho.
// Fica salvo só neste aparelho; o PIN continua sendo a chave principal.
const key = (userId: string) => `vibely-vault-bio:${userId}`;

const toB64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function biometricAvailable(): Promise<boolean> {
  try {
    if (typeof window === "undefined" || !window.PublicKeyCredential || !window.isSecureContext) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function biometricEnabled(userId: string) {
  try { return !!localStorage.getItem(key(userId)); } catch { return false; }
}

export function disableBiometric(userId: string) {
  try { localStorage.removeItem(key(userId)); } catch { /* noop */ }
}

export async function enableBiometric(userId: string): Promise<boolean> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "Vibely", id: location.hostname },
      user: { id: new TextEncoder().encode(userId.slice(0, 64)), name: "cofre", displayName: "Cofre Vibely" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) return false;
  localStorage.setItem(key(userId), toB64(cred.rawId));
  return true;
}

export async function unlockWithBiometric(userId: string): Promise<boolean> {
  const id = localStorage.getItem(key(userId));
  if (!id) return false;
  try {
    const res = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: location.hostname,
        allowCredentials: [{ type: "public-key", id: fromB64(id) }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return !!res;
  } catch {
    return false;
  }
}
