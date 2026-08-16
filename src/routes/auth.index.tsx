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

export const Route = createFileRoute("/auth/")({
  ssr: false,
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
    const { error } = await supabase.auth.signUp({
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
    toast.success("Conta criada! Você já está dentro.");
    navigate({ to: "/" });
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

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Brand panel */}
      <div className="md:w-1/2 bg-gradient-brand text-white p-8 md:p-16 flex flex-col justify-between min-h-[40vh] md:min-h-screen">
        <Link to="/auth" className="text-3xl font-bold">Vibely</Link>
        <div className="space-y-4 py-12">
          <h1 className="text-4xl md:text-6xl font-bold leading-tight">
            Sua rede social,<br />de verdade.
          </h1>
          <p className="text-lg md:text-xl text-white/90 max-w-md">
            Fotos, vídeos, curtidas, comentários e mensagens em tempo real. Tudo em um app colorido, rápido e seu.
          </p>
        </div>
        <div className="text-sm text-white/70">© Vibely</div>
      </div>

      {/* Auth panel */}
      <div className="md:w-1/2 flex items-center justify-center p-6 md:p-16 bg-background">
        <div className="w-full max-w-md">
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid grid-cols-3 mb-6 w-full">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
              <TabsTrigger value="phone">Telefone</TabsTrigger>
            </TabsList>

            <TabsContent value="phone">
              {!otpSent ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ph-number">Número de telefone</Label>
                    <Input
                      id="ph-number"
                      name="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="+5511999999999"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Inclua o código do país. Enviaremos um código por SMS.
                    </p>
                  </div>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-brand hover:opacity-90 rounded-full h-11"
                  >
                    Enviar código
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ph-code">Código de verificação</Label>
                    <Input
                      id="ph-code"
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={8}
                      placeholder="123456"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">Enviado para {phone}</p>
                  </div>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-brand hover:opacity-90 rounded-full h-11"
                  >
                    Verificar e entrar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={loading}
                    onClick={() => { setOtpSent(false); setCode(""); }}
                    className="w-full rounded-full h-10"
                  >
                    Usar outro número
                  </Button>
                </form>
              )}
            </TabsContent>


            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="si-email">Email</Label>
                  <Input id="si-email" name="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="si-password">Senha</Label>
                  <Input id="si-password" name="password" type="password" required />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-brand hover:opacity-90 rounded-full h-11"
                >
                  Entrar
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="su-display">Nome</Label>
                    <Input id="su-display" name="display_name" required maxLength={50} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-username">Usuário</Label>
                    <Input id="su-username" name="username" required maxLength={24} placeholder="joao_silva" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-email">Email</Label>
                  <Input id="su-email" name="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-password">Senha</Label>
                  <Input id="su-password" name="password" type="password" required minLength={6} />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-brand hover:opacity-90 rounded-full h-11"
                >
                  Criar conta
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex-1 border-t" />
            OU
            <div className="flex-1 border-t" />
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={handleGoogle}
            className="w-full rounded-full h-11 gap-2"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continuar com Google
          </Button>
        </div>
      </div>
    </div>
  );
}
