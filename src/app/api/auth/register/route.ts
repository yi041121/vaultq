import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, generateToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let { name, studentId, adminId, cardBarcode, email, password } = body;
    if (cardBarcode === "") cardBarcode = null;
    if (cardBarcode && !/^[0-9]{10}$/.test(cardBarcode)) {
      return NextResponse.json({ success: false, error: "Card barcode must be exactly 10 digits (e.g. 2000132602)" }, { status: 400 });
    }
    if (cardBarcode) {
      const existing = await prisma.user.findUnique({ where: { cardBarcode } });
      if (existing) return NextResponse.json({ success: false, error: "Barcode already registered" }, { status: 409 });
    }

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name,
        studentId,
        adminId,
        cardBarcode,
        email,
        password: hashedPassword,
        role: studentId ? "STUDENT" : adminId ? "ADMIN" : "STUDENT",
      },
      select: { id: true, name: true, email: true, role: true, cardBarcode: true },
    });

    const token = generateToken({ userId: user.id, role: user.role });

    return NextResponse.json({ success: true, data: { user, token } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Registration failed" }, { status: 500 });
  }
}