import Stripe from "stripe";

export default defineEventHandler(async (event) => {
  
  const config = useRuntimeConfig();
  if (!config.stripeSecretKey) {
    throw createError({ statusCode: 500, statusMessage: "Missing STRIPE_SECRET_KEY" });
  }
  console.log("Stripe key loaded:", !!config.stripeSecretKey);
  
  const stripe = new Stripe(config.stripeSecretKey);

  const body = await readBody<{
    items: Array<{
      name: string;
      unit_amount: number; // centavos
      quantity: number;
      image?: string;
    }>;
  }>(event);

  if (!body?.items?.length) {
    throw createError({ statusCode: 400, statusMessage: "No items provided" });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: body.items.map((i) => ({
      quantity: i.quantity,
      price_data: {
        currency: "mxn",
        unit_amount: i.unit_amount,
        product_data: {
          name: i.name,
          ...(i.image ? { images: [i.image] } : {}),
        },
      },
    })),
    success_url: `${config.public.siteUrl}/pago-exitoso?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.public.siteUrl}/pago-cancelado`,
  });

  return { url: session.url };
});
