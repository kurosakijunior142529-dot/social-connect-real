import { useEffect, type RefObject } from "react";

/**
 * Mantém a tela de conversa presa à área visível quando o teclado abre
 * (iPhone e Android). Escreve --app-vh / --app-vt no <html> e impede que o
 * navegador empurre a página inteira para cima, o que deixava o fundo branco.
 */
export function useKeyboardViewport(scrollRef?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const vv = window.visualViewport;
    const prevOverflow = root.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    let raf = 0;
    const apply = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = Math.round(vv?.height ?? window.innerHeight);
        const top = Math.round(vv?.offsetTop ?? 0);
        // Ignora oscilações de 1-2px durante a animação do teclado (causavam tremedeira).
        if (Math.abs(h - lastH) < 3 && Math.abs(top - lastT) < 3) return;
        lastH = h;
        lastT = top;
        const el = scrollRef?.current;
        const nearBottom = el ? el.scrollHeight - el.scrollTop - el.clientHeight < 160 : false;
        root.style.setProperty("--app-vh", `${h}px`);
        root.style.setProperty("--app-vt", `${top}px`);
        if (el && nearBottom) el.scrollTop = el.scrollHeight;
      });
    };

    apply();
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);

    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      root.style.overflow = prevOverflow;
      document.body.style.overflow = prevBodyOverflow;
      root.style.removeProperty("--app-vh");
      root.style.removeProperty("--app-vt");
    };
  }, [scrollRef]);
}

/** Rola só a lista de mensagens (nunca a página), evitando que a tela pule. */
export function scrollListToBottom(el: HTMLElement | null | undefined, smooth = false) {
  if (!el) return;
  if (smooth) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  else el.scrollTop = el.scrollHeight;
}

export const KEYBOARD_SAFE_CLASS =
  "max-md:fixed max-md:inset-x-0 max-md:top-[var(--app-vt,0px)] max-md:h-[var(--app-vh,100dvh)] max-md:z-20 max-md:bg-background";
