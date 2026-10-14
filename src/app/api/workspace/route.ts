import { NextRequest, NextResponse } from "next/server";
import { currentOwner, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma, ProjectStatus } from "@/generated/prisma";
import { decryptCredential, encryptCredential } from "@/lib/credentialEncryption";
import { workspaceData } from "@/lib/workspaceData";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };
class InputError extends Error {}
function text(value: unknown, label: string, required = false, max = 2000) { if (typeof value !== "string" && value !== undefined && value !== null) throw new InputError(`Invalid ${label}.`); const result = String(value || "").trim(); if (result.length > max || (required && !result)) throw new InputError(`Enter a valid ${label}.`); return result; }
function amount(value: unknown, allowZero = false) { const input = String(value ?? ""); if (!/^\d{1,12}(\.\d{1,2})?$/.test(input)) throw new InputError("Enter an amount with at most two decimal places."); const result = new Prisma.Decimal(input); if (allowZero ? result.lt(0) : result.lte(0)) throw new InputError("Amount must be positive."); return result; }
function currency(value: unknown) { const result = text(value, "currency", true, 3).toUpperCase(); if (!["PKR", "USD", "EUR", "GBP", "AED", "SAR", "CAD", "AUD"].includes(result)) throw new InputError("Choose a supported currency."); return result; }
function date(value: unknown) { const input = text(value, "date", true, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new InputError("Choose a valid date."); const result = new Date(input + "T12:00:00Z"); if (!Number.isFinite(result.getTime()) || result.toISOString().slice(0, 10) !== input) throw new InputError("Choose a valid date."); return result; }
async function failure(error: unknown) { if (error instanceof InputError) return NextResponse.json({ error: error.message }, { status: 400, headers }); console.error("ALGOFORT_WORKSPACE", error instanceof Error ? error.name : "Unknown"); return NextResponse.json({ error: "Could not save this change. Refresh and try again." }, { status: 503, headers }); }
export async function GET() { try { const current = await currentOwner(); if (!current) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers }); return NextResponse.json({ ...(await workspaceData()), owner: { name: current.owner.name, email: current.owner.email } }, { headers }); } catch (error) { return failure(error); } }
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const current = await currentOwner(); if (!current) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers });
    const b = await req.json(); const action = text(b.action, "action", true, 40); const id = text(b.id, "record ID", false, 100);
    if (action === "revealCredential" || action === "deleteCredential") {
      const password = text(b.password, "account password", true, 256);
      const permitted = await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Owner" WHERE id=${current.owner.id} FOR UPDATE`;
        const owner = await tx.owner.findUniqueOrThrow({ where: { id: current.owner.id } });
        if (owner.lockedUntil && owner.lockedUntil > new Date()) return false;
        if (!verifyPassword(password, owner.passwordHash)) { const attempts = owner.lockedUntil && owner.lockedUntil < new Date() ? 1 : owner.failedAttempts + 1; await tx.owner.update({ where: { id: owner.id }, data: { failedAttempts: attempts, lockedUntil: attempts >= 5 ? new Date(Date.now() + 15 * 60000) : null } }); return false; }
        await tx.owner.update({ where: { id: owner.id }, data: { failedAttempts: 0, lockedUntil: null } }); return true;
      });
      if (!permitted) throw new InputError("Account password incorrect or temporarily locked after repeated attempts.");
    }
    const result = await db.$transaction(async tx => {
      // Serialize owner writes and recheck revocation inside the mutation.
      await tx.$queryRaw`SELECT id FROM "Owner" WHERE id=${current.owner.id} FOR UPDATE`;
      const liveSession = await tx.session.findUnique({ where: { id: current.session.id } });
      if (!liveSession || liveSession.expiresAt <= new Date()) throw new InputError("Session expired. Sign in again.");
      const audit = async (entityId: string) => tx.auditEntry.create({ data: { action, entityId, actorId: current.owner.id } });
      if (action === "client") {
        const email = text(b.email, "email", false, 254); if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError("Enter a valid email.");
        const data = { name: text(b.name, "client name", true, 160), email: email || null, phone: text(b.phone, "phone", false, 40) || null, company: text(b.company, "company", false, 160) || null, notes: text(b.notes, "notes") || null };
        const row = id ? await tx.client.update({ where: { id }, data }) : await tx.client.create({ data }); await audit(row.id); return row;
      }
      if (action === "project") {
        const clientId = text(b.clientId, "client", true, 100); if (!await tx.client.findUnique({ where: { id: clientId } })) throw new InputError("Client not found.");
        const status = text(b.status || "ACTIVE", "status") as ProjectStatus; if (!Object.values(ProjectStatus).includes(status)) throw new InputError("Choose a project status.");
        const data = { name: text(b.name, "project name", true, 160), clientId, agreedAmount: amount(b.agreedAmount), currency: currency(b.currency), deadline: b.deadline ? date(b.deadline) : null, source: text(b.source, "source", true, 60), status, notes: text(b.notes, "notes") || null };
        if (id) { await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${id} FOR UPDATE`; const previous = await tx.project.findUniqueOrThrow({ where: { id } }); const collected = await tx.payment.aggregate({ where: { projectId: id, voidedAt: null }, _sum: { amount: true } }); if (data.agreedAmount.lt(collected._sum.amount || 0)) throw new InputError("Project amount cannot be below payments already received."); if (previous.currency !== data.currency && (await tx.payment.count({ where: { projectId: id } })) > 0) throw new InputError("Currency cannot change once payments exist."); }
        const row = id ? await tx.project.update({ where: { id }, data }) : await tx.project.create({ data }); await audit(row.id); return row;
      }
      if (action === "payment") {
        const key = text(b.idempotencyKey, "payment key", true, 100); const existing = await tx.payment.findUnique({ where: { idempotencyKey: key } }); if (existing) return existing;
        const projectId = text(b.projectId, "project", true, 100); await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${projectId} FOR UPDATE`;
        const duplicate = await tx.payment.findUnique({ where: { idempotencyKey: key } }); if (duplicate) return duplicate;
        const project = await tx.project.findUnique({ where: { id: projectId } }); if (!project || project.status === "CANCELLED") throw new InputError("Choose an existing non-cancelled project.");
        const value = amount(b.amount); const fee = amount(b.platformFee ?? "0", true); const collected = await tx.payment.aggregate({ where: { projectId, voidedAt: null }, _sum: { amount: true } }); if (value.plus(collected._sum.amount || 0).gt(project.agreedAmount)) throw new InputError("Payment exceeds the remaining project balance."); if (fee.gt(value)) throw new InputError("Platform fee cannot exceed this payment.");
        const row = await tx.payment.create({ data: { projectId, amount: value, platformFee: fee, paidAt: date(b.paidAt), method: text(b.method, "method", true, 60), reference: text(b.reference, "reference", false, 160) || null, idempotencyKey: key } }); await audit(row.id); return row;
      }
      if (action === "voidPayment") { const reason = text(b.reason, "void reason", true); const row = await tx.payment.findUniqueOrThrow({ where: { id } }); await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${row.projectId} FOR UPDATE`; await tx.payment.update({ where: { id }, data: { voidedAt: new Date(), voidReason: reason } }); await audit(id); return { id }; }
      if (action === "expense") { const data = { description: text(b.description, "description", true, 160), category: text(b.category, "category", true, 80), amount: amount(b.amount), currency: currency(b.currency), spentAt: date(b.spentAt), notes: text(b.notes, "notes") || null }; const row = id ? await tx.expense.update({ where: { id }, data }) : await tx.expense.create({ data }); await audit(row.id); return row; }
      if (action === "voidExpense") { await tx.expense.update({ where: { id }, data: { voidedAt: new Date(), voidReason: text(b.reason, "void reason", true) } }); await audit(id); return { id }; }
      if (action === "employee") { const data = { name: text(b.name, "employee name", true, 160), role: text(b.role, "job title", true, 120), monthlySalary: amount(b.monthlySalary), currency: currency(b.currency), active: b.active !== false && b.active !== "false" }; if (id) { const previous = await tx.employee.findUniqueOrThrow({ where: { id } }); if (previous.currency !== data.currency && await tx.salaryEntry.count({ where: { employeeId: id } })) throw new InputError("Currency cannot change after salary obligations exist."); } const row = id ? await tx.employee.update({ where: { id }, data }) : await tx.employee.create({ data }); await audit(row.id); return row; }
      if (action === "salaryMonth") { const employeeId = text(b.employeeId, "employee", true, 100); const month = text(b.month, "month", true, 7); if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new InputError("Choose a valid salary month."); await tx.$queryRaw`SELECT id FROM "Employee" WHERE id=${employeeId} FOR UPDATE`; const employee = await tx.employee.findUniqueOrThrow({ where: { id: employeeId } }); if (!employee.active) throw new InputError("Employee is inactive."); const row = await tx.salaryEntry.upsert({ where: { employeeId_month: { employeeId, month } }, update: {}, create: { employeeId, month, agreedSalary: employee.monthlySalary } }); await audit(row.id); return row; }
      if (action === "salaryPayment") { const key = text(b.idempotencyKey, "payment key", true, 100); const existing = await tx.salaryPayment.findUnique({ where: { idempotencyKey: key } }); if (existing) return existing; const salaryEntryId = text(b.salaryEntryId, "salary month", true, 100); await tx.$queryRaw`SELECT id FROM "SalaryEntry" WHERE id=${salaryEntryId} FOR UPDATE`; const duplicate = await tx.salaryPayment.findUnique({ where: { idempotencyKey: key } }); if (duplicate) return duplicate; const entry = await tx.salaryEntry.findUniqueOrThrow({ where: { id: salaryEntryId }, include: { payments: true } }); const value = amount(b.amount); const paid = entry.payments.reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0)); if (paid.plus(value).gt(entry.agreedSalary)) throw new InputError("Payment/advance exceeds salary balance."); const row = await tx.salaryPayment.create({ data: { salaryEntryId, amount: value, paidAt: date(b.paidAt), isAdvance: b.isAdvance === true || b.isAdvance === "true", reference: text(b.reference, "reference", false, 160) || null, idempotencyKey: key } }); await audit(row.id); return row; }
      if (action === "credential") { const url = text(b.url, "URL", false, 1000); if (url && !/^https?:\/\//i.test(url)) throw new InputError("URL must begin with https:// or http://."); const projectId = text(b.projectId, "project", true, 100); if (!await tx.project.findUnique({ where: { id: projectId } })) throw new InputError("Project not found."); const data = { projectId, label: text(b.label, "label", true, 160), url: url || null, username: text(b.username, "username", false, 250) || null, encryptedSecret: encryptCredential(text(b.secret, "password/secret", true, 4096)) }; const row = id ? await tx.credential.update({ where: { id }, data }) : await tx.credential.create({ data }); await audit(row.id); return { id: row.id }; }
      if (action === "revealCredential" || action === "deleteCredential") { const owner = await tx.owner.findUniqueOrThrow({ where: { id: current.owner.id } }); if (!verifyPassword(String(b.password || ""), owner.passwordHash)) throw new InputError("Account password is incorrect."); const row = await tx.credential.findUniqueOrThrow({ where: { id } }); await audit(id); if (action === "deleteCredential") { await tx.credential.delete({ where: { id } }); return { id }; } return { secret: decryptCredential(row.encryptedSecret) }; }
      throw new InputError("Unknown operation.");
    });
    return NextResponse.json({ success: true, result }, { headers });
  } catch (error) { return failure(error); }
}
