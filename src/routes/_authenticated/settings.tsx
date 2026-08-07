import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { uploadMedia } from "@/lib/media";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Bell, Bookmark, Camera, ImagePlus, LogOut, Shield, Store, Tv } from "lucide-react";
import { signOutAndClearSession } from "@/lib/auth-session";
import { AvatarEditor } from "@/components/user/avatar-editor";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const profile = useQuery({
    queryKey: ["me-profile", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [location, setLocation] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"avatar" | "cover" | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [changingUsername, setChangingUsername] = useState(false);

  const { data: coverUrl } = useSignedUrl("covers", profile.data?.cover_url ?? null);

  useEffect(() => {
    if (profile.data) {
      setDisplayName(profile.data.display_name ?? "");
      setBio(profile.data.bio ?? "");
      setWebsite(profile.data.website ?? "");
      setLocation(profile.data.location ?? "");
      setPronouns(profile.data.pronouns ?? "");
      setUsernameInput(profile.data.username ?? "");
    }
  }, [profile.data]);

  /**
   * Perfil aparece embutido em várias listas (feed, salvos, explorar, reels…),
   * então qualquer alteração de @/nome/avatar precisa invalidar todas elas —
   * não só as queries de perfil.
   */
  function invalidateProfileEverywhere() {
    const keys = [
      ["me-profile", user.id],
      ["profile"],
      ["profile-stats"],
      ["feed"],
      ["saved"],
      ["explore"],
      ["reels"],
      ["user-posts"],
      ["post"],
      ["comments"],
    ];
    for (const key of keys) queryClient.invalidateQueries({ queryKey: key });
  }

  async function changeUsername() {
    const next = usernameInput.trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,20}$/.test(next)) return toast.error("Use 3 a 20 caracteres: letras, números, ponto ou _");
    setChangingUsername(true);
    const { data, error } = await supabase.rpc("change_username", { _new_username: next } as any);
    setChangingUsername(false);
    if (error) return toast.error(error.message);
    toast.success(`@ atualizado para @${data}`);
    invalidateProfileEverywhere();
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (displayName.trim().length < 2) return toast.error("Nome muito curto");
    if (bio.length > 300) return toast.error("Bio longa demais");
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim(),
        bio: bio.trim(),
        website: website.trim() || null,
        location: location.trim() || null,
        pronouns: pronouns.trim() || null,
      } as any)
      .eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado!");
    invalidateProfileEverywhere();
  }

  async function onPick(kind: "avatar" | "cover", file: File | null) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return toast.error("Imagem maior que 8MB");
    if (kind === "avatar") {
      setAvatarFile(file);
      setEditorOpen(true);
      return;
    }
    await upload("cover", file);
  }

  async function upload(kind: "avatar" | "cover", file: File) {
    setUploading(kind);
    try {
      const bucket = kind === "avatar" ? "avatars" : "covers";
      const path = await uploadMedia(bucket, user.id, file);
      const column = kind === "avatar" ? "avatar_url" : "cover_url";
      const { error } = await supabase.from("profiles").update({ [column]: path } as any).eq("id", user.id);
      if (error) throw error;
      toast.success(kind === "avatar" ? "Avatar atualizado!" : "Capa atualizada!");
      invalidateProfileEverywhere();
      queryClient.invalidateQueries({ queryKey: ["signed-url"] });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao enviar");
    } finally {
      setUploading(null);
    }
  }


  return (
    <div className="space-y-6 max-w-lg">
      <header className="space-y-1">
        <div className="text-[11px] uppercase tracking-[0.25em] text-primary">sua conta</div>
        <h1 className="text-3xl font-display font-black">Configurações</h1>
      </header>

      {/* Cover */}
      <label className="relative block h-36 rounded-3xl overflow-hidden bg-gradient-to-br from-primary/30 to-secondary cursor-pointer group">
        {coverUrl ? <img src={coverUrl} alt="" className="h-full w-full object-cover" /> : null}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition grid place-items-center">
          <div className="rounded-full bg-white/10 backdrop-blur px-3 py-1.5 text-xs text-white flex items-center gap-1.5">
            <ImagePlus className="h-4 w-4" /> {uploading === "cover" ? "Enviando…" : "Trocar capa"}
          </div>
        </div>
        <input type="file" accept="image/*" className="hidden" onChange={(e) => onPick("cover", e.target.files?.[0] ?? null)} />
      </label>

      {/* Avatar */}
      <div className="flex items-center gap-4 -mt-16 px-4">
        <div className="rounded-full ring-4 ring-background bg-background">
          <UserAvatar
            avatarPath={profile.data?.avatar_url}
            displayName={profile.data?.display_name ?? "?"}
            className="h-20 w-20"
          />
        </div>
        <label className="cursor-pointer">
          <Button asChild variant="outline" className="rounded-full gap-2" disabled={uploading === "avatar"}>
            <span><Camera className="h-4 w-4" /> {uploading === "avatar" ? "Enviando…" : "Trocar foto"}</span>
          </Button>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => onPick("avatar", e.target.files?.[0] ?? null)} />
        </label>
      </div>

      <form onSubmit={save} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="un">Usuário (@)</Label>
          <div className="flex gap-2">
            <Input
              id="un"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))}
              maxLength={20}
              className="rounded-xl"
              placeholder="seu_usuario"
            />
            <Button
              type="button"
              variant="outline"
              className="rounded-xl shrink-0"
              disabled={
                changingUsername ||
                !usernameInput ||
                usernameInput === (profile.data?.username ?? "")
              }
              onClick={changeUsername}
            >
              {changingUsername ? "Salvando…" : "Alterar"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            3 a 20 caracteres (letras, números, ponto ou _). Pode ser alterado a cada 14 dias.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dn">Nome</Label>
          <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={50} className="rounded-xl" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="pr">Pronomes</Label>
            <Input id="pr" value={pronouns} onChange={(e) => setPronouns(e.target.value)} maxLength={20} placeholder="ela/dela" className="rounded-xl" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="loc">Localização</Label>
            <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={60} placeholder="São Paulo" className="rounded-xl" />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="web">Site</Label>
          <Input id="web" value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={120} placeholder="https://…" className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} rows={4} className="rounded-2xl resize-none" />
          <div className="text-right text-xs text-muted-foreground">{bio.length}/300</div>
        </div>

        <Button type="submit" disabled={saving} className="w-full h-11 rounded-full bg-gradient-brand hover:opacity-90 shadow-elegant">
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      </form>

      <section className="space-y-3 rounded-[24px] bg-[color:var(--surface)] p-4">
        <div>
          <h2 className="text-base font-semibold">Preferências e atalhos</h2>
          <p className="text-[13px] text-muted-foreground">Acesse rapidamente áreas importantes do app.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SettingsShortcut to="/notifications" icon={<Bell className="h-4 w-4" />} label="Notificações" />
          <SettingsShortcut to="/saved" icon={<Bookmark className="h-4 w-4" />} label="Salvos" />
          <SettingsShortcut to="/watch" icon={<Tv className="h-4 w-4" />} label="Streaming" />
          <SettingsShortcut to="/marketplace" icon={<Store className="h-4 w-4" />} label="Marketplace" />
        </div>
      </section>

      <section className="space-y-3 rounded-[24px] bg-[color:var(--surface)] p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color:var(--surface-2)] text-primary">
            <Shield className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">Sessão</h2>
            <p className="truncate text-[13px] text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="destructive"
          className="h-11 w-full rounded-full gap-2"
          onClick={() => signOutAndClearSession(queryClient, navigate)}
        >
          <LogOut className="h-4 w-4" /> Sair da conta
        </Button>
      </section>

      <AvatarEditor
        file={avatarFile}
        open={editorOpen}
        onOpenChange={(o) => {
          setEditorOpen(o);
          if (!o) setAvatarFile(null);
        }}
        busy={uploading === "avatar"}
        onConfirm={async (cropped) => {
          await upload("avatar", cropped);
          setEditorOpen(false);
          setAvatarFile(null);
        }}
      />
    </div>

  );
}

function SettingsShortcut({
  to,
  icon,
  label,
}: {
  to: "/notifications" | "/saved" | "/watch" | "/marketplace";
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-2xl bg-[color:var(--surface-2)] px-3 py-3 text-sm font-medium transition active:scale-[0.98]"
    >
      <span className="text-primary">{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}
