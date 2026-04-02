import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Order cancellations and refunds are not available on the website.' },
    { status: 403 }
  );
}
