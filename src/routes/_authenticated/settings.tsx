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
import { Bell, Bookmark, Camera, ImagePlus, Languages, LogOut, BellOff, Moon, Shield, Sparkles, Store, Sun, Tv } from "lucide-react";
import { signOutAndClearSession } from "@/lib/auth-session";
import { AvatarEditor } from "@/components/user/avatar-editor";
import { InterestsEditor } from "@/components/profile/interests-editor";
import { useAppTheme } from "@/lib/theme";
import { PushSettings } from "@/components/settings/push-settings";
import { useSmartRepliesEnabled, TRANSLATE_LANGUAGES } from "@/lib/chat-settings";
import { useI18n, LOCALES, type LocaleCode } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [smartReplies, setSmartReplies] = useSmartRepliesEnabled();

  const profile = useQuery({
    queryKey: ["me-profile", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_profile");
      if (error) throw error;
      return ((data as any[])?.[0] ?? null) as any;
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
  const [featuredUsername, setFeaturedUsername] = useState("");
  const { theme, setTheme } = useAppTheme();

  const { data: coverUrl } = useSignedUrl("covers", profile.data?.cover_url ?? null);

  useEffect(() => {
    if (profile.data) {
      setDisplayName(profile.data.display_name ?? "");
      setBio(profile.data.bio ?? "");
      setWebsite(profile.data.website ?? "");
      setLocation(profile.data.location ?? "");
      setPronouns(profile.data.pronouns ?? "");
      setUsernameInput(profile.data.username ?? "");
      setFeaturedUsername(profile.data.featured_username ?? "");
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
    const featured = featuredUsername.trim().toLowerCase().replace(/^@/, "");
    if (featured && !/^[a-z0-9_.]{3,20}$/.test(featured)) return toast.error("O @ em destaque é inválido");
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim(),
        bio: bio.trim(),
        website: website.trim() || null,
        location: location.trim() || null,
        pronouns: pronouns.trim() || null,
        featured_username: featured || null,
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


  const completion = (() => {
    const p = profile.data;
    const checks = [
      Boolean(p?.avatar_url),
      Boolean(p?.cover_url),
      Boolean((p?.display_name ?? "").trim()),
      Boolean((p?.bio ?? "").trim()),
      Boolean((p?.location ?? "").trim() || (p?.website ?? "").trim()),
      Boolean((p?.interests ?? []).length),
    ];
    const done = checks.filter(Boolean).length;
    return Math.round((done / checks.length) * 100);
  })();

  return (
    <div className="space-y-6 max-w-lg pb-8">
      <header className="space-y-1">
        <div className="text-[11px] uppercase tracking-[0.25em] text-primary">sua conta</div>
        <h1 className="text-3xl font-display font-black">Configurações</h1>
      </header>

      {/* Hero de identidade */}
      <section className="overflow-hidden rounded-[28px] border border-[color:var(--hairline)] bg-[color:var(--surface)] shadow-elegant">
        <label className="relative block h-32 cursor-pointer bg-gradient-brand group">
          {coverUrl ? <img src={coverUrl} alt="" className="h-full w-full object-cover" /> : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <div className="absolute right-3 top-3 rounded-full bg-black/45 backdrop-blur px-3 py-1.5 text-[11px] font-medium text-white flex items-center gap-1.5 transition group-active:scale-95">
            <ImagePlus className="h-3.5 w-3.5" /> {uploading === "cover" ? "Enviando…" : "Trocar capa"}
          </div>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => onPick("cover", e.target.files?.[0] ?? null)} />
        </label>

        <div className="px-4 pb-4">
          <div className="-mt-11 flex items-end gap-3">
            <label className="relative cursor-pointer">
              <div className="rounded-full ring-4 ring-[color:var(--surface)] bg-background">
                <UserAvatar
                  avatarPath={profile.data?.avatar_url}
                  displayName={profile.data?.display_name ?? "?"}
                  className="h-[84px] w-[84px]"
                />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-elegant">
                <Camera className="h-4 w-4" />
              </span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onPick("avatar", e.target.files?.[0] ?? null)} />
            </label>
            <div className="min-w-0 flex-1 pb-1">
              <div className="truncate text-lg font-display font-bold leading-tight">
                {profile.data?.display_name || "Seu nome"}
              </div>
              <div className="truncate text-[13px] text-muted-foreground">@{profile.data?.username ?? "—"}</div>
            </div>
          </div>

          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-medium">
              <span className="text-muted-foreground uppercase tracking-wider">Perfil completo</span>
              <span className="text-primary">{completion}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[color:var(--surface-2)]">
              <div
                className="h-full rounded-full bg-gradient-brand transition-all duration-500"
                style={{ width: `${completion}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      <form onSubmit={save} className="space-y-4 rounded-[28px] border border-[color:var(--hairline)] bg-[color:var(--surface)] p-4">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--surface-2)] text-primary">
            <UserRound className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-tight">Editar perfil</h2>
            <p className="text-[12px] text-muted-foreground">Como as pessoas veem você no Vibely.</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="un">Usuário (@)</Label>
          <div className="flex gap-2">
            <div className="flex flex-1 items-center gap-1 rounded-xl bg-[color:var(--surface-2)] pl-3">
              <AtSign className="h-4 w-4 shrink-0 text-primary" />
              <Input
                id="un"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))}
                maxLength={20}
                className="border-0 bg-transparent px-2 focus-visible:ring-0"
                placeholder="seu_usuario"
              />
            </div>
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
        <div className="space-y-2">
          <Label htmlFor="featured">@ em destaque</Label>
          <Input
            id="featured"
            value={featuredUsername}
            onChange={(e) => setFeaturedUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.@]/g, ""))}
            maxLength={21}
            placeholder="@alguem"
            className="rounded-xl"
          />
          <p className="text-xs text-muted-foreground">Mostre uma pessoa especial no seu perfil.</p>
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

      <EmailSection currentEmail={user.email ?? ""} />


      <PushSettings userId={user.id} />

      <section className="space-y-3 rounded-[24px] bg-[color:var(--surface)] p-4">
        <div>
          <h2 className="text-base font-semibold">Aparência</h2>
          <p className="text-[13px] text-muted-foreground">Escolha como o Vibely aparece neste dispositivo.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[color:var(--surface-2)] p-1">
          <Button type="button" variant={theme === "dark" ? "default" : "ghost"} className="rounded-xl gap-2" onClick={() => setTheme("dark")}>
            <Moon className="h-4 w-4" /> Escuro
          </Button>
          <Button type="button" variant={theme === "light" ? "default" : "ghost"} className="rounded-xl gap-2" onClick={() => setTheme("light")}>
            <Sun className="h-4 w-4" /> Claro
          </Button>
        </div>
      </section>

      <section className="space-y-3 rounded-[24px] bg-[color:var(--surface)] p-4">
        <div>
          <h2 className="text-base font-semibold">Respostas da IA no chat</h2>
          <p className="text-[13px] text-muted-foreground">Sugestões automáticas de resposta dentro das conversas.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[color:var(--surface-2)] p-1">
          <Button type="button" variant={smartReplies ? "default" : "ghost"} className="rounded-xl gap-2" onClick={() => setSmartReplies(true)}>
            <Sparkles className="h-4 w-4" /> Ativadas
          </Button>
          <Button type="button" variant={!smartReplies ? "default" : "ghost"} className="rounded-xl gap-2" onClick={() => setSmartReplies(false)}>
            <BellOff className="h-4 w-4" /> Desativadas
          </Button>
        </div>
      </section>

      <section className="space-y-3 rounded-[24px] bg-[color:var(--surface)] p-4">
        <div>
          <h2 className="text-base font-semibold">Meu idioma</h2>
          <p className="text-[13px] text-muted-foreground">
            Usado para traduzir legendas e mensagens quando você pedir tradução.
          </p>
        </div>
        <LanguagePicker userId={user.id} />
      </section>

      <section className="space-y-3 rounded-[24px] bg-[color:var(--surface)] p-4">
        <div>
          <h2 className="text-base font-semibold">Interesses</h2>
          <p className="text-[13px] text-muted-foreground">Personalize recomendações ou escolha não informar.</p>
        </div>
        <InterestsEditor userId={user.id} initial={profile.data?.interests ?? []} />
      </section>

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

function LanguagePicker({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { locale, setLocale, t } = useI18n();

  async function save(value: LocaleCode) {
    setLocale(value);
    const { error } = await (supabase as any).from("profiles").update({ language: value }).eq("id", userId);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.setQueryData(["my-language", userId], value);
    toast.success(t("settings.languageUpdated"));
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 rounded-2xl bg-[color:var(--surface-2)] px-3 py-2">
        <Languages className="h-4 w-4 shrink-0 text-primary" />
        <select
          value={locale}
          onChange={(e) => void save(e.target.value as LocaleCode)}
          className="w-full bg-transparent text-sm font-medium outline-none"
          aria-label={t("settings.language")}
        >
          {LOCALES.map((l) => (
            <option key={l.code} value={l.code} className="bg-background text-foreground">
              {l.nativeLabel}
            </option>
          ))}
        </select>
      </div>
      <p className="px-1 text-[11px] text-muted-foreground">{t("settings.languageHint")}</p>
    </div>
  );
}

