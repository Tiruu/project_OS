import type { Activity } from "./activity.js";
import type { Decision } from "./decision.js";
import type { Project } from "./project.js";
import type { Task } from "./task.js";

export type ProjectDashboard = {
  project: Project;
  tasks: Task[];
  recentActivities: Activity[];
  activeDecisions: Decision[];
};
