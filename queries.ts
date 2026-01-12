export type PageResult = { title: string }
export const pageQuery = /* groq */ `*[_type == "page"][0]{title}`