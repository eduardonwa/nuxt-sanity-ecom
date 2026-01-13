import Stripe from "stripe";
import { createClient } from "@sanity/client";
import crypto from "node:crypto";

type Body = {
  items: Array<{ variantId: string; quantity: number }>;
  customer?: { email?: string };
};

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  if (!config.stripeSecretKey) {
    throw createError({ statusCode: 500, statusMessage: "Missing STRIPE_SECRET_KEY" });
  }
  const sanityCfg = config.sanityServer;
  if (!sanityCfg?.projectId || !sanityCfg?.dataset || !sanityCfg?.token) {
    throw createError({ statusCode: 500, statusMessage: "Missing sanityServer config/token" });
  }

  const body = await readBody<Body>(event);
  if (!body?.items?.length) {
    throw createError({ statusCode: 400, statusMessage: "No items provided" });
  }

  // Sanitiza quantities
  for (const i of body.items) {
    if (!i.variantId || !Number.isFinite(i.quantity) || i.quantity < 1) {
      throw createError({ statusCode: 400, statusMessage: "Invalid items" });
    }
  }

  const sanity = createClient({
    projectId: sanityCfg.projectId,
    dataset: sanityCfg.dataset,
    apiVersion: sanityCfg.apiVersion,
    token: sanityCfg.token,
    useCdn: false,
  });

  const variantIds = body.items.map((i) => i.variantId);

  // Trae variantes con stock + priceId + info útil
  const variants = await sanity.fetch<Array<{
    _id: string;
    _rev: string;
    stock: number;
    stripePriceId?: string;
    currency?: string;
    price?: number;
    product?: { _ref: string };
    format?: string;
    title?: string;
  }>>(
    `*[_type=="variant" && _id in $ids]{
      _id, _rev, stock, stripePriceId, currency, price,
      format,
      "title": product->name,
      product
    }`,
    { ids: variantIds }
  );

  const byId = new Map(variants.map((v) => [v._id, v]));

  // Validación de stock (momento actual)
  for (const item of body.items) {
    const v = byId.get(item.variantId);
    if (!v) throw createError({
      statusCode: 400,
      statusMessage: `Variant not found: ${item.variantId}`
    });

    if (!v.stripePriceId) throw createError({
      statusCode: 400,
      statusMessage: `Variant missing stripePriceId: ${v.title || v._id}`
    });
    
    if (!Number.isFinite(v.stock) || v.stock < item.quantity) {
      throw createError({
        statusCode: 409,
        statusMessage: `No hay stock suficiente: ${v.title || v._id}`
      });
    }
  }

  // Crea orden "pending" en Sanity (guardamos items y lo que quieres mostrar)
  const orderDoc = await sanity.create({
    _type: "order",
    status: "pending",
    createdAt: new Date().toISOString(),
    customerEmail: body.customer?.email || null,
    items: body.items.map((i) => ({
      _type: "orderItem",
      _key: crypto.randomUUID(),
      variant: { _type: "reference", _ref: i.variantId },
      quantity: i.quantity,
      stripePriceId: byId.get(i.variantId)!.stripePriceId,
      title: byId.get(i.variantId)!.title || null,
      format: byId.get(i.variantId)!.format || null,
    })),
  });

  const stripe = new Stripe(config.stripeSecretKey);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: body.items.map((i) => ({
      price: byId.get(i.variantId)!.stripePriceId!,
      quantity: i.quantity,
    })),
    success_url: `${config.public.siteUrl}/pago-exitoso?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.public.siteUrl}/pago-cancelado`,
    metadata: {
      orderId: orderDoc._id,
    },
    // opcional: si tienes email
    customer_email: body.customer?.email,
  });

  // guardamos session id en la orden
  await sanity.patch(orderDoc._id).set({
    stripeCheckoutSessionId: session.id,
  }).commit();

  return { url: session.url };
});
