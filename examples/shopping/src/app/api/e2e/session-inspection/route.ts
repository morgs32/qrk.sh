import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/** Only when PLAYWRIGHT_CLAIM_INSPECTION=1 (see e2e.playwright.config.ts). Returns the Clerk user id only. */
export async function GET() {
  if (process.env.PLAYWRIGHT_CLAIM_INSPECTION !== '1') {
    return new NextResponse(null, { status: 404 });
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    userId,
  });
}
