import { defineField, defineType } from "sanity";

export const orderType = defineType({
    name: 'order',
    type: 'document',
    title: 'Orden',
    fields: [
        defineField({
            name: 'status',
            type: 'string',
            title: 'Estado',
            initialValue: 'pending',
            options: {
                list: [
                    { title: 'Pendiente', value: 'pending' },
                    { title: 'Pagada', value: 'paid' },
                    { title: 'Expirada', value: 'expired' },
                    { title: 'Sin stock', value: 'out_of_stock' },
                ],
            },
        }),
        defineField({
            name: 'createdAt',
            type: 'datetime',
            title: 'Creada',
        }),
        defineField({
            name: 'paidAt',
            type: 'datetime',
            title: 'Pagada',
        }),
        defineField({
            name: 'customerEmail',
            type: 'string',
            title: 'Email cliente',
        }),
        defineField({
            name: 'items',
            type: 'array',
            title: 'Items',
            of: [{ type: 'orderItem' }],
        }),
        defineField({
            name: 'stripeCheckoutSessionId',
            type: 'string',
            title: 'Stripe Session ID',
        }),
        defineField({
            name: 'stripePaymentIntent',
            type: 'string',
            title: 'Stripe Payment Intent',
        }),
    ],
})