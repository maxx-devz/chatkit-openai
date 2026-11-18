import { CLIENT_PERMISSIONS as P } from "./client-permissions.js";
import {CLIENT_ASSISTANT_NAME} from "./portal-presentation.js";
export const CLIENT_VIEWS = [
  { view: "dashboard", icon: "dashboard", label: "Dashboard" },
  { view: "website-insights", icon: "target", label: "Website Insights", permission: P.OVERVIEW_READ },
  { view: "ai", icon: "sparkles", label: CLIENT_ASSISTANT_NAME, permission: P.AI_USE },
  { view: "time", icon: "clock", label: "Monthly Time" },
  { view: "projects", icon: "chart", label: "Project Status" },
  { view: "documents", icon: "folder", label: "Documents", permission: P.DOCUMENTS_READ },
  { view: "members", icon: "users", label: "Members & Access", permission: P.MEMBERS_MANAGE },
  { view: "audit", icon: "clipboard", label: "Audit Log", permission: P.ACCESS_AUDIT_READ },
  { view: "account", icon: "user", label: "Account" },
].map(item => ({ ...item, href: item.view === "dashboard" ? "/" : `/?view=${item.view}` }));
export function clientNavigation(permissions) { return CLIENT_VIEWS.filter(item => !item.permission || permissions.includes(item.permission)); }
export function clientView(value, permissions) { return clientNavigation(permissions).some(item => item.view === value) ? value : "dashboard"; }
