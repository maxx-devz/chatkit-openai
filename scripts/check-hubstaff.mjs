import { loadHubstaffProject } from "../lib/hubstaff.js";

const projectUrl = process.argv[2]?.trim();
if (!projectUrl) {
  console.error("Usage: npm run hubstaff:check -- https://tasks.hubstaff.com/app/organizations/ORG_ID/projects/PROJECT_ID");
  process.exit(1);
}

try {
  const data = await loadHubstaffProject(projectUrl);
  console.log(JSON.stringify({
    configured: data.configured,
    project: data.project?.name || "",
    projectStatus: data.project?.status || "",
    hours: data.hours,
    costBudget: data.costBudget,
    taskSummary: data.taskSummary,
    source: data.source,
  }, null, 2));
} catch (error) {
  console.error(`Hubstaff check failed: ${error?.publicDetails?.message || error?.message || "Unknown error"}`);
  process.exitCode = 1;
}
