import { defineField, defineType } from "sanity";

export const variantType = defineType({
    name: 'variant',
    type: 'document',
    title: 'Variante',
    fields: [
        defineField({
            name: 'product',
            type: 'reference',
            title: 'Álbum',
            to: [{ type: 'product' }],
            validation: (Rule) => Rule.required()
        }),
        defineField({
            name: 'format',
            type: 'string',
            title: 'Formato',
            options: {
                list: [
                    "Vinyl",
                    "CD",
                    "Cassette",
                    "Digital"
                ]
            },
            validation: (Rule) => Rule.required()
        }),
        defineField({
            name: 'price',
            type: 'number',
            title: 'Precio',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'currency',
            type: 'string',
            title: 'Moneda',
            initialValue: 'mxn',
            options: {
                list: [
                    { title: 'MXN', value: 'mxn' },
                    { title: 'USD', value: 'usd' }
                ],
                layout: 'radio',
            },
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'stock',
            type: 'number',
            title: 'Inventario',
            initialValue: 0,
            validation: (Rule) => Rule.min(0)
        }),
        defineField({
            name: 'stripeProductId',
            type: 'string',
            title: 'Stripe Product ID',
            readOnly: true
        }),
        defineField({
            name: 'stripePriceId',
            type: 'string',
            title: 'Stripe Price ID',
            readOnly: true
        }),
        defineField({
            name: 'stripePriceActive',
            type: 'boolean',
            title: 'Stripe Price activo',
            readOnly: true
        }),
    ]
})