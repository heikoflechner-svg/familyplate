import { NextResponse } from 'next/server'

export async function GET() {
  const key = process.env.ANTHROPIC_API_KEY
  return NextResponse.json({
    hasApiKey: !!key,
    keyLength: key?.length ?? 0,
    keyPrefix: key ? key.slice(0, 7) + '...' : null,
  })
}
