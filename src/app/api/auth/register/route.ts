import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { withDbRetry } from "@/lib/db-retry";
import { getPersonNameError } from "@/lib/person-name";
import { isValidStudentId, normalizeStudentId, STUDENT_ID_ERROR_MESSAGE } from "@/lib/student-id";
import { isSameOriginAuthRequest } from "@/lib/session-cookie";
import { enforceAuthRateLimit } from "@/lib/auth-rate-limit";

// Public self-registration is student-only. Staff accounts must be created
// through the authenticated, admin-only /api/accounts endpoint.
export async function POST(request: NextRequest) {
  if (!isSameOriginAuthRequest(request)) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ success: false, error: "Invalid registration details" }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  if (input.adminId !== undefined || (input.role !== undefined && input.role !== "STUDENT")) {
    return NextResponse.json({ success: false, error: "Public registration is for students only" }, { status: 403 });
  }
  try {
    const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
    const nameError = getPersonNameError(name);
    if (nameError) {
      return NextResponse.json({ success: false, error: nameError }, { status: 400 });
    }
    if (typeof input.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
      return NextResponse.json({ success: false, error: "Valid email address required" }, { status: 400 });
    }
    // Normalize: store and compare emails in lowercase (case-insensitive matching)
    const email = input.email.trim().toLowerCase();
    // Students must register with their TARC student email
    if (!email.endsWith("@student.tarc.edu.my")) {
      return NextResponse.json({ success: false, error: "Email must be your @student.tarc.edu.my address" }, { status: 400 });
    }
    const cardBarcode = typeof input.cardBarcode === "string" ? input.cardBarcode.trim() : "";
    if (!cardBarcode) {
      return NextResponse.json(
        { success: false, error: "Card barcode is required. Upload a previous card photo or ask an admin to register you." },
        { status: 400 },
      );
    }
    const password = input.password;
    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ success: false, error: "Password must be at least 8 characters" }, { status: 400 });
    }
    if (!/^[0-9]{10}$/.test(cardBarcode)) {
      return NextResponse.json({ success: false, error: "Card barcode must be exactly 10 digits (e.g. 2000132602)" }, { status: 400 });
    }
    if (input.studentId != null && typeof input.studentId !== "string") {
      return NextResponse.json({ success: false, error: STUDENT_ID_ERROR_MESSAGE }, { status: 400 });
    }
    const studentId = typeof input.studentId === "string" ? normalizeStudentId(input.studentId) : "";
    if (studentId && !isValidStudentId(studentId)) {
      return NextResponse.json({ success: false, error: STUDENT_ID_ERROR_MESSAGE }, { status: 400 });
    }
    const limited = await enforceAuthRateLimit(request, "register");
    if (limited) return limited;
    if (cardBarcode) {
      const existing = await withDbRetry(() => prisma.user.findUnique({ where: { cardBarcode } }));
      if (existing) return NextResponse.json({ success: false, error: "Barcode already registered" }, { status: 409 });
    }
    if (email) {
      const dupeEmail = await withDbRetry(() =>
        prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
        })
      );
      if (dupeEmail) return NextResponse.json({ success: false, error: "Email already registered" }, { status: 409 });
    }

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name,
        studentId: studentId || null,
        cardBarcode,
        email,
        password: hashedPassword,
        role: "STUDENT",
      },
      select: { id: true, name: true, email: true, role: true, cardBarcode: true },
    });

    return NextResponse.json({ success: true, data: { user } }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") {
      return NextResponse.json({ success: false, error: "Barcode, student ID or email already registered" }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: "Registration failed" }, { status: 500 });
  }
}
