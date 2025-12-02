import { NextRequest, NextResponse } from 'next/server';

/**
 * API route to register escrow contract addresses.
 * This endpoint receives escrow addresses after deployment and stores them.
 *
 * POST /api/register-escrow
 * Body: { escrowAddress: string, debtPoolAddress: string, secretKey: string }
 * Returns: 201 Created
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { escrowAddress, debtPoolAddress, secretKey } = body;

    // Validate input
    if (!escrowAddress || typeof escrowAddress !== 'string') {
      return NextResponse.json(
        { error: 'Invalid escrow address' },
        { status: 400 }
      );
    }

    if (!debtPoolAddress || typeof debtPoolAddress !== 'string') {
      return NextResponse.json(
        { error: 'Invalid debt pool address' },
        { status: 400 }
      );
    }

    if (!secretKey || typeof secretKey !== 'string') {
      return NextResponse.json(
        { error: 'Invalid secret key' },
        { status: 400 }
      );
    }

    console.log('[register-escrow API] Registering escrow:', {
      escrowAddress,
      debtPoolAddress,
      secretKey: secretKey.substring(0, 10) + '...', // Only log partial key for security
    });

    // TODO: In production, you might want to:
    // 1. Store this in a database (escrowAddress, debtPoolAddress, secretKey)
    // 2. Validate the addresses are valid Aztec addresses
    // 3. Verify the escrow contract is actually deployed
    // 4. Associate with the authenticated user
    // 5. Encrypt the secretKey before storing

    // For now, we just log it since storage is handled client-side via localStorage
    console.log('[register-escrow API] Escrow registered successfully');

    return NextResponse.json(
      {
        success: true,
        message: 'Escrow registered successfully',
        escrowAddress,
        debtPoolAddress,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[register-escrow API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
