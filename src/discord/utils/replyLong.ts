import { ChatInputCommandInteraction } from "discord.js";

const DISCORD_MESSAGE_LIMIT = 2000;
const SAFE_MESSAGE_LIMIT = 1900;

function splitMessage(content: string, maxLength = SAFE_MESSAGE_LIMIT): string[] {
  const chunks: string[] = [];
  let remaining = content.trim();

  while (remaining.length > maxLength) {
    let cut = remaining.lastIndexOf("\n", maxLength);

    if (cut < maxLength * 0.5) {
      cut = remaining.lastIndexOf(" ", maxLength);
    }

    if (cut <= 0) {
      cut = maxLength;
    }

    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

export async function replyLong(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<void> {
  const chunks = splitMessage(content, Math.min(SAFE_MESSAGE_LIMIT, DISCORD_MESSAGE_LIMIT));

  if (chunks.length === 0) {
    await interaction.editReply("Aucune réponse générée.");
    return;
  }

  await interaction.editReply(chunks[0]);

  for (let index = 1; index < chunks.length; index += 1) {
    await interaction.followUp(chunks[index]);
  }
}
