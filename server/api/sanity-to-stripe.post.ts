import Stripe from "stripe";
import { createClient } from "@sanity/client";
import { isValidSignature, SIGNATURE_HEADER_NAME } from "@sanity/webhook";
import { createImageUrlBuilder } from "@sanity/image-url";

function getDocId(payload: any): string | null {
  if (payload?._id) return payload._id;
  if (payload?.document?._id) return payload.document._id;
  if (Array.isArray(payload?.ids) && payload.ids[0]) return payload.ids[0];
  return null;
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  // 1) Validar firma (Sanity)
  if (!config.sanityWebhookSecret) {
    throw createError({ statusCode: 500, statusMessage: "Missing SANITY_WEBHOOK_SECRET" });
  }

  const signature =
    getHeader(event, SIGNATURE_HEADER_NAME) ||
    getHeader(event, SIGNATURE_HEADER_NAME.toLowerCase());

  if (!signature) {
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

  const payload = JSON.parse(rawBody);

  // 2) Configs
  if (!config.stripeSecretKey) {
    throw createError({ statusCode: 500, statusMessage: "Missing STRIPE_SECRET_KEY" });
  }

  const sanityCfg = config.sanityServer;
  if (!sanityCfg?.projectId || !sanityCfg?.dataset || !sanityCfg?.token) {
    throw createError({ statusCode: 500, statusMessage: "Missing sanityServer config/token" });
  }

  const variantId = getDocId(payload);
  if (!variantId) {
    throw createError({ statusCode: 400, statusMessage: "No variant id in webhook payload" });
  }

  const sanity = createClient({
    projectId: sanityCfg.projectId,
    dataset: sanityCfg.dataset,
    apiVersion: sanityCfg.apiVersion,
    token: sanityCfg.token,
    useCdn: false,
  });

  // 3) Traer variant + product (name/cover)
  const variant = await sanity.fetch<{
    _id: string;
    price: number;
    currency: string;
    stock?: number;
    format?: string;
    stripeProductId?: string;
    stripePriceId?: string;
    product?: {
      name?: string;
      cover?: any;
    };
  }>(
    `*[_type=="variant" && _id==$id][0]{
      _id,
      price,
      currency,
      stock,
      format,
      stripeProductId,
      stripePriceId,
      product->{
        name,
        cover
      }
    }`,
    { id: variantId }
  );

  if (!variant) throw createError({ statusCode: 404, statusMessage: "Variant not found in Sanity" });
  if (variant.price == null || !variant.currency) {
    throw createError({ statusCode: 400, statusMessage: "Missing price/currency in Variant" });
  }
  if (!variant.product?.name) {
    throw createError({ statusCode: 400, statusMessage: "Variant missing product.name" });
  }

  // Anti-error: precio en pesos
  if (variant.price > 100000) {
    throw createError({ statusCode: 400, statusMessage: "Price seems too large. Use pesos, not cents." });
  }

  // 4) Builder imagen (sale del PRODUCT)
  const builder = createImageUrlBuilder({
    projectId: sanityCfg.projectId,
    dataset: sanityCfg.dataset,
  });

  const coverUrl = variant.product.cover
    ? builder.image(variant.product.cover).width(1000).url()
    : null;

  // 5) Stripe
  const stripe = new Stripe(config.stripeSecretKey);

  // Nombre Stripe product = Album — Formato
  const stripeName = variant.format
    ? `${variant.product.name} — ${variant.format}`
    : variant.product.name;

  // Stripe product (por VARIANT)
  let stripeProductId = variant.stripeProductId;

  if (!stripeProductId) {
    const created = await stripe.products.create({
      name: stripeName,
      metadata: { sanityVariantId: variant._id },
      ...(coverUrl ? { images: [coverUrl] } : {}),
    });

    stripeProductId = created.id;

    await sanity.patch(variant._id).set({ stripeProductId }).commit();
  } else {
    await stripe.products.update(stripeProductId, {
      name: stripeName,
      ...(coverUrl ? { images: [coverUrl] } : {}),
    });
  }

  // Stripe price (crear nuevo si cambió)
  const desiredUnitAmount = Math.round(variant.price * 100);
  const desiredCurrency = variant.currency.toLowerCase();

  let stripePriceId = variant.stripePriceId;
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
      .patch(variant._id)
      .set({
        stripePriceId,
        stripePriceActive: true,
      })
      .commit();
  }

  return { ok: true, sanityVariantId: variant._id, stripeProductId, stripePriceId };
});
