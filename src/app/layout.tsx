import type { Metadata } from "next";
import "./globals.css";
import "./security.css";
import "./meeting.css";
import "./client-profile.css";
import "./routes.css";
import "./interactions.css";
export const metadata: Metadata = { title: "Algofort — Work & Finance", description: "Projects, clients and office finances in one place." };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
