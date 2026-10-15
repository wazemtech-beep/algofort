export const accessCategories = ["HOSTING", "FTP", "SSH", "STAGING", "LIVE", "OTHER"];
export function normalizeWebsite(value: string) {
  if (!value.trim()) return null;
  const input = value.trim();
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(input) ? input : "https://" + input);
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".") || url.username || url.password) throw new Error("Enter a valid HTTP or HTTPS website URL.");
  return url.toString();
}
export function normalizeMoney(value: unknown) { return String(value ?? "").replaceAll(",", "").trim(); }
export function readableLabel(value: string) { if (["PKR", "USD", "EUR", "GBP", "AED", "SAR", "CAD", "AUD", "FTP", "SSH", "CNIC", "IBAN"].includes(value.toUpperCase())) return value.toUpperCase(); return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase()); }
