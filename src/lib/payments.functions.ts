import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  type StripeEnv,
  createStripeClient,
  getStripeErrorMessage,
} from "@/lib/stripe.server";

type CheckoutResult = { clientSecret: string } | { error: string };
type PortalResult = { url: string } | { error: string };

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId: string },
): Promise<string> {
  if (!/^[a-zA-Z0-9_-]+$/.test(options.userId)) throw new Error("Invalid userId");
  const found = await stripe.customers.search({
    query: `metadata['userId']:'${options.userId}'`,
    limit: 1,
  });
  if (found.data.length) return found.data[0].id;
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const c = existing.data[0];
      if (c.metadata?.userId !== options.userId) {
        await stripe.customers.update(c.id, {
          metadata: { ...c.metadata, userId: options.userId },
        });
      }
      return c.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    metadata: { userId: options.userId },
  });
  return created.id;
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      priceId: string;
      returnUrl: string;
      environment: StripeEnv;
      creatorId?: string;
    }) => {
      if (!/^[a-zA-Z0-9_-]+$/.test(data.priceId)) throw new Error("Invalid priceId");
      if (data.creatorId && !/^[a-zA-Z0-9_-]+$/.test(data.creatorId))
        throw new Error("Invalid creatorId");
      return data;
    },
  )
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    try {
      const { userId, supabase } = context;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const stripe = createStripeClient(data.environment);

      const prices = await stripe.prices.list({ lookup_keys: [data.priceId] });
      if (!prices.data.length) throw new Error("Price not found");
      const stripePrice = prices.data[0];
      const isRecurring = stripePrice.type === "recurring";

      const customerId = await resolveOrCreateCustomer(stripe, {
        email: user?.email ?? undefined,
        userId,
      });

      let productDescription: string | undefined;
      if (!isRecurring) {
        const pid =
          typeof stripePrice.product === "string"
            ? stripePrice.product
            : stripePrice.product.id;
        const product = await stripe.products.retrieve(pid);
        productDescription = product.name;
      }

      const meta: Record<string, string> = { userId, priceId: data.priceId };
      if (data.creatorId) meta.creatorId = data.creatorId;

      // Pix é suportado para pagamentos únicos em BRL; assinaturas ficam com cartão.
      const isBRL = (stripePrice.currency ?? "").toLowerCase() === "brl";
      const paymentMethodTypes: string[] = isRecurring
        ? ["card"]
        : isBRL
          ? ["card", "pix"]
          : ["card"];

      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        mode: isRecurring ? "subscription" : "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        customer: customerId,
        payment_method_types: paymentMethodTypes as any,
        metadata: meta,
        ...(!isRecurring && {
          payment_intent_data: { description: productDescription, metadata: meta },
        }),
        ...(isRecurring && { subscription_data: { metadata: meta } }),
      });

      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { returnUrl?: string; environment: StripeEnv }) => data)
  .handler(async ({ data, context }): Promise<PortalResult> => {
    const { supabase, userId } = context;
    const { data: sub, error } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !sub?.stripe_customer_id)
      return { error: "Nenhuma assinatura encontrada" };

    try {
      const stripe = createStripeClient(data.environment);
      const portal = await stripe.billingPortal.sessions.create({
        customer: sub.stripe_customer_id,
        ...(data.returnUrl && { return_url: data.returnUrl }),
      });
      return { url: portal.url };
    } catch (e) {
      return { error: getStripeErrorMessage(e) };
    }
  });
