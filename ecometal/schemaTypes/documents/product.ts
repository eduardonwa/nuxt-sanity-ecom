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
            name: 'bandOrArtist',
            type: 'string',
            title: 'Banda/artista',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'label',
            type: 'string',
            title: 'Sello'
        }),
        defineField({
            name: 'releaseDate',
            type: 'string',
            title: 'Fecha de lanzamiento'
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
        })
    ]
})