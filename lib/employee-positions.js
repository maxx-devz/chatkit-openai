export const EMPLOYEE_PANELS = Object.freeze([
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
    description: "The employee's own Hubstaff assignments and daily plan.",
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
    description: "Active employee names, positions, and connection status.",
  },
  {
    id: "team_tasks",
    workspace: "team",
    label: "Team tasks",
    description: "Reserved for organization-wide task status and assignment tools.",
    planned: true,
  },
  {
    id: "hubstaff",
    workspace: "settings",
    label: "Hubstaff",
    description: "Personal Hubstaff connection and synchronization status.",
  },
]);

export const EMPLOYEE_WORKSPACES = Object.freeze([
  {
    id: "personal",
    label: "My Work",
    description: "The employee's own overview, tasks, and activity.",
    path: "/employee",
  },
  {
    id: "team",
    label: "Team Workspace",
    description: "Team directory and organization-wide work tools.",
    path: "/employee/team",
  },
  {
    id: "settings",
    label: "Settings",
    description: "Employee integrations and account connections.",
    path: "/employee/settings",
  },
]);

export const EMPLOYEE_POSITIONS = Object.freeze([
  {
    id: "team_member",
    label: "Team Member",
    panels: ["overview", "my_tasks", "activity", "hubstaff"],
  },
  {
    id: "project_manager",
    label: "Project Manager",
    panels: [
      "overview",
      "my_tasks",
      "activity",
      "team_directory",
      "team_tasks",
      "hubstaff",
    ],
  },
]);

export const DEFAULT_EMPLOYEE_POSITION = "team_member";

const PANEL_IDS = new Set(EMPLOYEE_PANELS.map((panel) => panel.id));
const POSITION_BY_ID = new Map(EMPLOYEE_POSITIONS.map((position) => [position.id, position]));

export function employeePosition(value) {
  return POSITION_BY_ID.get(String(value || ""))
    || POSITION_BY_ID.get(DEFAULT_EMPLOYEE_POSITION);
}

export function isEmployeePosition(value) {
  return POSITION_BY_ID.has(String(value || ""));
}

export function employeePanelAccess(value, position = DEFAULT_EMPLOYEE_POSITION) {
  const source = Array.isArray(value) ? value : employeePosition(position).panels;
  const selected = new Set(source.filter((panel) => PANEL_IDS.has(panel)));
  return EMPLOYEE_PANELS.map((panel) => panel.id).filter((panel) => selected.has(panel));
}

export function employeeHasPanel(employee, panel) {
  return employeePanelAccess(employee?.panel_access, employee?.position).includes(panel);
}
