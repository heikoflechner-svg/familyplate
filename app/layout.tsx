import type { Metadata, Viewport } from 'next'
import './globals.css'
import ErrorOverlay from './ErrorOverlay'

export const metadata: Metadata = {
  title: 'FamilyPlate',
  description: 'Familienplanung mit Rémy – was kochen wir?',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}<ErrorOverlay /></body>
    </html>
  )
}
