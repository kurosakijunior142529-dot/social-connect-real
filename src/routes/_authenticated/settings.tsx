import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { uploadMedia } from "@/lib/media";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();

  const profile = useQuery({
    queryKey: ["me-profile", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (profile.data) {
      setDisplayName(profile.data.display_name);
      setBio(profile.data.bio ?? "");
    }
  }, [profile.data]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (displayName.trim().length < 2) return toast.error("Nome muito curto");
    if (bio.length > 300) return toast.error("Bio longa demais");
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim(), bio: bio.trim() })
      .eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado!");
    queryClient.invalidateQueries({ queryKey: ["me-profile", user.id] });
    queryClient.invalidateQueries({ queryKey: ["profile"] });
  }

  async function onAvatarPick(file: File | null) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Imagem maior que 5MB");
    setUploading(true);
    try {
      const path = await uploadMedia("avatars", user.id, file);
      const { error } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", user.id);
      if (error) throw error;
      toast.success("Avatar atualizado!");
      queryClient.invalidateQueries({ queryKey: ["me-profile", user.id] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["signed-url", "avatars"] });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao enviar");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-3xl font-bold">Configurações</h1>

      <div className="flex items-center gap-4">
        <UserAvatar
          avatarPath={profile.data?.avatar_url}
          displayName={profile.data?.display_name ?? "?"}
          className="h-20 w-20"
          ring
        />
        <label className="cursor-pointer">
          <Button asChild variant="outline" className="rounded-full" disabled={uploading}>
            <span>{uploading ? "Enviando…" : "Trocar foto"}</span>
          </Button>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onAvatarPick(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      <form onSubmit={save} className="space-y-4">
        <div className="space-y-2">
          <Label>Usuário</Label>
          <Input value={profile.data?.username ?? ""} disabled className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dn">Nome</Label>
          <Input
            id="dn"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={50}
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={300}
            rows={4}
            className="rounded-2xl resize-none"
          />
          <div className="text-right text-xs text-muted-foreground">{bio.length}/300</div>
        </div>

        <Button
          type="submit"
          disabled={saving}
          className="w-full h-11 rounded-full bg-gradient-brand hover:opacity-90"
        >
          Salvar
        </Button>
      </form>
    </div>
  );
}
