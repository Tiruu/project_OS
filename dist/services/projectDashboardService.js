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
        todoTasks: tasks.filter((task) => task.status === "TODO"),
        inProgressTasks: tasks.filter((task) => task.status === "IN_PROGRESS"),
        doneTasks: tasks.filter((task) => task.status === "DONE"),
        recentActivities: activities.slice(0, 10),
        activeDecisions: decisions.filter((decision) => decision.status === "ACTIVE"),
    };
}
