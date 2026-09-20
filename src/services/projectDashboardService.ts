import { getActivities } from "./activityService.js";
import { getDecisions } from "./decisionService.js";
import { getGithubRepositories } from "./githubRepositoryService.js";
import { getProject } from "./projectService.js";
import { getTasks } from "./taskService.js";

import type { ProjectDashboard } from "../types/dashboard.js";

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

  return {
    project,
    tasks,
    todoTasks: tasks.filter((task) => task.status === "TODO"),
    inProgressTasks: tasks.filter((task) => task.status === "IN_PROGRESS"),
    doneTasks: tasks.filter((task) => task.status === "DONE"),
    recentActivities: activities.slice(0, 10),
    activeDecisions: decisions.filter(
      (decision) => decision.status === "ACTIVE",
    ),
    githubRepositories,
  };
}
