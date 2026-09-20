import { getProjectDashboard } from "./projectDashboardService.js";
import type { Activity } from "../types/activity.js";
import type { ProjectDashboard } from "../types/dashboard.js";

function activityTime(activity: Activity): number {
  const occurred = activity.metadata.occurred_at;
  const parsed = typeof occurred === "string" ? Date.parse(occurred) : NaN;
  return Number.isNaN(parsed) ? Date.parse(activity.created_at) : parsed;
}

export type ProjectBrief = ProjectDashboard & {
  staleInProgressTasks: ProjectDashboard["inProgressTasks"];
  recentGithubActivities: Activity[];
  recentAiActivities: Activity[];
  latestActivityAt: string | null;
};

export async function getProjectBrief(projectId: string): Promise<ProjectBrief> {
  const dashboard = await getProjectDashboard(projectId);
  const sorted = [...dashboard.recentActivities].sort((a, b) => activityTime(b) - activityTime(a));
  return {
    ...dashboard,
    staleInProgressTasks: dashboard.inProgressTasks.filter((task) =>
      Date.now() - Date.parse(task.created_at) >= 3 * 86_400_000,
    ),
    recentGithubActivities: sorted.filter((a) => a.source === "GITHUB").slice(0, 5),
    recentAiActivities: sorted.filter((a) => a.type === "AI_REVIEW").slice(0, 3),
    latestActivityAt: sorted[0]?.created_at ?? null,
  };
}