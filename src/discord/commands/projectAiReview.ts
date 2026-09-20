import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

import {
  createActivity,
  getActivities,
  getActivity,
} from "../../services/activityService.js";
import { createTask } from "../../services/taskService.js";
import { getProjects } from "../../services/projectService.js";
import { getProjectAiContext } from "../../services/projectAiContextService.js";
import { reviewProjectWithAI } from "../../services/aiService.js";
import { syncGithubProject } from "../../services/githubService.js";
import type { Activity } from "../../types/activity.js";
import type { AiSuggestedTask } from "../../types/aiReview.js";

const DISCORD_MAX_CONTENT_LENGTH = 2000;
const AI_REVIEW_MARKER = "​‌‍";
const AI_REVIEW_CHUNK_LENGTH =
  DISCORD_MAX_CONTENT_LENGTH - AI_REVIEW_MARKER.length;

function splitDiscordMessage(content: string): string[] {
  if (content.length <= AI_REVIEW_CHUNK_LENGTH) {
    return [AI_REVIEW_MARKER + content];
  }

  const chunks: string[] = [];
  let current = "";

  for (const line of content.split("\n")) {
    const candidate =
      current.length === 0
        ? line
        : current + "\n" + line;

    if (candidate.length <= AI_REVIEW_CHUNK_LENGTH) {
      current = candidate;
      continue;
    }

    if (current.length > 0) {
      chunks.push(AI_REVIEW_MARKER + current);
    }

    if (line.length <= AI_REVIEW_CHUNK_LENGTH) {
      current = line;
      continue;
    }

    for (
      let offset = 0;
      offset < line.length;
      offset += AI_REVIEW_CHUNK_LENGTH
    ) {
      chunks.push(
        AI_REVIEW_MARKER +
          line.slice(
            offset,
            offset + AI_REVIEW_CHUNK_LENGTH,
          ),
      );
    }

    current = "";
  }

  if (current.length > 0) {
    chunks.push(AI_REVIEW_MARKER + current);
  }

  return chunks;
}

async function cleanupPreviousAiReviewMessages(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const channel = interaction.channel;

  if (!channel || !("messages" in channel)) {
    return;
  }

  const botId = interaction.client.user?.id;

  if (!botId) {
    return;
  }

  const messages = await channel.messages.fetch({ limit: 100 });

  const previousMessages = messages.filter(
    (message) =>
      message.author.id === botId &&
      message.content.includes(AI_REVIEW_MARKER),
  );

  await Promise.all(
    previousMessages.map(async (message) => {
      try {
        await message.delete();
      } catch (error) {
        console.warn(
          "Impossible de supprimer une ancienne analyse IA :",
          error,
        );
      }
    }),
  );
}

function buildAiTaskCustomId(
  action: "create" | "ignore",
  reviewActivityId: string,
  index: number,
): string {
  return `ai-task:${action}:${reviewActivityId}:${index}`;
}

function buildAiTaskComponents(
  reviewActivityId: string,
  index: number,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(
        buildAiTaskCustomId("create", reviewActivityId, index),
      )
      .setLabel("Créer la tâche")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(
        buildAiTaskCustomId("ignore", reviewActivityId, index),
      )
      .setLabel("Ignorer")
      .setStyle(ButtonStyle.Secondary),
  );
}

function getSuggestedTasks(activity: Activity): AiSuggestedTask[] {
  const raw = activity.metadata.suggested_tasks;

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter(
    (item): item is AiSuggestedTask =>
      !!item &&
      typeof item === "object" &&
      typeof item.title === "string" &&
      typeof item.task_kind === "string" &&
      typeof item.priority === "number" &&
      typeof item.problem === "string" &&
      typeof item.reason === "string" &&
      Array.isArray(item.evidence) &&
      typeof item.confidence === "number",
  );
}

function getExistingAiTaskAction(
  activities: Activity[],
  reviewActivityId: string,
  index: number,
): Activity | null {
  return (
    activities.find(
      (activity) =>
        (activity.type === "AI_TASK_CREATED" ||
          activity.type === "AI_TASK_IGNORED") &&
        activity.metadata.ai_review_activity_id === reviewActivityId &&
        Number(activity.metadata.suggested_task_index) === index,
    ) ?? null
  );
}

