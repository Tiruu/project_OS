import { getActivities } from "./activityService.js";
import { getDecisions } from "./decisionService.js";
import { getGithubRepositories } from "./githubRepositoryService.js";
import { getProject } from "./projectService.js";
import { getTasks } from "./taskService.js";

import type { Activity } from "../types/activity.js";
import type { ProjectDashboard } from "../types/dashboard.js";

function getActivityTimestamp(activity: Activity): number {
  const occurredAt = activity.metadata.occurred_at;

  if (typeof occurredAt === "string") {
    const parsed = Date.parse(occurredAt);

    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return Date.parse(activity.created_at);
}

export async function getProjectDashboard(
  projectId: string,
): Promise<ProjectDashboard> {
  const [project, tasks, activities, decisions, githubRepositories] =
    await Promise.all([
      getProject(projectId),
      getTasks(projectId),
      getActivities(projectId),
      getDecisions(projectId),
      getGithubRepositories(projectId),
    ]);

  const recentActivities = [...activities]
    .sort(
      (a, b) =>
        getActivityTimestamp(b) - getActivityTimestamp(a),
    )
    .slice(0, 10);

  return {
    project,
    tasks,
    todoTasks: tasks.filter((task) => task.status === "TODO"),
    inProgressTasks: tasks.filter((task) => task.status === "IN_PROGRESS"),
    doneTasks: tasks.filter((task) => task.status === "DONE"),
    recentActivities,
    activeDecisions: decisions.filter(
      (decision) => decision.status === "ACTIVE",
    ),
    githubRepositories,
  };
}
