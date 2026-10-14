import { cookies } from "next/headers";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "./db";
export const cookieName = "algofort_session";
export function hashPassword(password: string) { const salt = randomBytes(16).toString("hex"); return salt + ":" + scryptSync(password, salt, 64).toString("hex"); }
export function verifyPassword(password: string, encoded: string) { try { const [salt, hash] = encoded.split(":"); const expected = Buffer.from(hash, "hex"); const actual = scryptSync(password, salt, 64); return expected.length === actual.length && timingSafeEqual(expected, actual); } catch { return false; } }
export function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
export async function currentOwner() { const token = (await cookies()).get(cookieName)?.value; if (!token || !/^[a-f0-9]{64}$/.test(token)) return null; const session = await db.session.findUnique({ where: { tokenHash: tokenHash(token) }, include: { owner: true } }); return session && session.expiresAt > new Date() ? { owner: session.owner, session } : null; }
