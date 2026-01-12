import { defineField, defineType } from "sanity";

export const productType = defineType({
    name: "product",
    type: "document",
    title: "Producto",
    fields: [
        defineField({
            name: 'cover',
            title: 'Portada',
            type: 'image',
            options: { hotspot: true },
        }),
        defineField({
            name: 'name',
            type: 'string',
            title: 'Nombre',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'slug',
            type: 'slug',
            title: 'Slug',
            options: {
                source: 'name',
                maxLength: 96
            },
            validation: (Rule) => Rule.required(),
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
            type: 'string',
            title: 'Inventario'
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