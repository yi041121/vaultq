import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, generateToken } from "@/lib/auth";
import { getPersonNameError } from "@/lib/person-name";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let { name, studentId, adminId, cardBarcode, email, password } = body;
    name = String(name || "").trim().replace(/\s+/g, " ");
    const nameError = getPersonNameError(name);
    if (nameError) {
      return NextResponse.json({ success: false, error: nameError }, { status: 400 });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return NextResponse.json({ success: false, error: "Valid email address required" }, { status: 400 });
    }
    // Normalize: store and compare emails in lowercase (case-insensitive matching)
    email = String(email).trim().toLowerCase();
    // Students must register with their TARC student email
    if (!adminId && !email.endsWith("@student.tarc.edu.my")) {
      return NextResponse.json({ success: false, error: "Email must be your @student.tarc.edu.my address" }, { status: 400 });
    }
    if (!adminId && !cardBarcode) {
      return NextResponse.json(
        { success: false, error: "Card barcode is required. Upload a previous card photo or ask an admin to register you." },
        { status: 400 },
      );
    }
    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ success: false, error: "Password must be at least 8 characters" }, { status: 400 });
    }
    if (cardBarcode === "") cardBarcode = null;
    if (cardBarcode && !/^[0-9]{10}$/.test(cardBarcode)) {
      return NextResponse.json({ success: false, error: "Card barcode must be exactly 10 digits (e.g. 2000132602)" }, { status: 400 });
    }
    if (cardBarcode) {
      const existing = await prisma.user.findUnique({ where: { cardBarcode } });
      if (existing) return NextResponse.json({ success: false, error: "Barcode already registered" }, { status: 409 });
    }
    if (email) {
      const dupeEmail = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
      });
      if (dupeEmail) return NextResponse.json({ success: false, error: "Email already registered" }, { status: 409 });
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