import { useSettingsStore } from "@/stores/settings";
import { OpenAICompatProvider } from "@/lib/providers/openai-compat";
import type { AIMessage } from "@/lib/ai-provider";
import type { EraserDocument } from "./types";

const ERASER_SYSTEM_INSTRUCTION = `You are an expert systems architecture and diagram designer adhering to the Eraser Diagrams format (Model Diagramming Protocol).

Your job is to generate or update a JSON document representing an architecture diagram, flowchart, sequence diagram, or cloud infrastructure.

Return ONLY a valid JSON object matching this structure:
{
  "title": "Diagram Title",
  "description": "Short description",
  "entities": [
    {
      "id": "unique_string_id",
      "tag": "Shape", // "Shape" | "Group" | "Icon" | "Textbox"
      "shape": "rectangle", // "rectangle" | "diamond" | "cylinder" | "parallelogram" | "hexagon" | "circle" | "oval" | "triangle"
      "x": 60,
      "y": 80,
      "width": 140,
      "height": 64,
      "color": "blue", // "blue" | "purple" | "green" | "red" | "yellow" | "orange" | "black" | "white"
      "icon": "server", // optional: "server", "database", "cloud", "user", "robot", "touch", "clock", "shield", "lock", "key", "code", "ai", "sparkle"
      "texts": [{ "text": "Node Label", "fontSize": 13, "hAlign": "center" }],
      "containerId": "layer1" // optional parent group id if inside a group
    },
    {
      "id": "layer1",
      "tag": "Group",
      "x": 30,
      "y": 30,
      "width": 460,
      "height": 360,
      "color": "blue",
      "title": { "text": "Layer 1: Real-time Ingestion", "width": "full", "color": "#2866c4" },
      "isContainer": true
    }
  ],
  "connections": [
    {
      "from": "source_node_id",
      "to": "target_node_id",
      "label": "payload / SQL / Yes / No", // optional
      "endArrowhead": "triangle", // "triangle" | "arrow" | "none"
      "lineStyle": "solid", // "solid" | "dashed" | "dotted"
      "color": "blue" // "blue" | "purple" | "green" | "red" | "yellow" | "orange"
    }
  ]
}

DO NOT include markdown fences, backticks, or explanation. Output ONLY the raw JSON.`;

export async function generateOrUpdateEraserDiagram(
  prompt: string,
  existingDoc?: EraserDocument | null,
  onProgress?: (partial: string) => void
): Promise<EraserDocument> {
  const settings = useSettingsStore.getState();
  const provider = new OpenAICompatProvider(
    settings.aiProvider.baseUrl,
    settings.aiProvider.apiKey,
    settings.aiProvider.model
  );

  const messages: AIMessage[] = [
    { role: "system", content: ERASER_SYSTEM_INSTRUCTION },
  ];

  const isMermaid = /^\s*(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitGraph|subgraph)\b|-->|---|==>/i.test(prompt);

  if (existingDoc && existingDoc.entities && existingDoc.entities.length > 0) {
    messages.push({
      role: "user",
      content: `Here is the current diagram JSON:
${JSON.stringify(existingDoc, null, 2)}

User modification request:
"${prompt}"

Please update the diagram according to the user request. Preserve unaffected nodes/groups and layout where appropriate, and modify/add elements as requested. Return ONLY the complete updated JSON.`,
    });
  } else if (isMermaid) {
    messages.push({
      role: "user",
      content: `You are converting and upgrading this Mermaid diagram into a rich, modern Eraser Diagram:
\`\`\`mermaid
${prompt}
\`\`\`

Instructions for transformation:
1. Parse all nodes, text labels, directional connections, and subgraphs from the Mermaid code.
2. Group related nodes into Container Groups (tag "Group", isContainer: true) if subgraphs exist, or if logical layers exist (e.g. Frontend, Backend, Database).
3. Assign appropriate shapes:
   - "cylinder" for databases/storage/caches
   - "diamond" for decision/condition branches
   - "rectangle" for services, APIs, and client modules
4. Assign meaningful icons:
   - "database" or "postgres" for data stores
   - "server" or "cloud" for backend services / API gateways
   - "user" or "touch" for clients / users
   - "robot" or "ai" for AI / workers
   - "shield" or "key" for auth / security
   - "clock" for rate limiters / poller
5. Assign harmonious colors from the Eraser palette ("blue", "purple", "green", "red", "yellow", "orange").
6. Compute non-overlapping (x, y) coordinates with ample room for clean orthogonal connectors.
7. Return ONLY the valid Eraser diagram JSON document.`,
    });
  } else {
    messages.push({
      role: "user",
      content: `Create a professional architecture diagram based on this prompt:
"${prompt}"

Choose appropriate layout coordinates (x, y non-overlapping, with space for arrows), logical groupings/containers if multi-tier, distinct colors from the palette, shape types (cylinders for databases, diamonds for decisions, rectangles for services), and clean connections with arrows and labels. Return ONLY the raw JSON.`,
    });
  }

  let accumulated = "";

  return new Promise((resolve, reject) => {
    provider.streamChat(
      messages,
      [],
      (token) => {
        accumulated += token;
        onProgress?.(accumulated);
      },
      () => {},
      () => {
        try {
          // Clean possible markdown fences or extra text
          let cleanJson = accumulated.trim();
          if (cleanJson.startsWith("```")) {
            cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
          }
          const doc: EraserDocument = JSON.parse(cleanJson);
          if (!doc.entities) doc.entities = [];
          if (!doc.connections) doc.connections = [];
          resolve(doc);
        } catch (err) {
          console.error("Failed to parse AI generated Eraser diagram:", err, accumulated);
          reject(new Error("Failed to parse diagram JSON from AI response"));
        }
      },
      (error) => {
        reject(error);
      }
    );
  });
}
