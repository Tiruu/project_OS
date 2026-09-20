import { getActivities } from "./activityService.js";
import { getDecisions } from "./decisionService.js";
import { getProject } from "./projectService.js";
import { getTasks } from "./taskService.js";

import type { ProjectDashboard } from "../types/dashboard.js";

export async function getProjectDashboard(
  projectId: string,
): Promise<ProjectDashboard> {
  const [project, tasks, activities, decisions] = await Promise.all([
    getProject(projectId),
    getTasks(projectId),
    getActivities(projectId),
    getDecisions(projectId),
  ]);

  return {
    project,
    tasks,
    recentActivities: activities.slice(0, 10),
    activeDecisions: decisions.filter(
      (decision) => decision.status === "ACTIVE",
    ),
  };
}
