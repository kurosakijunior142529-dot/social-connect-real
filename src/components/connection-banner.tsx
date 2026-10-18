import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";

/** Aviso discreto no topo quando a internet oscila. */
export function ConnectionBanner() {
  const [online, setOnline] = useState(true);
  const [back, setBack] = useState(false);
  useEffect(() => {
    setOnline(navigator.onLine);
    let t: ReturnType<typeof setTimeout>;
    const on = () => { setOnline(true); setBack(true); t = setTimeout(() => setBack(false), 2000); };
    const off = () => { setOnline(false); setBack(false); };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); clearTimeout(t); };
  }, []);
  if (online && !back) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[90] flex justify-center" style={{ top: "calc(env(safe-area-inset-top) + 8px)" }}>
      <div className="flex items-center gap-2 rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-lg backdrop-blur">
        {online ? <Wifi className="h-3.5 w-3.5 text-primary" /> : <WifiOff className="h-3.5 w-3.5 animate-pulse text-muted-foreground" />}
        {online ? "Conectado" : "Conectando…"}
      </div>
    </div>
  );
}
