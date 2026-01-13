import Stripe from "stripe";
import { createClient } from "@sanity/client";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  if (!config.stripeSecretKey || !config.stripeWebhookSecret) {
    throw createError({ statusCode: 500, statusMessage: "Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET" });
  }

  const sanityCfg = config.sanityServer;
  if (!sanityCfg?.projectId || !sanityCfg?.dataset || !sanityCfg?.token) {
    throw createError({ statusCode: 500, statusMessage: "Missing sanityServer config/token" });
  }

  const sig = getHeader(event, "stripe-signature");
  if (!sig) {
    throw createError({ statusCode: 400, statusMessage: "Missing stripe-signature" });
  }

  // Nitro: readRawBody regresa string|null
  const rawBody = (await readRawBody(event)) || "";

  const stripe = new Stripe(config.stripeSecretKey);

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, config.stripeWebhookSecret);
  } catch (err: any) {
    console.error("Stripe signature verification failed:", err?.message);
    throw createError({ statusCode: 400, statusMessage: "Invalid Stripe signature" });
  }

  // Solo procesamos lo que importa
  if (stripeEvent.type !== "checkout.session.completed" && stripeEvent.type !== "checkout.session.expired") {
    return { received: true };
  }

  const sanity = createClient({
    projectId: sanityCfg.projectId,
    dataset: sanityCfg.dataset,
    apiVersion: sanityCfg.apiVersion,
    token: sanityCfg.token,
    useCdn: false,
  });

  if (stripeEvent.type === "checkout.session.expired") {
    const session = stripeEvent.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;
    if (orderId) {
      await sanity.patch(orderId).set({ status: "expired" }).commit();
    }
    return { received: true };
  }

  // checkout.session.completed
  const session = stripeEvent.data.object as Stripe.Checkout.Session;

  // Solo si está pagada
  if (session.payment_status !== "paid") {
    return { received: true };
  }

  const orderId = session.metadata?.orderId;
  if (!orderId) {
    console.warn("checkout.session.completed without orderId metadata");
    return { received: true };
  }

  const order = await sanity.fetch<{
    _id: string;
    _rev: string;
    status: string;
    items: Array<{ quantity: number; variant: { _id: string; _rev: string; stock: number } }>;
  }>(
    `*[_type=="order" && _id==$id][0]{
      _id, _rev, status,
      items[]{ quantity, variant->{ _id, _rev, stock } }
    }`,
    { id: orderId }
  );

  if (!order) return { received: true };
  if (order.status === "paid") return { received: true };

  // Validar stock de nuevo
  for (const it of order.items || []) {
    const stock = Number(it.variant?.stock ?? 0);
    if (!Number.isFinite(stock) || stock < it.quantity) {
      await sanity.patch(orderId).set({
        status: "out_of_stock",
        stripeCheckoutSessionId: session.id,
        stripePaymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : null,
      }).commit();

      return { received: true };
    }
  }

  // Transacción: decrement stock + marcar paid
  let tx = sanity.transaction();

  for (const it of order.items || []) {
    tx = tx.patch(
      sanity.patch(it.variant._id)
        .ifRevisionId(it.variant._rev)
        .dec({ stock: it.quantity })
    );
  }

  tx = tx.patch(
    sanity.patch(orderId)
      .ifRevisionId(order._rev)
      .set({
        status: "paid",
        paidAt: new Date().toISOString(),
        stripeCheckoutSessionId: session.id,
        stripePaymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : null,
      })
  );

  await tx.commit();

  return { received: true };
});
