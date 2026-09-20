import { discordClient, startDiscord } from "./lib/discord.js";

try {
  await startDiscord();

  console.log(
    `Discord connecté en tant que ${discordClient.user?.tag}`,
  );
} catch (error) {
  console.error(error);
}
