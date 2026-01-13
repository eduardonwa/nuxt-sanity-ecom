// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxtjs/sanity'],
  runtimeConfig: {
    sanityWebhookSecret: process.env.SANITY_WEBHOOK_SECRET,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    // solo para el Server Route (Nitro)
    sanityServer: {
      projectId: process.env.SANITY_PROJECT_ID,
      dataset: process.env.SANITY_DATASET,
      apiVersion: process.env.SANITY_API_VERSION,
      token: process.env.SANITY_WRITE_TOKEN,
    },
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    }
  },
  sanity: {
    projectId: process.env.SANITY_PROJECT_ID,
    dataset: process.env.SANITY_DATASET,
    apiVersion: process.env.SANITY_API_VERSION,
    useCdn: true,
    visualEditing: {
      token: process.env.SANITY_VIEWER_TOKEN,
      studioUrl: process.env.SANITY_STUDIO_URL
    }
  },
  vite: {
    server: {
      allowedHosts: ['.ngrok-free.app']
    }
  }
})