export async function handleAiTaskAction(
  interaction: ButtonInteraction,
): Promise<void> {
  await interaction.deferUpdate();

  const match = interaction.customId.match(
    /^ai-task:(create|ignore):([^:]+):(\d+)$/,
  );

  if (!match) {
    await interaction.editReply({
      content: AI_REVIEW_MARKER + "Cette proposition de tâche n'est plus valide.",
      components: [],
    });
    return;
  }

  const action = match[1] as "create" | "ignore";
  const reviewActivityId = match[2];
  const index = Number.parseInt(match[3], 10);

  const reviewActivity = await getActivity(reviewActivityId);

  if (!reviewActivity || reviewActivity.type !== "AI_REVIEW") {
    await interaction.editReply({
      content:
        AI_REVIEW_MARKER +
        "L'analyse IA liée à cette proposition est introuvable.",
      components: [],
    });
    return;
  }

  const suggestedTasks = getSuggestedTasks(reviewActivity);
  const task = suggestedTasks[index];

  if (!task) {
    await interaction.editReply({
      content:
        AI_REVIEW_MARKER +
        "Cette proposition de tâche n'existe plus.",
      components: [],
    });
    return;
  }

  const activities = await getActivities(reviewActivity.project_id);
  const existingAction = getExistingAiTaskAction(
    activities,
    reviewActivity.id,
    index,
  );

  if (existingAction) {
    await interaction.editReply({
      content:
        AI_REVIEW_MARKER +
        (existingAction.type === "AI_TASK_CREATED"
          ? "Cette proposition a déjà été transformée en tâche."
          : "Cette proposition a déjà été ignorée."),
      components: [],
    });
    return;
  }

  if (action === "ignore") {
    await createActivity({
      project_id: reviewActivity.project_id,
      type: "AI_TASK_IGNORED",
      source: "BOT",
      title: "Proposition IA ignorée : " + task.title,
      description: task.problem,
      metadata: {
        ai_review_activity_id: reviewActivity.id,
        suggested_task_index: index,
        task_kind: task.task_kind,
        confidence: task.confidence,
        evidence: task.evidence,
        discord_user_id: interaction.user.id,
        discord_username: interaction.user.username,
      },
    });

    await interaction.update({
      content:
        AI_REVIEW_MARKER +
        "Proposition ignorée : **" +
        task.title +
        "**",
      components: [],
    });
    return;
  }

  const createdTask = await createTask({
    project_id: reviewActivity.project_id,
    title: task.title,
    priority: task.priority,
  });

  await createActivity({
    project_id: reviewActivity.project_id,
    type: "AI_TASK_CREATED",
    source: "BOT",
    title: "Tâche créée depuis l'IA : " + createdTask.title,
    description:
      task.problem + "\n\n" + task.reason,
    metadata: {
      ai_review_activity_id: reviewActivity.id,
      suggested_task_index: index,
      task_id: createdTask.id,
      task_kind: task.task_kind,
      confidence: task.confidence,
      evidence: task.evidence,
      discord_user_id: interaction.user.id,
      discord_username: interaction.user.username,
    },
  });

  await interaction.update({
    content:
      AI_REVIEW_MARKER +
      "Tâche créée : **" +
      createdTask.title +
      "** (priorité " +
      createdTask.priority +
      ")",
    components: [],
  });
}

