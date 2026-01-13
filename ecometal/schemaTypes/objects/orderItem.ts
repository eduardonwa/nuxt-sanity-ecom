import { defineField, defineType } from "sanity";

export const orderItemType = defineType({
  name: 'orderItem',
  type: 'object',
  title: 'Item de orden',
  fields: [
    defineField({
      name: 'variant',
      type: 'reference',
      to: [{ type: 'variant' }],
      title: 'Variante',
    }),
    defineField({
      name: 'quantity',
      type: 'number',
      title: 'Cantidad',
    }),
    defineField({
      name: 'stripePriceId',
      type: 'string',
      title: 'Stripe Price ID',
    }),
    defineField({
      name: 'title',
      type: 'string',
      title: 'Producto',
    }),
    defineField({
      name: 'format',
      type: 'string',
      title: 'Formato',
    }),
  ],
});
