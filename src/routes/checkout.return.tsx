import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/checkout/return")({
  head: () => ({
    meta: [
      { title: "Compra concluída · Vibely" },
      { name: "description", content: "Obrigado pela sua compra na Vibely." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  component: CheckoutReturn,
});

function CheckoutReturn() {
  const { session_id } = Route.useSearch();
  const queryClient = useQueryClient();

  useEffect(() => {
    // Dá tempo do webhook processar, depois invalida caches
    const t = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      queryClient.invalidateQueries({ queryKey: ["coin-balance"] });
    }, 1500);
    return () => clearTimeout(t);
  }, [queryClient]);

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="w-full max-w-md rounded-3xl bg-[color:var(--surface)] p-8 text-center space-y-4 shadow-elegant"
      >
        <motion.div
          initial={{ rotate: -20, scale: 0 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 260 }}
          className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-primary/10 text-primary"
        >
          <CheckCircle2 className="h-10 w-10" strokeWidth={2.4} />
        </motion.div>
        <h1 className="text-2xl font-semibold flex items-center justify-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> Tudo certo!
        </h1>
        <p className="text-sm text-muted-foreground">
          Sua compra foi concluída e os benefícios já estão sendo liberados na sua conta.
        </p>
        {session_id ? (
          <p className="text-[10px] text-muted-foreground tabular truncate">Ref: {session_id}</p>
        ) : null}
        <div className="flex gap-2 pt-2">
          <Link
            to="/pro"
            className="flex-1 rounded-full bg-[color:var(--surface-2)] px-4 py-2.5 text-sm font-medium"
          >
            Minha conta Pro
          </Link>
          <Link
            to="/"
            className="flex-1 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
          >
            Voltar ao feed
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
