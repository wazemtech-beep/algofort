import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { cookieName, currentOwner, hashPassword, tokenHash, verifyPassword } from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const body = await req.json();
    for (const field of ["password", "currentPassword", "newPassword"]) if (body[field] !== undefined && (typeof body[field] !== "string" || body[field].length > 256)) return NextResponse.json({ error: "Invalid password." }, { status: 400 });
    if (body.action === "login") {
      const email = String(body.email || "").trim().toLowerCase(); const password = String(body.password || "");
      if (email.length > 254 || password.length > 256) return NextResponse.json({ error: "Invalid sign-in details." }, { status: 400 });
      const found = await db.owner.findUnique({ where: { email }, select: { id: true } });
      if (!found) { verifyPassword(password, hashPassword("dummy-verification")); return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 }); }
      const verified = await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Owner" WHERE id=${found.id} FOR UPDATE`;
        const owner = await tx.owner.findUniqueOrThrow({ where: { id: found.id } });
        if (owner.lockedUntil && owner.lockedUntil > new Date()) return false;
        if (!verifyPassword(password, owner.passwordHash)) { const attempts = owner.lockedUntil && owner.lockedUntil < new Date() ? 1 : owner.failedAttempts + 1; await tx.owner.update({ where: { id: owner.id }, data: { failedAttempts: attempts, lockedUntil: attempts >= 5 ? new Date(Date.now() + 15 * 60000) : null } }); return false; }
        await tx.owner.update({ where: { id: owner.id }, data: { failedAttempts: 0, lockedUntil: null } });
        const token = randomBytes(32).toString("hex");
        await tx.session.create({ data: { ownerId: owner.id, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 7 * 86400000) } });
        return token;
      });
      if (!verified) return NextResponse.json({ error: "Email/password incorrect or account temporarily locked after repeated attempts." }, { status: 401 });
      const response = NextResponse.json({ success: true }); response.cookies.set(cookieName, verified, { httpOnly: true, secure: process.env.NODE_ENV === "production" && new URL(req.url).protocol === "https:", sameSite: "lax", path: "/", maxAge: 7 * 86400 }); return response;
    }
    const current = await currentOwner(); if (!current) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    if (body.action === "email") {
      const email = String(body.email || "").trim().toLowerCase();
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Owner" WHERE id=${current.owner.id} FOR UPDATE`;
        const session = await tx.session.findUnique({ where: { id: current.session.id } });
        if (!session || session.expiresAt <= new Date()) throw new Error("Session expired.");
        const account = await tx.owner.findUniqueOrThrow({ where: { id: current.owner.id } });
        if (!verifyPassword(String(body.currentPassword || ""), account.passwordHash)) throw new Error("Current password is incorrect.");
        const existing = await tx.owner.findUnique({ where: { email } });
        if (existing && existing.id !== account.id) throw new Error("Email is already in use.");
        await tx.owner.update({ where: { id: account.id }, data: { email } });
        await tx.auditEntry.create({ data: { actorId: account.id, entityId: account.id, action: "email_changed" } });
        await tx.session.deleteMany({ where: { ownerId: account.id } });
      });
    } else if (body.action === "password") {
      const password = String(body.newPassword || "");
      if (password.length < 12 || password.length > 256) return NextResponse.json({ error: "New password must be 12–256 characters." }, { status: 400 });
      await db.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "Owner" WHERE id=${current.owner.id} FOR UPDATE`; const owner = await tx.owner.findUniqueOrThrow({ where: { id: current.owner.id } }); if (!verifyPassword(String(body.currentPassword || ""), owner.passwordHash)) throw new Error("Current password is incorrect."); await tx.owner.update({ where: { id: owner.id }, data: { passwordHash: hashPassword(password) } }); await tx.session.deleteMany({ where: { ownerId: owner.id } }); });
    } else if (body.action === "logoutAll") await db.session.deleteMany({ where: { ownerId: current.owner.id } });
    else if (body.action === "logout") await db.session.delete({ where: { id: current.session.id } });
    else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    const response = NextResponse.json({ success: true }); response.cookies.set(cookieName, "", { maxAge: 0, path: "/" }); return response;
  } catch (error) { console.error("ALGOFORT_AUTH", error instanceof Error ? error.name : "Unknown"); return NextResponse.json({ error: "Could not complete authentication. Check your details and retry." }, { status: 400 }); }
}
