import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MenuFamPlan',
    short_name: 'MenuFamPlan',
    description: 'Familienplanung mit Rémy – was kochen wir?',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1D9E75',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
