import { getProjectDashboard } from "./services/projectDashboardService.js";
import { discordClient, startDiscord } from "./lib/discord.js";
const projectId = "62032ca3-4d5a-47fc-9303-985f122e5629";
try {
    const dashboard = await getProjectDashboard(projectId);
    console.log(`Projet : ${dashboard.project.name}`);
    console.log(`État : ${dashboard.project.current_state ?? "Non défini"}`);
    await startDiscord();
    console.log(`Discord connecté en tant que ${discordClient.user?.tag}`);
}
catch (error) {
    console.error(error);
}
