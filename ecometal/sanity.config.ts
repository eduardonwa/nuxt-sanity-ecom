import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'
import { presentationTool } from 'sanity/presentation'

export default defineConfig({
  name: 'default',
  title: 'ecometal',

  projectId: 'mkykc0tq',
  dataset: 'production',

  plugins: [
    structureTool(),
    visionTool(),
    presentationTool({
      previewUrl: {
        origin: 'http://localhost:3000',
        preview: '/',
        previewMode: {
          enable: '/preview/enable',
          disable: '/preview/disable'
        },
      },
      allowOrigins: ['http://localhost:*']
    })
  ],

  schema: {
    types: schemaTypes,
  },
})
