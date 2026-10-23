import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
import logoAsset from "@/assets/vibely-logo-v.png.asset.json";

export const Route = createFileRoute("/auth/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Entrar | Vibely" }, { name: "description", content: "Entre ou crie sua conta no Vibely." }, { property: "og:title", content: "Entrar | Vibely" }, { property: "og:description", content: "Entre ou crie sua conta no Vibely." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AuthPage,
});

const signInSchema = z.object({
  email: z.string().trim().email({ message: "Email inválido" }).max(255),
  password: z.string().min(6, { message: "Mínimo 6 caracteres" }).max(72),
});

const signUpSchema = signInSchema.extend({
  display_name: z.string().trim().min(2, { message: "Nome muito curto" }).max(50),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,24}$/, { message: "3-24 letras/números/underscore" }),
});

const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[^\d+]/g, ""))
  .refine((v) => /^\+\d{10,15}$/.test(v), { message: "Use o formato +5511999999999" });

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"signin" | "signup" | "phone">("signin");

  async function handleSendOtp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: parsed.data });
    setLoading(false);
    if (error) {
      return toast.error(
        /provider|disabled|unsupported/i.test(error.message)
          ? "Login por telefone ainda não está ativo. Configure o envio de SMS."
          : error.message,
      );
    }
    setOtpSent(true);
    toast.success("Código enviado por SMS");
  }

  async function handleVerifyOtp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (!/^\d{4,8}$/.test(code.trim())) return toast.error("Código inválido");
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      phone: parsed.data,
      token: code.trim(),
      type: "sms",
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Telefone verificado!");
    navigate({ to: "/" });
  }


  async function handleSignIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = signInSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Bem-vindo de volta!");
    navigate({ to: "/" });
  }

  async function handleSignUp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = signUpSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setLoading(true);
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          display_name: parsed.data.display_name,
          username: parsed.data.username,
        },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    // Só entra quando a sessão já existe; senão a tela inicial abria vazia.
    if (!signUpData.session) {
      return toast.success("Conta criada! Confirme pelo link enviado ao seu email para entrar.");
    }
    toast.success("Conta criada! Você já está dentro.");
    navigate({ to: "/", replace: true });
  }

  async function handleGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth/callback`,
    });
    if (result.error) {
      setLoading(false);
      toast.error("Falha ao entrar com Google");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/auth/callback", replace: true });
  }

  const field = "h-12 rounded-2xl bg-muted/60 border-border/60 px-4 text-[15px] focus-visible:ring-primary/40";
  const cta = "w-full h-12 rounded-2xl text-[15px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_10px_30px_-12px_var(--primary)]";
  return (
    <div className="auth-stage relative min-h-dvh overflow-hidden bg-background">
      <div aria-hidden className="auth-orb auth-orb-a" />
      <div aria-hidden className="auth-orb auth-orb-b" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-sm flex-col px-6 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        <div className="flex flex-col items-center text-center">
          <Link to="/auth" aria-label="Vibely">
            <img src={logoAsset.url} alt="Vibely" width={1254} height={1254} className="h-28 w-28 rounded-[30px] object-contain shadow-lg" />
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">Fotos, vídeos e conversas com quem vibra com você.</p>
        </div>

        <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)} className="mt-8 w-full">
          <TabsList className="grid h-11 w-full grid-cols-3 rounded-2xl bg-muted/70 p-1">
            <TabsTrigger value="signin" className="rounded-xl">Entrar</TabsTrigger>
            <TabsTrigger value="signup" className="rounded-xl">Criar conta</TabsTrigger>
            <TabsTrigger value="phone" className="rounded-xl">Telefone</TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="mt-5">
            <form onSubmit={handleSignIn} className="space-y-3">
              <Label htmlFor="si-email" className="sr-only">Email</Label>
              <Input id="si-email" name="email" type="email" autoComplete="email" placeholder="Email" required className={field} />
              <PasswordField id="si-password" placeholder="Senha" className={field} autoComplete="current-password" />
              <Button type="submit" disabled={loading} className={cta}>Entrar</Button>
            </form>
          </TabsContent>

          <TabsContent value="signup" className="mt-5">
            <form onSubmit={handleSignUp} className="space-y-3">
              <Input name="display_name" aria-label="Nome" placeholder="Nome" required maxLength={50} className={field} />
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                <Input name="username" aria-label="Usuário" placeholder="usuario" required maxLength={24} className={field + " pl-8"} />
              </div>
              <Input name="email" type="email" aria-label="Email" autoComplete="email" placeholder="Email" required className={field} />
              <PasswordField id="su-password" placeholder="Senha (mín. 6)" className={field} autoComplete="new-password" />
              <Button type="submit" disabled={loading} className={cta}>Criar conta</Button>
            </form>
          </TabsContent>

          <TabsContent value="phone" className="mt-5">
            {!otpSent ? (
              <form onSubmit={handleSendOtp} className="space-y-3">
                <Input type="tel" inputMode="tel" autoComplete="tel" aria-label="Telefone" placeholder="+5511999999999" value={phone} onChange={(e) => setPhone(e.target.value)} required className={field} />
                <p className="px-1 text-xs text-muted-foreground">Inclua o código do país. Enviaremos um código por SMS.</p>
                <Button type="submit" disabled={loading} className={cta}>Enviar código</Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-3">
                <Input inputMode="numeric" autoComplete="one-time-code" maxLength={8} aria-label="Código" placeholder="Código de 6 dígitos" value={code} onChange={(e) => setCode(e.target.value)} required className={field + " text-center tracking-[0.4em]"} />
                <p className="px-1 text-xs text-muted-foreground">Enviado para {phone}</p>
                <Button type="submit" disabled={loading} className={cta}>Verificar e entrar</Button>
                <Button type="button" variant="ghost" disabled={loading} onClick={() => { setOtpSent(false); setCode(""); }} className="w-full rounded-2xl">Usar outro número</Button>
              </form>
            )}
          </TabsContent>
        </Tabs>

        <div className="my-6 flex items-center gap-3 text-[11px] font-semibold tracking-widest text-muted-foreground">
          <div className="h-px flex-1 bg-border" />OU<div className="h-px flex-1 bg-border" />
        </div>

        <Button type="button" variant="outline" disabled={loading} onClick={handleGoogle} className="h-12 w-full gap-2 rounded-2xl text-[15px]">
          <svg viewBox="0 0 24 24" className="h-5 w-5"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continuar com Google
        </Button>

        <div className="mt-auto pt-8 text-center text-sm text-muted-foreground">
          {mode === "signup" ? (
            <>Já tem uma conta? <button type="button" onClick={() => setMode("signin")} className="font-semibold text-foreground">Entrar</button></>
          ) : (
            <>Não tem uma conta? <button type="button" onClick={() => setMode("signup")} className="font-semibold text-foreground">Cadastre-se</button></>
          )}
        </div>
      </div>
    </div>
  );
}

function PasswordField({ id, placeholder, className, autoComplete }: { id: string; placeholder: string; className: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} name="password" type={show ? "text" : "password"} aria-label="Senha" placeholder={placeholder} autoComplete={autoComplete} required minLength={6} className={className + " pr-12"} />
      <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Ocultar senha" : "Mostrar senha"} className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center text-muted-foreground">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
