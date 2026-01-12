import Stripe from "stripe";
import { createClient } from "@sanity/client";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  if (!config.stripeSecretKey || !config.stripeWebhookSecret) {
    throw createError({ statusCode: 500, statusMessage: "Missing Stripe webhook config" });
  }
  const sanityCfg = config.sanityServer;
  if (!sanityCfg?.projectId || !sanityCfg?.dataset || !sanityCfg?.token) {
    throw createError({ statusCode: 500, statusMessage: "Missing sanityServer config/token" });
  }

  const stripe = new Stripe(config.stripeSecretKey);

  const sig = getHeader(event, "stripe-signature");
  if (!sig) {
    throw createError({ statusCode: 400, statusMessage: "Missing stripe-signature" });
  }

  const rawBody = (await readRawBody(event))?.toString();
  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: "Missing raw body" });
  }

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, config.stripeWebhookSecret);
  } catch (err: any) {
    throw createError({ statusCode: 400, statusMessage: `Webhook signature verification failed: ${err.message}` });
  }

  const sanity = createClient({
    projectId: sanityCfg.projectId,
    dataset: sanityCfg.dataset,
    apiVersion: sanityCfg.apiVersion,
    token: sanityCfg.token,
    useCdn: false,
  });

  // Helper: intenta aplicar descuento stock con control de concurrencia simple
  async function finalizeOrderPaid(orderId: string, session: Stripe.Checkout.Session) {
    // Trae orden y variantes actuales (con _rev) para evitar conflictos
    const order = await sanity.fetch<any>(
      `*[_type=="order" && _id==$id][0]{
        _id, _rev, status,
        items[]{ quantity, variant->{ _id, _rev, stock } }
      }`,
      { id: orderId }
    );

    if (!order) return;
    if (order.status === "paid") return;

    // Validar stock nuevamente (momento pago)
    for (const it of order.items || []) {
      const v = it.variant;
      if (!v || !Number.isFinite(v.stock) || v.stock < it.quantity) {
        await sanity.patch(orderId).set({
          status: "out_of_stock",
          stripeCheckoutSessionId: session.id,
          stripePaymentStatus: session.payment_status,
        }).commit();
        return;
      }
    }

    // Transacción: descuenta y marca orden pagada
    // Nota: Sanity no tiene "condición stock>=x" nativa; aquí usamos _rev para detectar cambios concurrentes.
    let tx = sanity.transaction();

    for (const it of order.items || []) {
      const v = it.variant;
      tx = tx.patch(v._id, (p: any) => p.ifRevisionId(v._rev).dec({ stock: it.quantity }));
    }

    tx = tx.patch(orderId, (p: any) =>
      p.ifRevisionId(order._rev).set({
        status: "paid",
        paidAt: new Date().toISOString(),
        stripeCheckoutSessionId: session.id,
        stripePaymentStatus: session.payment_status,
        stripeCustomerEmail: session.customer_details?.email || null,
        stripePaymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : null,
      })
    );

    try {
      await tx.commit();
    } catch {
      // Si hubo conflicto (alguien cambió stock entre fetch y commit), reintenta una vez
      const order2 = await sanity.fetch<any>(
        `*[_type=="order" && _id==$id][0]{
          _id, _rev, status,
          items[]{ quantity, variant->{ _id, _rev, stock } }
        }`,
        { id: orderId }
      );
      if (!order2 || order2.status === "paid") return;

      for (const it of order2.items || []) {
        const v = it.variant;
        if (!v || v.stock < it.quantity) {
          await sanity.patch(orderId).set({ status: "out_of_stock" }).commit();
          return;
        }
      }

      let tx2 = sanity.transaction();
      for (const it of order2.items || []) {
        tx2 = tx2.patch(it.variant._id, (p: any) => p.ifRevisionId(it.variant._rev).dec({ stock: it.quantity }));
      }
      tx2 = tx2.patch(orderId, (p: any) => p.ifRevisionId(order2._rev).set({ status: "paid" }));

      await tx2.commit();
    }
  }

  // --- Manejo de eventos ---
  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;

    if (session.payment_status === "paid" && orderId) {
      await finalizeOrderPaid(orderId, session);
    }
  }

  if (stripeEvent.type === "checkout.session.expired") {
    const session = stripeEvent.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;
    if (orderId) {
      await sanity.patch(orderId).set({ status: "expired" }).commit();
    }
  }

  // Stripe requiere 2xx
  return { received: true };
});