export const projectAiReviewCommand = {
  data: new SlashCommandBuilder()
    .setName("project-ai-review")
    .setDescription("Analyse un projet avec l'IA")
    .addStringOption((option) =>
      option
        .setName("projet")
        .setDescription("Projet à analyser")
        .setRequired(true)
        .setAutocomplete(true),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const projectId = interaction.options.getString("projet", true);

    await interaction.deferReply();

    try {
      const syncedGithubActivities =
        await syncGithubProject(projectId);

      const context = await getProjectAiContext(projectId);
      const project = context.project_os.project;

      const review = await reviewProjectWithAI(context);

      const reviewActivity = await createActivity({
        project_id: project.id,
        type: "AI_REVIEW",
        source: "BOT",
        title: "Analyse IA : " + project.name,
        description: review.summary,
        metadata: {
          summary: review.summary,
          purpose: review.purpose,
          type: review.type,
          technologies: review.technologies,
          inferred_state: review.inferred_state,
          state_evidence: review.state_evidence,
          observed_features: review.observed_features,
          contradictions: review.contradictions,
          confidence: review.confidence,
          uncertainties: review.uncertainties,
          suggested_tasks: review.suggested_tasks,
          github_sync_created: syncedGithubActivities,
        },
      });

      await cleanupPreviousAiReviewMessages(interaction);

      const lines = [
        "**Analyse IA : " + project.name + "**",
        "",
        "**Résumé**",
        review.summary,
        "",
        "**But du projet**",
        review.purpose,
        "",
        "**Type**",
        review.type,
        "",
        "**Technologies**",
        review.technologies.join(", ") || "Aucune",
        "",
        "**État réel estimé**",
        review.inferred_state,
        ...(review.state_evidence.length > 0
          ? [
              "",
              "**Indications de l'état**",
              ...review.state_evidence
                .slice(0, 5)
                .map(
                  (item) =>
                    "• [" +
                    item.kind +
                    "] " +
                    item.source +
                    " — " +
                    item.claim,
                ),
            ]
          : []),
        "",
        "**Fonctionnalités / sous-systèmes observés**",
        ...(review.observed_features.length > 0
          ? review.observed_features.slice(0, 8).map(
              (feature) =>
                "• **" +
                feature.name +
                "** — " +
                feature.description +
                (feature.evidence.length > 0
                  ? " [" +
                    feature.evidence
                      .slice(0, 2)
                      .map(
                        (item) =>
                          item.kind +
                          ": " +
                          item.source,
                      )
                      .join(" | ") +
                    "]"
                  : ""),
            )
          : ["Aucun identifié avec suffisamment de preuves."]),
        ...(review.contradictions.length > 0
          ? [
              "",
              "**Contradictions / points à vérifier**",
              ...review.contradictions.map(
                (contradiction) =>
                  "• **" +
                  contradiction.title +
                  "** — " +
                  contradiction.description +
                  " [" +
                  contradiction.evidence
                    .slice(0, 4)
                    .map(
                      (item) =>
                        item.kind +
                        ": " +
                        item.source +
                        " — " +
                        item.claim,
                    )
                    .join(" | ") +
                  " | confiance: " +
                  Math.round(contradiction.confidence * 100) +
                  "%]",
              ),
            ]
          : []),
        "",
        "**Confiance globale**",
        Math.round(review.confidence * 100) + "%",
        "",
        "**Incertitudes**",
        ...(review.uncertainties.length > 0
          ? review.uncertainties.map((item) => "• " + item)
          : ["Aucune"]),
        "",
        "**Tâches proposées**",
        ...(review.suggested_tasks.length > 0
          ? [
              "• " +
                review.suggested_tasks.length +
                " proposition(s) — validation manuelle ci-dessous.",
            ]
          : [
              "Aucune tâche : aucune action suffisamment justifiée n'a été identifiée.",
            ]),
        "",
        "**Synchronisation GitHub**",
        syncedGithubActivities === 0
          ? "Déjà à jour."
          : syncedGithubActivities +
            " nouvelle(s) activité(s) importée(s).",
        "",
        "Les tâches proposées ci-dessous nécessitent une validation manuelle.",
      ];

      const chunks = splitDiscordMessage(lines.join("\n"));

      await interaction.editReply(chunks[0]);

      for (const chunk of chunks.slice(1)) {
        await interaction.followUp(chunk);
      }

      for (let index = 0; index < review.suggested_tasks.length; index += 1) {
        const task = review.suggested_tasks[index];

        await interaction.followUp({
          content:
            AI_REVIEW_MARKER +
            "**Proposition de tâche " +
            (index + 1) +
            "**\n" +
            "**" +
            task.title +
            "** [" +
            task.task_kind +
            "] — priorité " +
            task.priority +
            "\n" +
            task.problem +
            "\n" +
            task.reason +
            "\nConfiance : " +
            Math.round(task.confidence * 100) +
            "%",
          components: [
            buildAiTaskComponents(
              reviewActivity.id,
              index,
            ),
          ],
        });
      }
    } catch (error) {
      console.error("Erreur analyse IA :", error);

      const message =
        error instanceof Error
          ? "Analyse IA impossible : " + error.message
          : "Analyse IA impossible.";

      const chunks = splitDiscordMessage(message);

      await interaction.editReply(chunks[0]);

      for (const chunk of chunks.slice(1)) {
        await interaction.followUp(chunk);
      }
    }
  },

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    try {
      const focusedValue = interaction.options.getFocused().toLowerCase();
      const projects = await getProjects();

      const choices = projects
        .filter((project) =>
          project.name.toLowerCase().includes(focusedValue),
        )
        .slice(0, 25)
        .map((project) => ({
          name: project.name,
          value: project.id,
        }));

      await interaction.respond(choices);
    } catch (error) {
      console.error("Erreur autocomplete project-ai-review :", error);
      await interaction.respond([]);
    }
  },
};
