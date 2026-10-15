import { NextRequest } from "next/server";
import { currentOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptCredential, encryptCredential } from "@/lib/credentialEncryption";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== new URL(req.url).origin) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const current = await currentOwner(); if (!current) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (Number(req.headers.get("content-length")) > 1100000) return Response.json({ error: "Attachment must be under 1 MB." }, { status: 413 });
  try {
    const form = await req.formData(); const file = form.get("file");
    if (!(file instanceof File) || file.size > 1000000 || file.size === 0) return Response.json({ error: "Choose a PNG, JPEG or PDF under 1 MB." }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255, pdf = bytes.subarray(0, 5).toString() === "%PDF-";
    const mime = png ? "image/png" : jpeg ? "image/jpeg" : pdf ? "application/pdf" : null;
    if (!mime || mime !== file.type) return Response.json({ error: "Unsupported attachment content. Use PNG, JPEG or PDF." }, { status: 400 });
    const row = await db.privateFile.create({ data: { ownerId: current.owner.id, name: file.name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 120), mime, size: bytes.length, encryptedData: encryptCredential(bytes.toString("base64")) }, select: { id: true, name: true, size: true } });
    return Response.json(row, { headers: privateHeaders });
  } catch { return Response.json({ error: "Could not upload attachment." }, { status: 503 }); }
}
export async function GET(req: NextRequest) {
  const current = await currentOwner(); if (!current) return Response.json({ error: "Sign in first." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") || "";
  const file = await db.privateFile.findFirst({ where: { id, ownerId: current.owner.id } }); if (!file) return Response.json({ error: "Attachment not found." }, { status: 404 });
  await db.auditEntry.create({ data: { actorId: current.owner.id, entityId: file.id, action: "cnic_attachment_downloaded" } });
  const bytes = Buffer.from(decryptCredential(file.encryptedData), "base64");
  return new Response(new Uint8Array(bytes), { headers: { ...privateHeaders, "Content-Type": file.mime, "Content-Disposition": `attachment; filename="${file.name}"` } });
}
