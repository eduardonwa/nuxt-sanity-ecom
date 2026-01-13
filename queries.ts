export type PageResult = { title: string }
export const pageQuery = /* groq */ `*[_type == "page"][0]{title}`

export type VariantResult = {
  _id: string
  format?: string
  price: number
  currency: string
  stock?: number
  title?: string
}

export const firstVariantQuery = /* groq */ `
  *[_type == "variant"][0]{
    _id,
    format,
    price,
    currency,
    stock,
    "title": product->name
  }
`