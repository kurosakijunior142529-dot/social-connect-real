import { createFileRoute } from "@tanstack/react-router";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

const COIN_MAP: Record<string, number> = {
  coins_100: 100,
  coins_500: 500,
  coins_2000: 2000,
};

function resolvePriceId(item: any): string {
  return (
    item?.price?.lookup_key ||
    item?.price?.metadata?.lovable_external_id ||
    item?.price?.id ||
    ""
  );
}

async function notifyUser(userId: string, actorId: string, type: string, meta: any) {
  await getSupabase()
    .from("notifications")
    .insert({
      user_id: userId,
      actor_id: actorId,
      type,
      entity_type: "subscription",
      entity_id: null,
      metadata: meta,
    });
}

async function handleSubscriptionCreated(sub: any, env: StripeEnv) {
  const userId = sub.metadata?.userId;
  const creatorId = sub.metadata?.creatorId;
  if (!userId) return;

  const item = sub.items?.data?.[0];
  const priceId = resolvePriceId(item);
  const productId = item?.price?.product ?? "";
  const periodStart = item?.current_period_start ?? sub.current_period_start;
  const periodEnd = item?.current_period_end ?? sub.current_period_end;

  await getSupabase()
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        stripe_subscription_id: sub.id,
        stripe_customer_id: sub.customer,
        product_id: productId,
        price_id: priceId,
        status: sub.status,
        current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: sub.cancel_at_period_end ?? false,
        environment: env,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_subscription_id" },
    );

  // Assinatura de canal → registra na tabela channel_subscriptions
  if (priceId === "channel_sub_monthly" && creatorId) {
    await getSupabase()
      .from("channel_subscriptions")
      .upsert(
        {
          subscriber_id: userId,
          creator_id: creatorId,
          tier: 1,
          stripe_subscription_id: sub.id,
          status: "active",
        },
        { onConflict: "subscriber_id,creator_id" },
      );
    await notifyUser(creatorId, userId, "channel_subscription", { tier: 1 });
  }
}

async function handleSubscriptionUpdated(sub: any, env: StripeEnv) {
  const item = sub.items?.data?.[0];
  const priceId = resolvePriceId(item);
  const productId = item?.price?.product ?? "";
  const periodStart = item?.current_period_start ?? sub.current_period_start;
  const periodEnd = item?.current_period_end ?? sub.current_period_end;

  await getSupabase()
    .from("subscriptions")
    .update({
      status: sub.status,
      product_id: productId,
      price_id: priceId,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end || false,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", sub.id)
    .eq("environment", env);

  if (priceId === "channel_sub_monthly") {
    await getSupabase()
      .from("channel_subscriptions")
      .update({ status: sub.status })
      .eq("stripe_subscription_id", sub.id);
  }
}

async function handleSubscriptionDeleted(sub: any, env: StripeEnv) {
  const userId = sub.metadata?.userId;
  await getSupabase()
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", sub.id)
    .eq("environment", env);

  await getSupabase()
    .from("channel_subscriptions")
    .update({ status: "canceled", ends_at: new Date().toISOString() })
    .eq("stripe_subscription_id", sub.id);

  // Notifica o usuário (chatbot / sino)
  if (userId) {
    await getSupabase()
      .from("notifications")
      .insert({
        user_id: userId,
        actor_id: userId,
        type: "subscription_canceled",
        entity_type: "subscription",
        entity_id: null,
        metadata: { message: "Sua assinatura foi cancelada. Você mantém acesso até o fim do período pago." },
      });
  }
}

async function handleCheckoutCompleted(session: any, env: StripeEnv) {
  if (session.mode !== "payment") return;
  const userId = session.metadata?.userId;
  if (!userId) return;

  // 1) priceId vem do metadata da sessão (definido em createCheckoutSession)
  const candidates: string[] = [];
  if (session.metadata?.priceId) candidates.push(session.metadata.priceId);

  // 2) fallback: line_items nunca vêm expandidos no evento — buscar na API
  if (!candidates.length) {
    try {
      const stripe = createStripeClient(env);
      const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
      for (const li of items.data) {
        const p: any = li.price;
        const id = p?.lookup_key || p?.metadata?.lovable_external_id || p?.id;
        if (id) candidates.push(id);
      }
    } catch (e) {
      console.error("listLineItems failed:", e);
    }
  }

  for (const priceId of candidates) {
    const coins = COIN_MAP[priceId];
    if (!coins) continue;
    // Idempotência via unique constraint no stripe_session_id
    const { error: insertError } = await getSupabase().from("coin_purchases").insert({
      user_id: userId,
      stripe_session_id: session.id,
      price_id: priceId,
      coins,
      amount_paid: session.amount_total ?? 0,
      currency: session.currency ?? "brl",
      environment: env,
    });
    if (!insertError) {
      await getSupabase().rpc("credit_coins", { _user: userId, _amount: coins });
    }
  }
}


export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          return Response.json({ received: true, ignored: "invalid env" });
        }
        const env: StripeEnv = rawEnv;
        try {
          const event = await verifyWebhook(request, env);
          switch (event.type) {
            case "customer.subscription.created":
              await handleSubscriptionCreated(event.data.object, env);
              break;
            case "customer.subscription.updated":
              await handleSubscriptionUpdated(event.data.object, env);
              break;
            case "customer.subscription.deleted":
              await handleSubscriptionDeleted(event.data.object, env);
              break;
            case "checkout.session.completed":
              await handleCheckoutCompleted(event.data.object, env);
              break;
            default:
              console.log("Unhandled event:", event.type);
          }
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
