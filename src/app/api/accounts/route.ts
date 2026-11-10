import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hashPassword } from "@/lib/auth";
import { getPersonNameError } from "@/lib/person-name";
import { isValidStudentId, normalizeStudentId, STUDENT_ID_ERROR_MESSAGE } from "@/lib/student-id";

const SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  studentId: true,
  adminId: true,
  cardBarcode: true,
  isActive: true,
  createdAt: true,
  _count: { select: { claims: true } },
} as const;

// GET /api/accounts?q=&status=active|disabled|no_barcode&role= — admin lists accounts
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || "";
    const status = searchParams.get("status") || "";
    const role = searchParams.get("role") || "";

    const where: any = {};
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { studentId: { contains: q, mode: "insensitive" } },
        { cardBarcode: { contains: q, mode: "insensitive" } },
      ];
    }
    if (status === "active") where.isActive = true;
    if (status === "disabled") where.isActive = false;
    if (status === "no_barcode") where.cardBarcode = null;
    if (role === "STUDENT" || role === "ADMIN") where.role = role as any;

    const users = await prisma.user.findMany({
      where,
      select: SAFE_SELECT,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: users });
  } catch (e) {
    console.error("Accounts list failed", e);
    return NextResponse.json({ success: false, error: "Failed to list accounts" }, { status: 500 });
  }
}

// POST /api/accounts — admin helps register a student (or admin) account
export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });

  try {
    const body = await request.json();
    const { name, email, password, studentId, adminId, cardBarcode, role } = body;

    const cleanName = String(name || "").trim().replace(/\s+/g, " ");
    const nameError = getPersonNameError(cleanName);
    if (nameError) {
      return NextResponse.json({ success: false, error: nameError }, { status: 400 });
    }
    if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ success: false, error: "Valid email required" }, { status: 400 });
    }
    const targetRole = role === "ADMIN" ? "ADMIN" : "STUDENT";
    if (targetRole === "STUDENT" && !email.trim().toLowerCase().endsWith("@student.tarc.edu.my")) {
      return NextResponse.json({ success: false, error: "Student email must be a @student.tarc.edu.my address" }, { status: 400 });
    }
    if (!password || String(password).length < 8) {
      return NextResponse.json({ success: false, error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const cleanBarcode = typeof cardBarcode === "string" ? cardBarcode.trim() : "";
    if (targetRole === "STUDENT" && !cleanBarcode) {
      return NextResponse.json({ success: false, error: "Card barcode is required for student accounts" }, { status: 400 });
    }
    if (cleanBarcode && !/^[0-9]{10}$/.test(cleanBarcode)) {
      return NextResponse.json({ success: false, error: "Card barcode must be exactly 10 digits" }, { status: 400 });
    }

    const cleanStudentId = targetRole === "STUDENT" ? normalizeStudentId(String(studentId || "")) : "";
    if (cleanStudentId && !isValidStudentId(cleanStudentId)) {
      return NextResponse.json({ success: false, error: STUDENT_ID_ERROR_MESSAGE }, { status: 400 });
    }

    const dupeEmail = await prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: "insensitive" } },
    });
    if (dupeEmail) return NextResponse.json({ success: false, error: "Email already registered" }, { status: 409 });
    if (cleanStudentId) {
      const dupeStudentId = await prisma.user.findFirst({
        where: { studentId: { equals: cleanStudentId, mode: "insensitive" } },
      });
      if (dupeStudentId) return NextResponse.json({ success: false, error: "Student ID already registered" }, { status: 409 });
    }
    if (cleanBarcode) {
      const dupeBarcode = await prisma.user.findUnique({ where: { cardBarcode: cleanBarcode } });
      if (dupeBarcode) return NextResponse.json({ success: false, error: "Barcode already registered" }, { status: 409 });
    }

    const created = await prisma.user.create({
      data: {
        name: cleanName,
        email: email.trim().toLowerCase(),
        password: await hashPassword(String(password)),
        role: targetRole as any,
        studentId: cleanStudentId || null,
        adminId: targetRole === "ADMIN" ? (adminId?.trim() || null) : null,
        cardBarcode: cleanBarcode || null,
      },
      select: { id: true, name: true, email: true, role: true, studentId: true, adminId: true, cardBarcode: true, isActive: true, createdAt: true },
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") {
      return NextResponse.json({ success: false, error: "Barcode, student ID or email already registered" }, { status: 409 });
    }
    console.error("Account creation failed", e);
    return NextResponse.json({ success: false, error: "Failed to create account" }, { status: 500 });
  }
}
