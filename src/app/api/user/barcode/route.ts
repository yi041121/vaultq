import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function PATCH(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { cardBarcode } = body;
    // The profile page treats the card barcode as required — never clear it here.
    if (!cardBarcode) {
      return NextResponse.json({ success: false, error: "Card barcode is required" }, { status: 400 });
    }
    if (typeof cardBarcode !== "string" || !/^[0-9]{10}$/.test(cardBarcode)) {
      return NextResponse.json({ success: false, error: "Card barcode must be exactly 10 digits" }, { status: 400 });
    }
    const existing = await prisma.user.findUnique({ where: { cardBarcode } });
    if (existing && existing.id !== user.id) {
      return NextResponse.json({ success: false, error: "Barcode already registered" }, { status: 409 });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { cardBarcode },
      select: { id: true, name: true, email: true, role: true, cardBarcode: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    console.error("Barcode update failed", e);
    return NextResponse.json({ success: false, error: "Failed to update barcode" }, { status: 500 });
  }
}
