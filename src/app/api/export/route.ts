import { NextRequest } from "next/server";
import { currentOwner } from "@/lib/auth";
import { workspaceData } from "@/lib/workspaceData";
import { reportPdf } from "@/lib/reportPdf";
import { Prisma } from "@/generated/prisma";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export async function GET(req: NextRequest) {
  try {
    if (!await currentOwner()) return Response.json({ error: "Sign in first." }, { status: 401, headers: privateHeaders });
    const data = await workspaceData(); const params = req.nextUrl.searchParams; const format = params.get("format") || "csv";
    if (format === "backup") return new Response(JSON.stringify({ format: "algofort-business-export-v1", createdAt: new Date().toISOString(), ...data }, null, 2), { headers: { ...privateHeaders, "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="algofort-data-backup.json"' } });
    const currency = params.get("currency") || "PKR"; if (!/^[A-Z]{3}$/.test(currency)) return Response.json({ error: "Invalid currency." }, { status: 400 });
    const from = params.get("from") || ""; const to = params.get("to") || "";
    const validDate = (value: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    if (!validDate(from) || !validDate(to) || from && to && from > to) return Response.json({ error: "Invalid date range." }, { status: 400 });
    const inPeriod = (date: Date) => (!from || date.toISOString().slice(0, 10) >= from) && (!to || date.toISOString().slice(0, 10) <= to);
    const projects = data.projects.filter(p => p.currency === currency); const project = (id: string) => projects.find(p => p.id === id);
    const payments = data.payments.filter(p => !p.voidedAt && project(p.projectId) && inPeriod(p.paidAt)); const expenses = data.expenses.filter(e => !e.voidedAt && e.currency === currency && inPeriod(e.spentAt));
    const salaries = data.salaryEntries.filter(s => data.employees.find(e => e.id === s.employeeId)?.currency === currency).flatMap(s => s.payments.filter(p => inPeriod(p.paidAt)));
    const sum = (values: Prisma.Decimal[]) => values.reduce((total, value) => total.plus(value), new Prisma.Decimal(0));
    const received = sum(payments.map(p => p.amount)), fees = sum(payments.map(p => p.platformFee)), office = sum(expenses.map(e => e.amount)), salary = sum(salaries.map(s => s.amount));
    const rows: (string | number)[][] = [["ALGOFORT FINANCIAL REPORT", currency, from || "All dates", to || "All dates"], ["Summary", "Amount"], ["Gross received", received.toFixed(2)], ["Platform fees", fees.toFixed(2)], ["Office expenses", office.toFixed(2)], ["Salary and advances paid", salary.toFixed(2)], ["Net cash", received.minus(fees).minus(office).minus(salary).toFixed(2)], [], ["Current project balances (all dates)", "Client", "Total", "Received", "Remaining", "Status"]];
    for (const p of projects) { const paid = sum(data.payments.filter(payment => payment.projectId === p.id && !payment.voidedAt).map(payment => payment.amount)); rows.push([p.name, data.clients.find(c => c.id === p.clientId)?.name || "", p.agreedAmount.toFixed(2), paid.toFixed(2), p.agreedAmount.minus(paid).toFixed(2), p.status]); }
    rows.push([], ["Payments", "Project", "Date", "Gross", "Fee", "Method"]); for (const p of payments) rows.push([p.reference || "", project(p.projectId)!.name, p.paidAt.toISOString().slice(0, 10), p.amount.toFixed(2), p.platformFee.toFixed(2), p.method]);
    rows.push([], ["Office expenses", "Category", "Date", "Amount"]); for (const e of expenses) rows.push([e.description, e.category, e.spentAt.toISOString().slice(0, 10), e.amount.toFixed(2)]);
    rows.push([], ["Salaries / advances", "Month", "Date", "Amount", "Type"]); for (const s of data.salaryEntries) { const e = data.employees.find(e => e.id === s.employeeId); if (e?.currency !== currency) continue; for (const p of s.payments.filter(p => inPeriod(p.paidAt))) rows.push([e.name, s.month, p.paidAt.toISOString().slice(0, 10), p.amount.toFixed(2), p.isAdvance ? "ADVANCE" : "SALARY"]); }
    rows.push([], ["Current salary obligations (all dates)", "Month", "Agreed", "Paid including advances", "Pending"]);
    for (const s of data.salaryEntries) { const e = data.employees.find(e => e.id === s.employeeId); if (e?.currency !== currency) continue; const paid = sum(s.payments.map(p => p.amount)); rows.push([e.name, s.month, s.agreedSalary.toFixed(2), paid.toFixed(2), s.agreedSalary.minus(paid).toFixed(2)]); }
    if (format === "pdf") { const bytes = reportPdf(rows.map(row => row.join(" | "))); return new Response(new Uint8Array(bytes), { headers: { ...privateHeaders, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="algofort-report-${currency}.pdf"` } }); }
    if (format !== "csv") return Response.json({ error: "Invalid export format." }, { status: 400 });
    const quote = (value: string | number) => '"' + String(value).replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
    return new Response("\uFEFF" + rows.map(row => row.map(quote).join(",")).join("\r\n"), { headers: { ...privateHeaders, "Content-Type": "text/csv;charset=utf-8", "Content-Disposition": `attachment; filename="algofort-report-${currency}.csv"` } });
  } catch (error) { console.error("ALGOFORT_EXPORT", error instanceof Error ? error.name : "Unknown"); return Response.json({ error: "Export temporarily unavailable. Try again." }, { status: 503, headers: privateHeaders }); }
}
