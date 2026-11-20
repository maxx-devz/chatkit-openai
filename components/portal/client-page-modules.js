"use client";

import dynamic from "next/dynamic";
import WorkspaceLoading from "@/components/portal-ui/workspace-loading";

const loading=()=> <WorkspaceLoading label="Opening this page" compact/>;
export const WebsiteInsights=dynamic(()=>import("./website-insights"),{loading});
export const ClientDocumentsPanel=dynamic(()=>import("./client-documents-panel"),{loading});
export const ClientOfficialDocuments=dynamic(()=>import("./client-official-documents"),{loading});
export const ClientMembersPanel=dynamic(()=>import("./client-members-panel"),{loading});
export const ClientAuditPanel=dynamic(()=>import("./client-audit-panel"),{loading});
export const ClientPasswordSettings=dynamic(()=>import("./client-password-settings"),{loading});
