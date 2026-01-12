import { getRequestURL, sendRedirect } from 'h3'

export default defineEventHandler(async (event) => {
  const origin = getRequestURL(event).origin
  // Sin `preview=true` vuelves a “published mode”
  return sendRedirect(event, new URL('/', origin).toString(), 307)
})
