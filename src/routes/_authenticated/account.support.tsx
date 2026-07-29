import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, LifeBuoy, MessageSquare } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/account/support")({
  head: () => ({
    meta: [
      { title: "Ajuda e suporte · Vibely" },
      { name: "description", content: "Perguntas frequentes e canal direto de suporte do Vibely." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SupportPage,
});

const FAQ = [
  {
    q: "Como funcionam as moedas Vibely?",
    a: "Moedas são compradas na página Vibely Pro e usadas para enviar presentes em lives. Criadores recebem moedas e podem convertê-las em reais na Carteira.",
  },
  {
    q: "Quando recebo meu saque via Pix?",
    a: "Após solicitar o saque na Carteira, o pedido entra em análise. Depois de aprovado, o valor é enviado para a chave Pix cadastrada.",
  },
  {
    q: "Como cancelo o Vibely Pro?",
    a: "Vá em Conta → Assinaturas & Premium e toque em Gerenciar. O acesso continua até o fim do período já pago.",
  },
  {
    q: "Como bloqueio ou denuncio alguém?",
    a: "No perfil da pessoa, use o menu de opções para bloquear ou denunciar. Bloqueios podem ser desfeitos em Conta → Usuários bloqueados.",
  },
  {
    q: "Esqueci minha senha, e agora?",
    a: "Saia da conta e use a opção de recuperação na tela de login, ou defina uma nova senha em Conta → Segurança enquanto estiver logado.",
  },
];

function SupportPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    const text = message.trim();
    if (text.length < 10) return toast.error("Descreva com pelo menos 10 caracteres");
    if (text.length > 1000) return toast.error("Mensagem longa demais");
    setSending(true);
    const { error } = await supabase.from("reports").insert({
      reporter_id: user.id,
      target_type: "user",
      target_id: user.id,
      reason: "suporte",
      details: text,
    } as any);
    setSending(false);
    if (error) return toast.error("Não foi possível enviar agora");
    setMessage("");
    toast.success("Recebemos sua mensagem. Em breve entramos em contato.");
  }

  return (
    <div className="space-y-6 pb-6 max-w-lg">
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate({ to: "/account" })}
          className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface)]"
          aria-label="Voltar"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div>
          <div className="text-[11px] uppercase tracking-[0.25em] text-primary">suporte</div>
          <h1 className="text-2xl font-display font-black leading-tight">Ajuda</h1>
        </div>
      </header>

      <section className="rounded-3xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-4">
        <div className="flex items-center gap-2 mb-1">
          <LifeBuoy className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Perguntas frequentes</h2>
        </div>
        <Accordion type="single" collapsible>
          {FAQ.map((f, i) => (
            <AccordionItem key={i} value={`i${i}`}>
              <AccordionTrigger className="text-left text-sm">{f.q}</AccordionTrigger>
              <AccordionContent className="text-[13px] text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section className="rounded-3xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Falar com o suporte</h2>
        </div>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={1000}
          rows={5}
          placeholder="Conte o que aconteceu, com o máximo de detalhes possível…"
          className="rounded-2xl resize-none"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground tabular">{message.length}/1000</span>
          <Button className="rounded-full" onClick={send} disabled={sending}>
            {sending ? "Enviando…" : "Enviar"}
          </Button>
        </div>
      </section>

      <Link to="/account" className="block text-center text-[11px] text-muted-foreground">
        Voltar para a Conta
      </Link>
    </div>
  );
}
