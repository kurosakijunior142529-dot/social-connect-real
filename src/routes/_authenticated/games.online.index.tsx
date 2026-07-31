import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/games/online/")({
  component: OnlineLobby,
  head: () => ({
    meta: [
      { title: "Multiplayer online · vibely" },
      { name: "description", content: "Crie uma sala multiplayer e jogue com amigos em tempo real." },
      { property: "og:title", content: "Multiplayer online · vibely" },
      { property: "og:description", content: "Crie uma sala multiplayer e jogue com amigos em tempo real." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, (byte) => (byte % 36).toString(36)).join("").toUpperCase();
}

function OnlineLobby() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const openRoom = (room: string) => navigate({ to: "/games/online/$room", params: { room } });

  return (
    <div className="pb-10">
      <header className="sticky top-0 z-10 glass-heavy hairline-b">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link to="/games" className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)]" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></Link>
          <h1 className="text-lg font-display font-semibold">Jogar com amigo</h1>
        </div>
      </header>
      <div className="px-4 pt-6 space-y-6 max-w-md mx-auto">
        <div className="rounded-3xl bg-gradient-to-br from-primary/20 via-primary/5 to-transparent p-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground"><Users className="h-7 w-7" /></div>
          <h2 className="text-xl font-display font-semibold">Jogo da Velha Online</h2>
          <p className="text-sm text-muted-foreground mt-1">Crie uma sala e envie o código para um amigo.</p>
        </div>
        <Button className="w-full h-12 rounded-2xl text-base" onClick={() => openRoom(randomCode())}>Criar sala</Button>
        <div className="rounded-2xl bg-[color:var(--surface)] p-4 space-y-3">
          <div className="text-sm font-medium">Entrar com código</div>
          <div className="flex gap-2">
            <Input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="XXXXX" maxLength={12} className="uppercase tracking-widest text-center font-mono" />
            <Button onClick={() => openRoom(code.trim().toUpperCase())} disabled={!code.trim()}>Entrar</Button>
          </div>
        </div>
      </div>
    </div>
  );
}