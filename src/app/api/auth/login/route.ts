import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { comparePassword, generateToken } from "@/lib/auth";
import { withDbRetry } from "@/lib/db-retry";

export async function POST(request: NextRequest) {
  try {
    const { email: rawEmail, password } = await request.json();
    // Case-insensitive + whitespace tolerant: matching how users actually type emails
    const email = String(rawEmail || "").trim().toLowerCase();

    if (!email || typeof password !== "string" || !password) {
      return NextResponse.json({ success: false, error: "Email and password are required" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ success: false, error: "Invalid email address" }, { status: 400 });
    }

    const user = await withDbRetry(() =>
      prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
      })
    );
    if (!user) {
      return NextResponse.json({ success: false, error: "Invalid email or password" }, { status: 401 });
    }

    const isValid = await comparePassword(password, user.password);
    if (!isValid) {
      return NextResponse.json({ success: false, error: "Invalid email or password" }, { status: 401 });
    }

    if (!user.isActive) {
      return NextResponse.json({ success: false, error: "Account disabled. Contact admin." }, { status: 403 });
    }

    // Role is verified by the system itself, not chosen in the form.
    // Route-level access is enforced separately (src/proxy.ts) and admin APIs
    // reject non-ADMIN tokens server-side.
    const token = generateToken({ userId: user.id, role: user.role });

    const res = NextResponse.json({
      success: true,
      data: {
        user: { id: user.id, name: user.name, email: user.email, role: user.role, cardBarcode: user.cardBarcode },
        token,
      },
    });
    res.cookies.set("vq_role", user.role, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch {
    return NextResponse.json({ success: false, error: "Login failed" }, { status: 500 });
  }
}