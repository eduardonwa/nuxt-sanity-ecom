import Stripe from "stripe";
import { createClient } from "@sanity/client";
import "dotenv/config";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const sanity = createClient({
  projectId: process.env.SANITY_PROJECT_ID,
  dataset: process.env.SANITY_DATASET,
  apiVersion: process.env.SANITY_API_VERSION || "2025-02-19",
  token: process.env.SANITY_WRITE_TOKEN,
  useCdn: false,
});

function pesosFromUnitAmount(unitAmount) {
  return Math.round(unitAmount) / 100;
}

async function getActiveOneTimePriceId(productId) {
  // Trae prices del producto y elige uno activo one_time
  const prices = await stripe.prices.list({ product: productId, limit: 100 });
  const active = prices.data.find((p) => p.active && p.type === "one_time");
  return active || null;
}

async function main() {
  let startingAfter = undefined;
  let total = 0;

  while (true) {
    const page = await stripe.products.list({ limit: 100, starting_after: startingAfter });
    if (!page.data.length) break;

    for (const p of page.data) {
      const price = await getActiveOneTimePriceId(p.id);
      if (!price) {
        console.log("SKIP (no active one_time price):", p.id, p.name);
        continue;
      }

      const doc = {
        _type: "product",
        name: p.name,
        price: pesosFromUnitAmount(price.unit_amount ?? 0),
        currency: (price.currency || "mxn").toLowerCase(),
        stripeProductId: p.id,
        stripePriceId: price.id,
        stripePriceActive: true,
        // Opcional: si ya tienes imágenes en Stripe
        // coverUrlStripe: p.images?.[0] || null,
      };

      // Upsert por stripeProductId (evita duplicados)
      const existing = await sanity.fetch(
        `*[_type=="product" && stripeProductId==$pid][0]{ _id }`,
        { pid: p.id }
      );

      if (existing?._id) {
        await sanity.patch(existing._id).set(doc).commit();
        console.log("UPDATED:", p.name, p.id, price.id);
      } else {
        await sanity.create(doc);
        console.log("CREATED:", p.name, p.id, price.id);
      }

      total++;
    }

    startingAfter = page.data[page.data.length - 1].id;
    if (!page.has_more) break;
  }

  console.log("Done. Total upserted:", total);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
