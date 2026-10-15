import { NextRequest, NextResponse } from "next/server";
import { currentOwner, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma, ProjectStatus } from "@/generated/prisma";
import { decryptCredential, encryptCredential } from "@/lib/credentialEncryption";
import { workspaceData } from "@/lib/workspaceData";
import { accessCategories, normalizeMoney, normalizeWebsite } from "@/lib/inputHelpers";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };
class InputError extends Error {}
function text(value: unknown, label: string, required = false, max = 2000) { if (typeof value !== "string" && value !== undefined && value !== null) throw new InputError(`Invalid ${label}.`); const result = String(value || "").trim(); if (result.length > max || (required && !result)) throw new InputError(`Enter a valid ${label}.`); return result; }
function amount(value: unknown, allowZero = false) { const input = normalizeMoney(value); if (!/^\d{1,12}(\.\d{1,2})?$/.test(input)) throw new InputError("Enter an amount with at most two decimal places."); const result = new Prisma.Decimal(input); if (allowZero ? result.lt(0) : result.lte(0)) throw new InputError("Amount must be positive."); return result; }
function website(value: unknown) { try { return normalizeWebsite(text(value, "website", false, 1000)); } catch { throw new InputError("Enter a valid HTTP or HTTPS website URL."); } }
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
        const data = { name: text(b.name, "client name", true, 160), email: email || null, phone: text(b.phone, "phone", false, 40) || null, company: text(b.company, "company", false, 160) || null, notes: text(b.notes, "notes") || null, website: website(b.website) };
        const row = id ? await tx.client.update({ where: { id }, data }) : await tx.client.create({ data }); await audit(row.id); return row;
      }
      if (action === "project") {
        const clientId = text(b.clientId, "client", true, 100); if (!await tx.client.findUnique({ where: { id: clientId } })) throw new InputError("Client not found.");
        const status = text(b.status || "ACTIVE", "status") as ProjectStatus; if (!Object.values(ProjectStatus).includes(status)) throw new InputError("Choose a project status.");
        const data = { name: text(b.name, "project name", true, 160), clientId, agreedAmount: amount(b.agreedAmount), currency: currency(b.currency), deadline: b.deadline ? date(b.deadline) : null, source: text(b.source, "source", true, 60), status, notes: text(b.notes, "notes") || null, website: website(b.website), closedAt: null as Date | null, completedAt: status === "COMPLETED" ? new Date() : null as Date | null };
        if (id) { await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${id} FOR UPDATE`; const previous = await tx.project.findUniqueOrThrow({ where: { id } }); const collected = await tx.payment.aggregate({ where: { projectId: id, voidedAt: null }, _sum: { amount: true } }); const received = collected._sum.amount || new Prisma.Decimal(0); if (data.agreedAmount.lt(received)) throw new InputError("Project amount cannot be below payments already received."); if (previous.currency !== data.currency && (await tx.payment.count({ where: { projectId: id } })) > 0) throw new InputError("Currency cannot change once payments exist."); if (status === "CANCELLED" && (previous.closedAt || received.gte(previous.agreedAmount) || previous.status === "COMPLETED")) throw new InputError("A completed or fully paid project cannot be cancelled. Correct payments first."); if (previous.closedAt && !data.agreedAmount.eq(previous.agreedAmount)) throw new InputError("A paid/closed project's total cannot be changed. Correct its payments first."); data.closedAt = received.gte(data.agreedAmount) ? previous.closedAt || new Date() : null; data.completedAt = status === "COMPLETED" ? previous.completedAt || new Date() : null; }
        const row = id ? await tx.project.update({ where: { id }, data }) : await tx.project.create({ data });
        if (b.quickAccess !== undefined) {
          if (!Array.isArray(b.quickAccess) || b.quickAccess.length > 12) throw new InputError("Add up to twelve access records per project save.");
          const c = await tx.client.findUniqueOrThrow({ where: { id: clientId } });
          for (const access of b.quickAccess) {
            if (!access || typeof access !== "object") throw new InputError("Invalid access details.");
            const category = text(access.category, "access type", true);
            if (!accessCategories.includes(category)) throw new InputError("Invalid access type.");
            const hostingCompanyId = text(access.hostingCompanyId, "hosting company", false, 100) || null;
            if (category === "HOSTING" && !hostingCompanyId) throw new InputError("Choose a hosting company.");
            if (hostingCompanyId && !await tx.directoryEntry.findFirst({ where: { id: hostingCompanyId, kind: "HOSTING" } })) throw new InputError("Invalid hosting company.");
            const port = access.port ? Number(access.port) : null;
            if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) throw new InputError("Port must be between 1 and 65535.");
            const entry = await tx.credential.create({ data: { projectId: row.id, category, hostingCompanyId, port,
              host: text(access.host, "host", ["FTP", "SSH"].includes(category), 250) || null,
              label: text(access.label || category, "access label", true, 160),
              url: website(access.url || row.website || c.website), loginUrl: website(access.loginUrl),
              username: text(access.username, "username", false, 250) || null, email: text(access.email, "email", false, 254) || null,
              encryptedSecret: encryptCredential(text(access.secret, "password/secret", true, 16000)) } });
            await audit(entry.id);
          }
        }
        await audit(row.id); return row;
      }
      if (action === "payment") {
        const key = text(b.idempotencyKey, "payment key", true, 100); const existing = await tx.payment.findUnique({ where: { idempotencyKey: key } }); if (existing) return existing;
        const projectId = text(b.projectId, "project", true, 100); await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${projectId} FOR UPDATE`;
        const duplicate = await tx.payment.findUnique({ where: { idempotencyKey: key } }); if (duplicate) return duplicate;
        const project = await tx.project.findUnique({ where: { id: projectId } }); if (!project || ["CANCELLED", "COMPLETED"].includes(project.status) || project.closedAt) throw new InputError("Choose an open project. Completed, cancelled and fully paid projects cannot receive payments.");
        const value = amount(b.amount); const fee = amount(b.platformFee ?? "0", true); const collected = await tx.payment.aggregate({ where: { projectId, voidedAt: null }, _sum: { amount: true } }); if (value.plus(collected._sum.amount || 0).gt(project.agreedAmount)) throw new InputError("Payment exceeds the remaining project balance."); if (fee.gt(value)) throw new InputError("Platform fee cannot exceed this payment.");
        const row = await tx.payment.create({ data: { projectId, amount: value, platformFee: fee, paidAt: date(b.paidAt), method: text(b.method, "method", true, 60), reference: text(b.reference, "reference", false, 160) || null, idempotencyKey: key } }); if (value.plus(collected._sum.amount || 0).eq(project.agreedAmount)) await tx.project.update({ where: { id: projectId }, data: { closedAt: new Date() } }); await audit(row.id); return row;
      }
      if (action === "voidPayment") { const reason = text(b.reason, "void reason", true); const row = await tx.payment.findUniqueOrThrow({ where: { id } }); await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${row.projectId} FOR UPDATE`; if (row.voidedAt) return { id }; await tx.payment.update({ where: { id }, data: { voidedAt: new Date(), voidReason: reason } }); await tx.project.update({ where: { id: row.projectId }, data: { closedAt: null } }); await audit(id); return { id }; }
      if (action === "expense") { const data = { description: text(b.description, "description", true, 160), category: text(b.category, "category", true, 80), amount: amount(b.amount), currency: currency(b.currency), spentAt: date(b.spentAt), notes: text(b.notes, "notes") || null }; const row = id ? await tx.expense.update({ where: { id }, data }) : await tx.expense.create({ data }); await audit(row.id); return row; }
      if (action === "voidExpense") { await tx.expense.update({ where: { id }, data: { voidedAt: new Date(), voidReason: text(b.reason, "void reason", true) } }); await audit(id); return { id }; }
      if (action === "employee") {
        const email = text(b.email, "email", true, 254); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError("Enter a valid employee email.");
        const cnic = text(b.cnic, "CNIC", true, 15).replaceAll("-", ""); if (!/^\d{13}$/.test(cnic)) throw new InputError("CNIC must contain 13 digits.");
        const cnicAttachmentId = text(b.cnicAttachmentId, "CNIC attachment", true, 100); const attachment = await tx.privateFile.findUnique({ where: { id: cnicAttachmentId } }); if (!attachment || attachment.ownerId !== current.owner.id) throw new InputError("Upload a private CNIC attachment.");
        const employmentType = text(b.employmentType, "employment type", true); if (!["PERMANENT", "CONTRACT", "INTERNSHIP"].includes(employmentType)) throw new InputError("Choose Contract, Internship or Permanent.");
        const bankId = text(b.bankId, "bank", false, 100) || null; if (bankId && !await tx.directoryEntry.findFirst({ where: { id: bankId, kind: "BANK" } })) throw new InputError("Select a valid bank.");
        const contractStart = b.contractStart ? date(b.contractStart) : null, contractEnd = b.contractEnd ? date(b.contractEnd) : null;
        if (employmentType !== "PERMANENT" && (!contractStart || !contractEnd)) throw new InputError("Contract/internship start and end dates are required.");
        if (contractStart && contractEnd && contractEnd < contractStart) throw new InputError("Contract end must be after its start.");
        const iban = text(b.iban, "IBAN", false, 34).replaceAll(" ", "").toUpperCase(); if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) throw new InputError("Enter a valid IBAN format.");
        const data = { name: text(b.name, "employee name", true, 160), role: text(b.role, "job title", true, 120), monthlySalary: amount(b.monthlySalary), currency: currency(b.currency), active: b.active !== false && b.active !== "false", email, cnic, cnicAttachmentId, employmentType, joiningDate: date(b.joiningDate), phone: text(b.phone, "phone", true, 40), address: text(b.address, "address", true), fatherName: text(b.fatherName, "father's name", true, 160), referral: text(b.referral, "reference", false, 160) || null, contractStart, contractEnd, probationEnd: b.probationEnd ? date(b.probationEnd) : null, bankId, accountTitle: text(b.accountTitle, "account title", false, 160) || null, accountNumber: text(b.accountNumber, "account number", false, 40) || null, iban: iban || null };
        if (bankId && (!data.accountTitle || !data.accountNumber && !data.iban)) throw new InputError("Enter account title and an account number or IBAN.");
        if (id) { const previous = await tx.employee.findUniqueOrThrow({ where: { id } }); if (previous.currency !== data.currency && await tx.salaryEntry.count({ where: { employeeId: id } })) throw new InputError("Currency cannot change after salary obligations exist."); } const row = id ? await tx.employee.update({ where: { id }, data }) : await tx.employee.create({ data }); await audit(row.id); return row;
      }
      if (action === "salaryMonth") { const employeeId = text(b.employeeId, "employee", true, 100); const month = text(b.month, "month", true, 7); if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new InputError("Choose a valid salary month."); await tx.$queryRaw`SELECT id FROM "Employee" WHERE id=${employeeId} FOR UPDATE`; const employee = await tx.employee.findUniqueOrThrow({ where: { id: employeeId } }); if (!employee.active) throw new InputError("Employee is inactive."); const row = await tx.salaryEntry.upsert({ where: { employeeId_month: { employeeId, month } }, update: {}, create: { employeeId, month, agreedSalary: employee.monthlySalary } }); await audit(row.id); return row; }
      if (action === "salaryPayment") { const key = text(b.idempotencyKey, "payment key", true, 100); const existing = await tx.salaryPayment.findUnique({ where: { idempotencyKey: key } }); if (existing) return existing; const salaryEntryId = text(b.salaryEntryId, "salary month", true, 100); await tx.$queryRaw`SELECT id FROM "SalaryEntry" WHERE id=${salaryEntryId} FOR UPDATE`; const duplicate = await tx.salaryPayment.findUnique({ where: { idempotencyKey: key } }); if (duplicate) return duplicate; const entry = await tx.salaryEntry.findUniqueOrThrow({ where: { id: salaryEntryId }, include: { payments: true } }); const value = amount(b.amount); const paid = entry.payments.reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0)); if (paid.plus(value).gt(entry.agreedSalary)) throw new InputError("Payment/advance exceeds salary balance."); const row = await tx.salaryPayment.create({ data: { salaryEntryId, amount: value, paidAt: date(b.paidAt), isAdvance: b.isAdvance === true || b.isAdvance === "true", reference: text(b.reference, "reference", false, 160) || null, idempotencyKey: key } }); await audit(row.id); return row; }
      if (action === "credential" || action === "credentialBatch") {
        const batch = action === "credentialBatch";
        if (batch && (!Array.isArray(b.entries) || !b.entries.length || b.entries.length > 12)) throw new InputError("Add between one and twelve access records.");
        const entries = batch ? b.entries.map((entry: Record<string, unknown>) => ({ ...entry, projectId: b.projectId })) : [b];
        const results = [];
        for (const b of entries) {
        const id = batch ? "" : text(b.id, "record ID", false, 100);
        const projectId = text(b.projectId, "project", true, 100); const p = await tx.project.findUnique({ where: { id: projectId }, include: { client: true } }); if (!p) throw new InputError("Project not found.");
        const category = text(b.category || "OTHER", "access type"); if (!accessCategories.includes(category)) throw new InputError("Invalid access type.");
        const hostingCompanyId = text(b.hostingCompanyId, "hosting company", false, 100) || null; if (category === "HOSTING" && !hostingCompanyId) throw new InputError("Choose a hosting company."); if (hostingCompanyId && !await tx.directoryEntry.findFirst({ where: { id: hostingCompanyId, kind: "HOSTING" } })) throw new InputError("Invalid hosting company.");
        const port = b.port ? Number(b.port) : null; if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) throw new InputError("Port must be between 1 and 65535.");
        const host = text(b.host, "host", ["FTP", "SSH"].includes(category), 250) || null;
        const secret = text(b.secret, "password/secret", !id, 16000);
        const data = { projectId, category, hostingCompanyId, host, port, email: text(b.email, "email", false, 254) || null, loginUrl: website(b.loginUrl), label: text(b.label || category, "label", true, 160), url: website(b.url || p.website || p.client.website), username: text(b.username, "username", false, 250) || null, ...(secret ? { encryptedSecret: encryptCredential(secret) } : {}) };
        const row = id ? await tx.credential.update({ where: { id }, data }) : await tx.credential.create({ data: { ...data, encryptedSecret: encryptCredential(secret) } }); await audit(row.id); results.push({ id: row.id });
        }
        return batch ? { records: results } : results[0];
      }
      if (action === "directory") {
        const kind = text(b.kind, "directory type", true); if (!["BANK", "HOSTING"].includes(kind)) throw new InputError("Invalid directory type.");
        const name = text(b.name, "name", true, 160); const existing = await tx.directoryEntry.findFirst({ where: { kind, name: { equals: name, mode: "insensitive" } } }); if (existing) return existing;
        const row = await tx.directoryEntry.create({ data: { kind, name, url: website(b.url) } }); await audit(row.id); return row;
      }
      if (action === "appearance") {
        const primary = text(b.primary, "primary colour", true, 7), accent = text(b.accent, "accent colour", true, 7), background = text(b.background, "background colour", true, 7);
        if (![primary, accent, background].every(value => /^#[a-fA-F0-9]{6}$/.test(value))) throw new InputError("Choose valid hex colours.");
        const logo = text(b.logo, "logo", false, 450000) || null; if (logo && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo)) throw new InputError("Upload a PNG, JPEG or WebP logo.");
        const row = await tx.appearance.upsert({ where: { id: "default" }, create: { brandName: text(b.brandName, "brand name", true, 80), primary, accent, background, logo }, update: { brandName: text(b.brandName, "brand name", true, 80), primary, accent, background, logo } }); await audit(row.id); return row;
      }
      if (action === "revealCredential" || action === "deleteCredential") { const owner = await tx.owner.findUniqueOrThrow({ where: { id: current.owner.id } }); if (!verifyPassword(String(b.password || ""), owner.passwordHash)) throw new InputError("Account password is incorrect."); const row = await tx.credential.findUniqueOrThrow({ where: { id } }); await audit(id); if (action === "deleteCredential") { await tx.credential.delete({ where: { id } }); return { id }; } return { secret: decryptCredential(row.encryptedSecret) }; }
      throw new InputError("Unknown operation.");
    });
    return NextResponse.json({ success: true, result }, { headers });
  } catch (error) { return failure(error); }
}
