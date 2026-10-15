export const workspaceRoutes: Record<string, string> = {
  Overview: "/dashboard",
  Clients: "/clients",
  Projects: "/projects",
  Payments: "/payments",
  "Project access": "/project-access",
  "Team & salaries": "/team",
  Expenses: "/expenses",
  Reports: "/reports",
  Settings: "/settings",
};
export const clientProfilePath = (id: string) => `/clients/${encodeURIComponent(id)}`;
export function workspaceLocation(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  return {
    page: segments[0] === "clients" ? "Clients" : Object.entries(workspaceRoutes).find(([,path]) => path === pathname.replace(/\/$/, ""))?.[0] || "Overview",
    profileId: segments[0] === "clients" && segments[1] ? decodeURIComponent(segments[1]) : "",
  };
}
