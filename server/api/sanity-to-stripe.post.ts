import Stripe from "stripe";
import { createClient } from "@sanity/client";
import { isValidSignature, SIGNATURE_HEADER_NAME } from "@sanity/webhook";
import { createImageUrlBuilder } from "@sanity/image-url";

function getProductId(payload: any): string | null {
  if (payload?._id) return payload._id;
  if (payload?.document?._id) return payload.document._id;
  if (Array.isArray(payload?.ids) && payload.ids[0]) return payload.ids[0];
  return null;
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  // ✅ 1) Validar firma del webhook (sin secret en URL)
  if (!config.sanityWebhookSecret) {
    throw createError({ statusCode: 500, statusMessage: "Missing SANITY_WEBHOOK_SECRET" });
  }

  const signature =
    getHeader(event, SIGNATURE_HEADER_NAME) ||
    getHeader(event, SIGNATURE_HEADER_NAME.toLowerCase());

  if (!signature) {
    // console.log("Headers:", getHeaders(event));
    throw createError({ statusCode: 401, statusMessage: "Missing Sanity signature" });
  }

  const rawBodyBuf = await readRawBody(event);
  const rawBody = rawBodyBuf?.toString() || "";

  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: "Missing raw body" });
  }
  
  const valid = await isValidSignature(rawBody, signature, config.sanityWebhookSecret);
  if (!valid) {
    throw createError({ statusCode: 401, statusMessage: "Invalid Sanity signature" });
  }

  // ✅ 2) Ya validado → parsear JSON (NO uses readBody antes)
  const payload = JSON.parse(rawBody);

  if (!config.stripeSecretKey) {
    throw createError({ statusCode: 500, statusMessage: "Missing STRIPE_SECRET_KEY" });
  }

  const sanityCfg = config.sanityServer;
  if (!sanityCfg?.projectId || !sanityCfg?.dataset || !sanityCfg?.token) {
    throw createError({ statusCode: 500, statusMessage: "Missing sanityServer config/token" });
  }

  const productId = getProductId(payload);
  if (!productId) {
    throw createError({ statusCode: 400, statusMessage: "No product id in webhook payload" });
  }

  const sanity = createClient({
    projectId: sanityCfg.projectId,
    dataset: sanityCfg.dataset,
    apiVersion: sanityCfg.apiVersion,
    token: sanityCfg.token,
    useCdn: false,
  });

  const product = await sanity.fetch<{
    _id: string;
    name: string;
    price: number;
    currency: string;
    cover?: any;
    stripeProductId?: string;
    stripePriceId?: string;
  }>(
    `*[_type=="product" && _id==$id][0]{
        _id,
        name,
        price,
        currency,
        cover,
        stripeProductId,
        stripePriceId
      }`,
    { id: productId }
  );

  if (!product) throw createError({ statusCode: 404, statusMessage: "Product not found in Sanity" });
  if (!product.name || !product.price || !product.currency) {
    throw createError({ statusCode: 400, statusMessage: "Missing name/price/currency in Sanity" });
  }

  // (Opcional recomendado) Evitar que alguien meta centavos por error en Sanity
  // Ajusta el umbral a tu gusto:
  if (product.price > 100000) {
    throw createError({ statusCode: 400, statusMessage: "Price seems too large. Use pesos, not cents." });
  }

  const builder = createImageUrlBuilder({
    projectId: sanityCfg.projectId,
    dataset: sanityCfg.dataset,
  });

  const coverUrl = product.cover
    ? builder.image(product.cover).width(1000).url()
    : null;

  const stripe = new Stripe(config.stripeSecretKey);

  // Stripe product
  let stripeProductId = product.stripeProductId;
  if (!stripeProductId) {
    const created = await stripe.products.create({
      name: product.name,
      metadata: { sanityId: product._id },
    });
    stripeProductId = created.id;
    await sanity.patch(product._id).set({ stripeProductId }).commit();
  } else {
    await stripe.products.update(stripeProductId, {
      name: product.name,
      ...(coverUrl ? { images: [coverUrl] } : {}),
    });
  }

  // Stripe price (crear nuevo si hace falta o si cambió)
  const desiredUnitAmount = Math.round(product.price * 100); // Sanity guarda pesos
  const desiredCurrency = product.currency.toLowerCase();

  let stripePriceId = product.stripePriceId;
  let needsNewPrice = !stripePriceId;

  if (stripePriceId) {
    const existing = await stripe.prices.retrieve(stripePriceId);
    const amount = existing.unit_amount ?? 0;
    const currency = (existing.currency || "").toLowerCase();
    if (!existing.active || amount !== desiredUnitAmount || currency !== desiredCurrency) {
      needsNewPrice = true;
    }
  }

  if (needsNewPrice) {
    if (stripePriceId) {
      try {
        await stripe.prices.update(stripePriceId, { active: false });
      } catch {}
    }

    const newPrice = await stripe.prices.create({
      product: stripeProductId,
      currency: desiredCurrency,
      unit_amount: desiredUnitAmount,
    });

    stripePriceId = newPrice.id;

    await sanity
      .patch(product._id)
      .set({
        stripePriceId,
        stripePriceActive: true,
      })
      .commit();
  }

  return { ok: true, sanityId: product._id, stripeProductId, stripePriceId };
});