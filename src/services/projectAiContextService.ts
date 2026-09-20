import "dotenv/config";

import { getActivities } from "./activityService.js";
import { getDecisions } from "./decisionService.js";
import { getGithubRepositories } from "./githubRepositoryService.js";
import { getProject } from "./projectService.js";
import { getTasks } from "./taskService.js";
import {
  getGithubRepositoryContext,
  type GithubRepositoryContext,
} from "./githubContextService.js";

import type { Activity } from "../types/activity.js";
import type { Decision } from "../types/decision.js";
import type { Task } from "../types/task.js";

export type ProjectAiContext = GithubRepositoryContext & {
  project_os: {
    project: {
      id: string;
      name: string;
      type: string;
      technologies: string[];
      purpose: string | null;
      description: string | null;
      current_state: string | null;
    };
    tasks: Array<{
      id: string;
      title: string;
      status: Task["status"];
      priority: number;
      created_at: string;
      completed_at: string | null;
    }>;
    active_tasks: Array<{
      id: string;
      title: string;
      status: Exclude<Task["status"], "DONE">;
      priority: number;
    }>;
    decisions: Array<{
      id: string;
      title: string;
      decision: string;
      reason: string | null;
      consequences: string | null;
      status: Decision["status"];
      created_at: string;
    }>;
    active_decisions: Array<{
      id: string;
      title: string;
      decision: string;
      status: Decision["status"];
    }>;
    recent_activities: Array<{
      id: string;
      type: Activity["type"];
      source: string;
      title: string;
      description: string | null;
      created_at: string;
      occurred_at: string | null;
    }>;
    reference_index: {
      tasks: Array<{
        id: string;
        title: string;
        status: Task["status"];
      }>;
      decisions: Array<{
        id: string;
        title: string;
        status: Decision["status"];
      }>;
      activities: Array<{
        id: string;
        title: string;
        type: Activity["type"];
        source: string;
      }>;
    };
  };
};

function getActivityTimestamp(activity: Activity): number {
  const occurredAt = activity.metadata.occurred_at;

  if (typeof occurredAt === "string") {
    const parsed = Date.parse(occurredAt);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return Date.parse(activity.created_at);
}

function selectTasks(tasks: Task[]) {
  const activeTasks = tasks
    .filter((task) => task.status !== "DONE")
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return Date.parse(a.created_at) - Date.parse(b.created_at);
    })
    .slice(0, 20);

  const recentlyDone = tasks
    .filter((task) => task.status === "DONE")
    .sort(
      (a, b) =>
        Date.parse(b.completed_at ?? b.created_at) -
        Date.parse(a.completed_at ?? a.created_at),
    )
    .slice(0, 10);

  return [...activeTasks, ...recentlyDone];
}

function selectDecisions(decisions: Decision[]) {
  return [...decisions]
    .sort(
      (a, b) =>
        Date.parse(b.created_at) - Date.parse(a.created_at),
    )
    .slice(0, 15);
}

const HISTORICAL_AI_ACTIVITY_TYPES = new Set<Activity["type"]>([
  "AI_REVIEW",
  "AI_TASK_CREATED",
  "AI_TASK_IGNORED",
]);

function selectRecentActivities(activities: Activity[]) {
  return [...activities]
    .filter(
      (activity) => !HISTORICAL_AI_ACTIVITY_TYPES.has(activity.type),
    )
    .sort(
      (a, b) => getActivityTimestamp(b) - getActivityTimestamp(a),
    )
    .slice(0, 20)
    .map((activity) => ({
      id: activity.id,
      type: activity.type,
      source: activity.source,
      title: activity.title,
      description: activity.description,
      created_at: activity.created_at,
      occurred_at:
        typeof activity.metadata.occurred_at === "string"
          ? activity.metadata.occurred_at
          : null,
    }));
}

export async function getProjectAiContext(
  projectId: string,
  focusText: string | null = null,
): Promise<ProjectAiContext> {
  const repositories = await getGithubRepositories(projectId);

  if (repositories.length === 0) {
    throw new Error("Ce projet n'a aucun dépôt GitHub connecté.");
  }

  const repository = repositories[0];

  const [project, tasks, decisions, activities, github] =
    await Promise.all([
      getProject(projectId),
      getTasks(projectId),
      getDecisions(projectId),
      getActivities(projectId),
      getGithubRepositoryContext(
        repository.owner,
        repository.repository,
        focusText,
      ),
    ]);

  return {
    ...github,
    project_os: {
      project: {
        id: project.id,
        name: project.name,
        type: project.type,
        technologies: project.technologies,
        purpose: project.purpose,
        description: project.description,
        current_state: project.current_state,
      },
      tasks: selectTasks(tasks),
      active_tasks: tasks
        .filter((task) => task.status !== "DONE")
        .sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          return Date.parse(a.created_at) - Date.parse(b.created_at);
        })
        .slice(0, 20)
        .map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status as Exclude<Task["status"], "DONE">,
          priority: task.priority,
        })),
      decisions: selectDecisions(decisions),
      active_decisions: decisions
        .filter((decision) => decision.status === "ACTIVE")
        .sort(
          (a, b) =>
            Date.parse(b.created_at) - Date.parse(a.created_at),
        )
        .slice(0, 20)
        .map((decision) => ({
          id: decision.id,
          title: decision.title,
          decision: decision.decision,
          status: decision.status,
        })),
      recent_activities: selectRecentActivities(activities),
      reference_index: {
        tasks: tasks.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
        })),
        decisions: selectDecisions(decisions).map((decision) => ({
          id: decision.id,
          title: decision.title,
          status: decision.status,
        })),
        activities: selectRecentActivities(activities).map((activity) => ({
          id: activity.id,
          title: activity.title,
          type: activity.type,
          source: activity.source,
        })),
      },
    },
  };
}
