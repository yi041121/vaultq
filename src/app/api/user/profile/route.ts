import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { getPersonNameError } from "@/lib/person-name";
import { isValidStudentId, normalizeStudentId, STUDENT_ID_ERROR_MESSAGE } from "@/lib/student-id";

// Treat legacy literal "null"/"undefined" values as empty.
function cleanStudentId(value: unknown): string | null {
  const sid = String(value ?? "").trim();
  if (!sid || /^(null|undefined)$/i.test(sid)) return null;
  return sid.toUpperCase();
}

// GET /api/user/profile — fresh profile data (source of truth for the profile page)
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true, email: true, role: true, studentId: true, cardBarcode: true },
    });
    if (!profile) return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: { ...profile, studentId: cleanStudentId(profile.studentId) } });
  } catch (e) {
    console.error("Profile fetch failed", e);
    return NextResponse.json({ success: false, error: "Failed to fetch profile" }, { status: 500 });
  }
}

// PATCH /api/user/profile — student updates own name, student ID and card barcode.
export async function PATCH(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = String(body.name ?? "").trim().replace(/\s+/g, " ");
      const nameError = getPersonNameError(name);
      if (nameError) {
        return NextResponse.json({ success: false, error: nameError }, { status: 400 });
      }
      data.name = name;
    }

    if (body.studentId !== undefined) {
      const raw = String(body.studentId ?? "").trim();
      if (!raw || /^(null|undefined)$/i.test(raw)) {
        data.studentId = null;
      } else {
        const sid = normalizeStudentId(raw);
        if (!isValidStudentId(sid)) {
          return NextResponse.json({ success: false, error: STUDENT_ID_ERROR_MESSAGE }, { status: 400 });
        }
        // Case-insensitive duplicate check against every other account.
        const dupe = await prisma.user.findFirst({
          where: { studentId: { equals: sid, mode: "insensitive" }, NOT: { id: user.id } },
        });
        if (dupe) {
          return NextResponse.json({ success: false, error: "Student ID already registered" }, { status: 409 });
        }
        data.studentId = sid;
      }
    }

    if (body.cardBarcode !== undefined) {
      const barcode = String(body.cardBarcode ?? "").trim();
      if (!/^[0-9]{10}$/.test(barcode)) {
        return NextResponse.json({ success: false, error: "Card barcode must be exactly 10 digits" }, { status: 400 });
      }
      // The barcode is immutable once assigned. Only legacy accounts without
      // a barcode may set one; changes must be made by an admin.
      if (user.cardBarcode) {
        if (barcode !== user.cardBarcode) {
          return NextResponse.json({ success: false, error: "Card barcode cannot be changed. Contact an admin." }, { status: 403 });
        }
      } else {
        const dupe = await prisma.user.findFirst({
          where: { cardBarcode: barcode, NOT: { id: user.id } },
        });
        if (dupe) {
          return NextResponse.json({ success: false, error: "Barcode already registered" }, { status: 409 });
        }
        data.cardBarcode = barcode;
      }
    } else if (!user.cardBarcode) {
      return NextResponse.json({ success: false, error: "Card barcode is required" }, { status: 400 });
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
      select: { id: true, name: true, email: true, role: true, studentId: true, cardBarcode: true },
    });

    return NextResponse.json({ success: true, data: { ...updated, studentId: cleanStudentId(updated.studentId) } });
  } catch (e) {
    console.error("Profile update failed", e);
    return NextResponse.json({ success: false, error: "Failed to update profile" }, { status: 500 });
  }
}
