export const INTERNAL_USER_PANELS = Object.freeze([
  {
    id: "overview",
    workspace: "personal",
    label: "Overview",
    description: "Personal workload, time, priorities, and summary metrics.",
  },
  {
    id: "my_tasks",
    workspace: "personal",
    label: "My tasks",
    description: "The internal user's own Hubstaff assignments and daily plan.",
  },
  {
    id: "activity",
    workspace: "personal",
    label: "Activity",
    description: "Recent updates and completed personal assignments.",
  },
  {
    id: "team_directory",
    workspace: "team",
    label: "Team directory",
    description: "Active internal user names and positions. Enabled by default; access can be toggled.",
  },
  {
    id: "account_settings",
    workspace: "settings",
    label: "Account settings",
    description: "Personal portal password and account security controls.",
  },
  {
    id: "hubstaff",
    workspace: "settings",
    label: "Hubstaff",
    description: "Personal Hubstaff connection and synchronization status.",
  },
]);

export const INTERNAL_USER_WORKSPACES = Object.freeze([
  {
    id: "personal",
    label: "My Work",
    description: "The internal user's own overview, tasks, and activity.",
    path: "/internal",
  },
  {
    id: "team",
    label: "Team",
    description: "Basic directory of active internal users.",
    path: "/internal/team",
  },
  {
    id: "settings",
    label: "Settings",
    description: "Internal user integrations and account connections.",
    path: "/internal/settings",
  },
]);

export const INTERNAL_USER_POSITIONS = Object.freeze([
  {
    id: "team_member",
    label: "Team Member",
    panels: ["overview", "my_tasks", "activity", "team_directory", "account_settings", "hubstaff"],
  },
  {
    id: "project_manager",
    label: "Project Manager",
    panels: [
      "overview",
      "my_tasks",
      "activity",
      "team_directory",
      "account_settings",
      "hubstaff",
    ],
  },
]);

export const DEFAULT_INTERNAL_USER_POSITION = "team_member";

const PANEL_IDS = new Set(INTERNAL_USER_PANELS.map((panel) => panel.id));
const POSITION_BY_ID = new Map(INTERNAL_USER_POSITIONS.map((position) => [position.id, position]));

export function internalUserPosition(value) {
  return POSITION_BY_ID.get(String(value || ""))
    || POSITION_BY_ID.get(DEFAULT_INTERNAL_USER_POSITION);
}

export function isInternalUserPosition(value) {
  return POSITION_BY_ID.has(String(value || ""));
}

export function internalUserPanelAccess(value, position = DEFAULT_INTERNAL_USER_POSITION) {
  const source = Array.isArray(value) ? value : internalUserPosition(position).panels;
  const selected = new Set(source.filter((panel) => PANEL_IDS.has(panel)));
  return INTERNAL_USER_PANELS.map((panel) => panel.id).filter((panel) => selected.has(panel));
}

export function internalUserHasPanel(internalUser, panel) {
  return internalUserPanelAccess(internalUser?.panel_access, internalUser?.position).includes(panel);
}
