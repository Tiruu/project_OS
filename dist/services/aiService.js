import "dotenv/config";
const reviewSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
        summary: { type: "string" },
        purpose: { type: "string" },
        type: { type: "string" },
        technologies: {
            type: "array",
            items: { type: "string" },
        },
        inferred_state: { type: "string" },
        state_evidence: {
            type: "array",
            items: { type: "string" },
        },
        observed_features: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    evidence: {
                        type: "array",
                        items: { type: "string" },
                    },
                },
                required: ["name", "description", "evidence"],
            },
        },
        confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
        },
        uncertainties: {
            type: "array",
            items: { type: "string" },
        },
        suggested_tasks: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                properties: {
                    title: { type: "string" },
                    task_kind: {
                        type: "string",
                        enum: [
                            "BUG",
                            "INCOMPLETE",
                            "DESIGN_GAP",
                            "REFACTOR",
                            "DOCUMENTATION",
                            "TEST",
                        ],
                    },
                    priority: {
                        type: "integer",
                        minimum: 1,
                        maximum: 5,
                    },
                    problem: { type: "string" },
                    reason: { type: "string" },
                    evidence: {
                        type: "array",
                        items: { type: "string" },
                    },
                    confidence: {
                        type: "number",
                        minimum: 0,
                        maximum: 1,
                    },
                },
                required: [
                    "title",
                    "task_kind",
                    "priority",
                    "problem",
                    "reason",
                    "evidence",
                    "confidence",
                ],
            },
        },
    },
    required: [
        "summary",
        "purpose",
        "type",
        "technologies",
        "inferred_state",
        "state_evidence",
        "observed_features",
        "confidence",
        "uncertainties",
        "suggested_tasks",
    ],
};
function getOllamaConfig() {
    const rawThink = process.env.OLLAMA_THINK?.trim().toLowerCase() || "low";
    const think = rawThink === "false"
        ? false
        : rawThink === "medium"
            ? "medium"
            : rawThink === "high"
                ? "high"
                : rawThink === "max"
                    ? "max"
                    : "low";
    return {
        url: process.env.OLLAMA_URL?.trim() ||
            "http://localhost:11434/api/chat",
        model: process.env.OLLAMA_MODEL?.trim() ||
            "qwen3.5:4b",
        think,
    };
}
function validateSuggestedTasks(tasks) {
    return tasks
        .filter((task) => task.title.trim().length > 0)
        .filter((task) => task.problem.trim().length > 0)
        .filter((task) => task.reason.trim().length > 0)
        .filter((task) => task.evidence.length > 0)
        .filter((task) => task.confidence >= 0 && task.confidence <= 1)
        .filter((task) => task.priority >= 1 && task.priority <= 5)
        .slice(0, 3);
}
export async function reviewProjectWithAI(context) {
    const { url, model, think } = getOllamaConfig();
    const instructions = [
        "Tu es l'analyste technique de Project OS.",
        "",
        "Ta mission est de comprendre un dépôt GitHub pour un développeur solo, puis de produire une analyse fondée sur des preuves présentes dans les données fournies.",
        "",
        "Hiérarchie de confiance des sources :",
        "1. contenu réel des fichiers sélectionnés",
        "2. README et documentation",
        "3. structure du dépôt",
        "4. package/configuration",
        "5. historique GitHub",
        "6. métadonnées du dépôt",
        "7. données déjà stockées dans Project OS",
        "",
        "Règles impératives pour l'analyse :",
        "- N'affirme jamais qu'une fonctionnalité existe uniquement parce que son nom est suggéré par un dossier, un commit ou une description.",
        "- Chaque fonctionnalité observée doit citer au moins un fichier présent dans selected_files ou repository_tree.",
        "- Ne confonds jamais l'état administratif de Project OS avec l'état réel du projet.",
        "- inferred_state est ton estimation de l'état réel du projet. Le current_state fourni par Project OS est seulement un indice historique.",
        "- state_evidence doit citer les éléments qui justifient inferred_state.",
        "- technologies doit contenir uniquement les technologies réellement observables ou très solidement déduites.",
        "- purpose décrit le but probable du projet à partir des preuves disponibles.",
        "- observed_features doit lister 2 à 8 fonctionnalités ou sous-systèmes réellement observables quand c'est possible.",
        "",
        "Règles impératives pour les tâches :",
        "- Tu n'es PAS chargé de remplir une roadmap. Tu peux proposer zéro tâche.",
        "- Une absence de fonctionnalité n'est PAS un problème en soi.",
        "- Avant de proposer une tâche, cherche explicitement dans les fichiers fournis si la fonctionnalité est déjà implémentée.",
        "- Si les preuves montrent que la fonctionnalité existe déjà, ne propose pas de tâche pour simplement l'ajouter.",
        "- Une tâche n'est autorisée que si tu peux identifier un problème concret : bug, fonctionnalité réellement incomplète, dette/refactor clairement justifié, trou de conception documenté, documentation manquante explicitement nécessaire, ou test justifié par un comportement critique/non couvert et réellement identifiable.",
        "- Une tâche de type TEST n'est PAS justifiée simplement parce qu'aucun test n'a été vu.",
        "- Une tâche de type DESIGN_GAP n'est PAS justifiée simplement parce qu'une fonctionnalité n'existe pas.",
        "- Interdis les recommandations génériques du type 'ajouter des tests', 'améliorer les performances', 'mettre à jour les dépendances', 'ajouter des notifications' ou 'gérer les branches' sans problème concret observé.",
        "- Pour chaque tâche, problem explique le problème réellement observé.",
        "- Pour chaque tâche, reason explique pourquoi ce problème mérite une action maintenant.",
        "- evidence doit citer au moins un fichier ou élément précis qui démontre le problème.",
        "- Si tu n'as pas suffisamment de preuves pour une tâche, place le point dans uncertainties et ne crée pas de tâche.",
        "- suggested_tasks contient au maximum 3 tâches. Il est préférable d'en produire 0 à 2 que d'inventer des améliorations.",
        "- confidence est entre 0 et 1.",
        "- Réponds strictement selon le JSON schema fourni.",
        "",
        "Contrainte importante :",
        "Le fait qu'un dépôt soit privé ne signifie pas que les données sont inaccessibles. Analyse uniquement les données effectivement fournies par Project OS.",
    ].join("\n");
    const input = JSON.stringify(context);
    let response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model,
                stream: false,
                think,
                format: reviewSchema,
                messages: [
                    {
                        role: "system",
                        content: instructions,
                    },
                    {
                        role: "user",
                        content: "Analyse ce dépôt GitHub pour Project OS :\n\n" +
                            input,
                    },
                ],
                options: {
                    temperature: 0,
                },
            }),
        });
    }
    catch {
        throw new Error("Impossible de joindre Ollama sur " +
            url +
            ". Vérifie qu'Ollama est lancé et que le modèle \"" +
            model +
            "\" est installé.");
    }
    if (!response.ok) {
        const body = await response.text();
        throw new Error("Ollama API " +
            response.status +
            " : " +
            body.slice(0, 500));
    }
    const data = (await response.json());
    const outputText = data.message?.content;
    if (!outputText) {
        throw new Error("Ollama n'a renvoyé aucun contenu exploitable.");
    }
    try {
        const parsed = JSON.parse(outputText);
        if (typeof parsed.confidence !== "number" ||
            parsed.confidence < 0 ||
            parsed.confidence > 1) {
            throw new Error("confidence invalide");
        }
        parsed.suggested_tasks = validateSuggestedTasks(parsed.suggested_tasks);
        return parsed;
    }
    catch {
        throw new Error("Ollama a répondu avec un JSON invalide ou incohérent.");
    }
}
