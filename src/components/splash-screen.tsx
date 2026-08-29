import { useEffect, useState } from "react";

/**
 * Splash de abertura do app: logo completa do Vibely (símbolo + palavra)
 * centralizada sobre fundo preto. Só renderiza no cliente (evita divergência
 * de hidratação) e some suavemente após a primeira renderização.
 */
export function SplashScreen() {
  const [phase, setPhase] = useState<"idle" | "show" | "fade" | "gone">("idle");

  useEffect(() => {
    setPhase("show");
    // Curto de propósito: a splash cobre só o primeiro frame e nunca segura a
    // interface. No Android o WebView já pinta o fundo escuro por baixo.
    const t1 = window.setTimeout(() => setPhase("fade"), 320);
    const t2 = window.setTimeout(() => setPhase("gone"), 700);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  if (phase === "idle" || phase === "gone") return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[9999] grid place-items-center bg-black transition-opacity duration-500"
      style={{ opacity: phase === "fade" ? 0 : 1 }}
    >
      <img
        src="/logo-vibely.png"
        alt=""
        className="w-[62vw] max-w-[320px] animate-[splash-in_600ms_ease-out]"
      />
    </div>
  );
}
