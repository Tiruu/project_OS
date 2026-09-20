import { getActivities } from "./activityService.js";
import { getDecisions } from "./decisionService.js";
import { getProject } from "./projectService.js";
import { getTasks } from "./taskService.js";
export async function getProjectDashboard(projectId) {
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
        activeDecisions: decisions.filter((decision) => decision.status === "ACTIVE"),
    };
}
