import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/export": ["./node_modules/@fontsource/manrope/files/manrope-latin-400-normal.woff", "./node_modules/@fontsource/manrope/files/manrope-latin-700-normal.woff"],
  },
};
export default config;
