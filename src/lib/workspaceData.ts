import { db } from "./db";
export async function workspaceData() {
  const [clients, projects, payments, credentials, employees, salaryEntries, expenses, audit] = await db.$transaction([
    db.client.findMany({ orderBy: { createdAt: "desc" } }), db.project.findMany({ orderBy: { createdAt: "desc" } }), db.payment.findMany({ orderBy: { paidAt: "desc" } }),
    db.credential.findMany({ select: { id: true, projectId: true, label: true, url: true, username: true }, orderBy: { createdAt: "desc" } }),
    db.employee.findMany({ orderBy: { name: "asc" } }), db.salaryEntry.findMany({ include: { payments: true }, orderBy: { month: "desc" } }), db.expense.findMany({ orderBy: { spentAt: "desc" } }), db.auditEntry.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return { clients, projects, payments, credentials, employees, salaryEntries, expenses, audit };
}
