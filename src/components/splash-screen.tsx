import { useEffect, useState } from "react";
import logo from "/logo-vibely.png?url";

/**
 * Splash de abertura do app: logo completa do Vibely (símbolo + palavra)
 * centralizada sobre fundo preto. Some suavemente após a primeira renderização.
 */
export function SplashScreen() {
  const [hidden, setHidden] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const t1 = window.setTimeout(() => setHidden(true), 900);
    const t2 = window.setTimeout(() => setGone(true), 1500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[9999] grid place-items-center bg-black transition-opacity duration-500"
      style={{ opacity: hidden ? 0 : 1 }}
    >
      <img
        src={logo}
        alt=""
        className="w-[62vw] max-w-[320px] animate-[splash-in_600ms_ease-out]"
      />
    </div>
  );
}
