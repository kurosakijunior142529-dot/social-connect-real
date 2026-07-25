import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Wallet as WalletIcon, Coins, ArrowUpRight, Landmark, Trash2, Loader2, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/wallet")({
  head: () => ({
    meta: [
      { title: "Carteira · Saldo e Saques" },
      { name: "description", content: "Gerencie seu saldo em moedas, converta para reais e solicite saques via Pix ou conta bancária." },
      { property: "og:title", content: "Vibely Carteira" },
      { property: "og:description", content: "Saldo, conversão e saques no Vibely." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WalletPage,
});

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABEL: Record<string, { label: string; icon: any; className: string }> = {
  pending: { label: "Pendente", icon: Clock, className: "text-yellow-500 bg-yellow-500/10" },
  approved: { label: "Aprovado", icon: CheckCircle2, className: "text-blue-500 bg-blue-500/10" },
  paid: { label: "Pago", icon: CheckCircle2, className: "text-primary bg-primary/10" },
  rejected: { label: "Rejeitado", icon: XCircle, className: "text-red-500 bg-red-500/10" },
};

function WalletPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [selectedBank, setSelectedBank] = useState<string>("");

  const settings = useQuery({
    queryKey: ["app_settings"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("*").maybeSingle();
      return data;
    },
  });

  const balance = useQuery({
    queryKey: ["coin-balance", user.id],
    queryFn: async () => {
      const { data } = await supabase.from("user_coins").select("balance").eq("user_id", user.id).maybeSingle();
      return data?.balance ?? 0;
    },
  });

  const banks = useQuery({
    queryKey: ["bank-accounts", user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const withdrawals = useQuery({
    queryKey: ["withdrawals", user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("withdrawals")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const rate = Number(settings.data?.coin_to_brl_rate ?? 0.0645);
  const minBRL = Number(settings.data?.min_withdrawal_brl ?? 50);
  const minCoins = Math.ceil(minBRL / rate);
  const coins = balance.data ?? 0;
  const brlBalance = coins * rate;
  const amountCoins = Number(amount) || 0;
  const amountBRL = amountCoins * rate;

  const requestWithdrawal = useMutation({
    mutationFn: async () => {
      if (!selectedBank) throw new Error("Selecione uma conta bancária");
      if (amountCoins < minCoins) throw new Error(`Mínimo de ${minCoins} moedas (${formatBRL(minBRL)})`);
      if (amountCoins > coins) throw new Error("Saldo insuficiente");
      const { error } = await supabase.rpc("request_withdrawal", {
        _bank_account_id: selectedBank,
        _amount_coins: amountCoins,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saque solicitado! Processado em até 3 dias úteis.");
      setAmount("");
      qc.invalidateQueries({ queryKey: ["coin-balance"] });
      qc.invalidateQueries({ queryKey: ["withdrawals"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao solicitar saque"),
  });

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-20 glass-heavy hairline-b">
        <div className="flex h-14 items-center gap-2 px-4">
          <WalletIcon className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Carteira</h1>
        </div>
      </header>

      <div className="p-4 space-y-6">
        {/* Saldo */}
        <div className="rounded-3xl bg-gradient-to-br from-primary/20 via-[color:var(--surface)] to-[color:var(--surface)] border border-[color:var(--hairline)] p-6">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Saldo disponível</div>
          <div className="mt-2 flex items-baseline gap-2">
            <Coins className="h-6 w-6 text-primary" />
            <span className="text-4xl font-bold tabular">{coins.toLocaleString("pt-BR")}</span>
            <span className="text-sm text-muted-foreground">moedas</span>
          </div>
          <div className="mt-1 text-2xl font-semibold tabular text-primary">≈ {formatBRL(brlBalance)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Taxa: 1 moeda = {formatBRL(rate)} · Mínimo de saque: {formatBRL(minBRL)}
          </div>
        </div>

        <Tabs defaultValue="withdraw">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="withdraw">Sacar</TabsTrigger>
            <TabsTrigger value="banks">Contas</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>

          {/* Sacar */}
          <TabsContent value="withdraw" className="space-y-4 mt-4">
            {banks.data && banks.data.length > 0 ? (
              <>
                <div className="space-y-2">
                  <Label>Conta de destino</Label>
                  <Select value={selectedBank} onValueChange={setSelectedBank}>
                    <SelectTrigger><SelectValue placeholder="Escolha uma conta" /></SelectTrigger>
                    <SelectContent>
                      {banks.data.map((b: any) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.method === "pix" ? `Pix ${b.pix_key_type?.toUpperCase()} · ${b.pix_key}` : `${b.bank_name} · ${b.bank_agency}/${b.bank_account}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quantidade de moedas</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                    placeholder={`Mínimo ${minCoins}`}
                  />
                  <div className="text-sm text-muted-foreground">
                    Você receberá <span className="font-semibold text-primary tabular">{formatBRL(amountBRL)}</span>
                  </div>
                </div>
                <Button
                  className="w-full rounded-full h-12"
                  disabled={requestWithdrawal.isPending || amountCoins < minCoins || amountCoins > coins || !selectedBank}
                  onClick={() => requestWithdrawal.mutate()}
                >
                  {requestWithdrawal.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                    <><ArrowUpRight className="h-4 w-4 mr-1" /> Solicitar saque</>
                  )}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center">
                  Saques são processados manualmente em até 3 dias úteis pela equipe.
                </p>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-[color:var(--hairline)] p-6 text-center space-y-3">
                <Landmark className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Cadastre uma conta bancária ou chave Pix para sacar.</p>
                <BankAccountDialog trigger={<Button variant="secondary">Cadastrar conta</Button>} />
              </div>
            )}
          </TabsContent>

          {/* Contas */}
          <TabsContent value="banks" className="space-y-3 mt-4">
            <div className="flex justify-end">
              <BankAccountDialog trigger={<Button size="sm"><Landmark className="h-4 w-4 mr-1" />Nova conta</Button>} />
            </div>
            {banks.data?.length ? banks.data.map((b: any) => (
              <BankRow key={b.id} bank={b} />
            )) : (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma conta cadastrada.</p>
            )}
          </TabsContent>

          {/* Histórico */}
          <TabsContent value="history" className="space-y-2 mt-4">
            {withdrawals.data?.length ? withdrawals.data.map((w: any) => {
              const s = STATUS_LABEL[w.status] ?? STATUS_LABEL.pending;
              const Icon = s.icon;
              return (
                <div key={w.id} className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold tabular">{formatBRL(Number(w.amount_brl))}</div>
                    <div className="text-xs text-muted-foreground">{w.amount_coins} moedas · {new Date(w.created_at).toLocaleDateString("pt-BR")}</div>
                    {w.admin_note ? <div className="text-xs text-muted-foreground mt-1">Nota: {w.admin_note}</div> : null}
                  </div>
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium", s.className)}>
                    <Icon className="h-3.5 w-3.5" /> {s.label}
                  </span>
                </div>
              );
            }) : (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum saque ainda.</p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function BankRow({ bank }: { bank: any }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bank_accounts").update({ is_active: false }).eq("id", bank.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bank-accounts"] }),
  });
  return (
    <div className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-4 flex items-start justify-between gap-3">
      <div>
        <div className="font-semibold text-sm">{bank.holder_name}</div>
        <div className="text-xs text-muted-foreground">CPF/CNPJ: {bank.holder_document}</div>
        {bank.method === "pix" ? (
          <div className="text-sm mt-1">Pix {bank.pix_key_type?.toUpperCase()}: <span className="font-mono">{bank.pix_key}</span></div>
        ) : (
          <div className="text-sm mt-1">
            {bank.bank_name} · Ag {bank.bank_agency} · CC {bank.bank_account} ({bank.bank_account_type === "savings" ? "Poupança" : "Corrente"})
          </div>
        )}
      </div>
      <Button size="icon" variant="ghost" onClick={() => del.mutate()} disabled={del.isPending}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function BankAccountDialog({ trigger }: { trigger: React.ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"pix" | "bank">("pix");
  const [form, setForm] = useState({
    holder_name: "",
    holder_document: "",
    pix_key_type: "cpf",
    pix_key: "",
    bank_name: "",
    bank_agency: "",
    bank_account: "",
    bank_account_type: "checking",
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.holder_name || !form.holder_document) throw new Error("Preencha nome e documento");
      if (method === "pix" && !form.pix_key) throw new Error("Informe a chave Pix");
      if (method === "bank" && (!form.bank_name || !form.bank_agency || !form.bank_account)) throw new Error("Preencha dados bancários");
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Sessão expirada");
      const payload: any = {
        user_id: user.id,
        holder_name: form.holder_name,
        holder_document: form.holder_document,
        method,
      };
      if (method === "pix") {
        payload.pix_key_type = form.pix_key_type;
        payload.pix_key = form.pix_key;
      } else {
        payload.bank_name = form.bank_name;
        payload.bank_agency = form.bank_agency;
        payload.bank_account = form.bank_account;
        payload.bank_account_type = form.bank_account_type;
      }
      const { error } = await supabase.from("bank_accounts").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conta adicionada");
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      setOpen(false);
      setForm({ holder_name: "", holder_document: "", pix_key_type: "cpf", pix_key: "", bank_name: "", bank_agency: "", bank_account: "", bank_account_type: "checking" });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Vincular conta</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="inline-flex rounded-full bg-[color:var(--surface-2)] p-1 text-xs w-full">
            <button onClick={() => setMethod("pix")} className={cn("flex-1 px-3 py-1.5 rounded-full font-medium", method === "pix" && "bg-background shadow-sm")}>Pix</button>
            <button onClick={() => setMethod("bank")} className={cn("flex-1 px-3 py-1.5 rounded-full font-medium", method === "bank" && "bg-background shadow-sm")}>Conta bancária</button>
          </div>
          <div>
            <Label>Nome do titular</Label>
            <Input value={form.holder_name} onChange={(e) => setForm({ ...form, holder_name: e.target.value })} />
          </div>
          <div>
            <Label>CPF / CNPJ</Label>
            <Input value={form.holder_document} onChange={(e) => setForm({ ...form, holder_document: e.target.value })} />
          </div>
          {method === "pix" ? (
            <>
              <div>
                <Label>Tipo de chave</Label>
                <Select value={form.pix_key_type} onValueChange={(v) => setForm({ ...form, pix_key_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cpf">CPF</SelectItem>
                    <SelectItem value="cnpj">CNPJ</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="phone">Celular</SelectItem>
                    <SelectItem value="random">Chave aleatória</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Chave Pix</Label>
                <Input value={form.pix_key} onChange={(e) => setForm({ ...form, pix_key: e.target.value })} />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label>Banco</Label>
                <Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} placeholder="Ex: Nubank" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Agência</Label>
                  <Input value={form.bank_agency} onChange={(e) => setForm({ ...form, bank_agency: e.target.value })} />
                </div>
                <div>
                  <Label>Conta</Label>
                  <Input value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={form.bank_account_type} onValueChange={(v) => setForm({ ...form, bank_account_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="checking">Corrente</SelectItem>
                    <SelectItem value="savings">Poupança</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
