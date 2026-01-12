import { validatePreviewUrl } from '@sanity/preview-url-secret'
import { getRequestURL, sendRedirect, setResponseStatus } from 'h3'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  // Este cliente con token es necesario para validar el secret
  const client = useSanity().client.withConfig({
    token: config.sanityViewerToken || process.env.SANITY_VIEWER_TOKEN,
    useCdn: false,
  })

  const url = getRequestURL(event).toString()

  const { isValid, redirectTo = '/' } = await validatePreviewUrl(client, url)

  if (!isValid) {
    setResponseStatus(event, 401)
    return 'Invalid secret'
  }

  // Estrategia simple para Nuxt Preview Mode:
  // Nuxt habilita preview si existe `?preview=true`. :contentReference[oaicite:4]{index=4}
  const target = new URL(redirectTo, getRequestURL(event).origin)
  target.searchParams.set('preview', 'true')

  return sendRedirect(event, target.toString(), 307)
})
