import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { getPersonNameError } from "@/lib/person-name";
import { isValidStudentId, normalizeStudentId, STUDENT_ID_ERROR_MESSAGE } from "@/lib/student-id";

type Ctx = { params: Promise<{ id: string }> };

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
} as const;

// GET /api/accounts/:id — admin views one account
export async function GET(request: NextRequest, { params }: Ctx) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });
  const { id } = await params;

  try {
    const account = await prisma.user.findUnique({
      where: { id },
      select: { ...SAFE_SELECT, _count: { select: { claims: true } } },
    });
    if (!account) return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: account });
  } catch (e) {
    console.error("Account fetch failed", e);
    return NextResponse.json({ success: false, error: "Failed to fetch account" }, { status: 500 });
  }
}

// PATCH /api/accounts/:id — admin edits student details
// Body: { name?, email?, studentId? } — cardBarcode is immutable after creation.
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });
  const { id } = await params;

  try {
    const body = await request.json();
    const { name, email, studentId, cardBarcode } = body;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });

    const data: any = {};
    if (name !== undefined) {
      const clean = String(name).trim().replace(/\s+/g, " ");
      const nameError = getPersonNameError(clean);
      if (nameError) {
        return NextResponse.json({ success: false, error: nameError }, { status: 400 });
      }
      data.name = clean;
    }
    if (email !== undefined) {
      const e = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        return NextResponse.json({ success: false, error: "Valid email required" }, { status: 400 });
      }
      if (existing.role === "STUDENT" && !e.endsWith("@student.tarc.edu.my")) {
        return NextResponse.json({ success: false, error: "Student email must be a @student.tarc.edu.my address" }, { status: 400 });
      }
      const dupe = await prisma.user.findFirst({
        where: { email: { equals: e, mode: "insensitive" } },
      });
      if (dupe && dupe.id !== id) {
        return NextResponse.json({ success: false, error: "Email already registered" }, { status: 409 });
      }
      data.email = e;
    }
    if (studentId !== undefined) {
      const raw = String(studentId).trim();
      const s = raw && !/^(null|undefined)$/i.test(raw) ? normalizeStudentId(raw) : null;
      if (s && !isValidStudentId(s)) {
        return NextResponse.json({ success: false, error: STUDENT_ID_ERROR_MESSAGE }, { status: 400 });
      }
      if (s) {
        const dupe = await prisma.user.findFirst({
          where: { studentId: { equals: s, mode: "insensitive" }, NOT: { id } },
        });
        if (dupe) {
          return NextResponse.json({ success: false, error: "Student ID already registered" }, { status: 409 });
        }
      }
      data.studentId = s;
    }
    if (cardBarcode !== undefined) {
      const clean = typeof cardBarcode === "string" ? cardBarcode.trim() : "";
      if (clean && !/^[0-9]{10}$/.test(clean)) {
        return NextResponse.json({ success: false, error: "Card barcode must be exactly 10 digits" }, { status: 400 });
      }
      if (clean !== (existing.cardBarcode || "")) {
        return NextResponse.json({ success: false, error: "Card barcode cannot be changed after the account is created" }, { status: 400 });
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });
    }

    const updated = await prisma.user.update({ where: { id }, data, select: SAFE_SELECT });
    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    console.error("Account update failed", e);
    return NextResponse.json({ success: false, error: "Failed to update account" }, { status: 500 });
  }
}

// DELETE /api/accounts/:id — admin deletes account
// Guards: admins can never be deleted (own or other), students blocked if
// claims exist. Notifications + reports of the user are removed with them in
// a transaction.
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });
  const { id } = await params;

  try {
    const existing = await prisma.user.findUnique({
      where: { id },
      include: { _count: { select: { claims: true, items: true } } },
    });
    if (!existing) return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });

    if (existing.role === "ADMIN") {
      return NextResponse.json({ success: false, error: "Admin accounts cannot be deleted" }, { status: 403 });
    }
    if (existing._count.claims > 0) {
      return NextResponse.json({ success: false, error: "Cannot delete account with existing claims" }, { status: 409 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.notification.deleteMany({ where: { userId: id } });
      await tx.report.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });

    return NextResponse.json({ success: true, data: { id } });
  } catch (e) {
    console.error("Account delete failed", e);
    return NextResponse.json({ success: false, error: "Failed to delete account" }, { status: 500 });
  }
}
