/** Text report PDF with proper objects/xref and automatic pages; no secrets. */
export function reportPdf(lines: string[]) {
  const clean = (text: string) => text.replace(/[^\x20-\x7E]/g, "?").replace(/([\\()])/g, "\\$1");
  const wrapped = lines.flatMap(line => line.length > 92 ? line.match(/.{1,92}/g) || [line] : [line]);
  const pages: string[][] = []; for (let i = 0; i < wrapped.length; i += 46) pages.push(wrapped.slice(i, i + 46));
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] >>`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  pages.forEach((page, index) => { const stream = `BT /F1 11 Tf 14 TL 40 790 Td ${page.map((line, i) => `${i ? "T* " : ""}(${clean(line)}) Tj`).join("\n")} ET`; objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`); });
  let output = "%PDF-1.4\n"; const offsets = [0]; objects.forEach((object, i) => { offsets.push(Buffer.byteLength(output)); output += `${i + 1} 0 obj\n${object}\nendobj\n`; }); const xref = Buffer.byteLength(output); output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`; return Buffer.from(output);
}
