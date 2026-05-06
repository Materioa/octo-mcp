import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type QuestionType = {
  type: string;
  count?: number;
  marksEach?: number;
  totalMarks?: number;
  notes?: string;
};

const BLOOMS_LEVELS = ["remember", "understand", "apply", "analyse", "evaluate", "create"] as const;

const DEFAULT_TEMPLATE_SKILL = String.raw`---
name: worksheet-sample-paper-template
version: 1.0.0
description: "Formal worksheet, sample paper, question paper, and question bank template inspired by university exam layouts."
---

# Worksheet / Sample Paper Template

## Page
- Use A4 portrait layout.
- Use a formal serif font such as Times New Roman.
- Body font size: 11-12 pt.
- Keep margins balanced and print-friendly.

## Header
- Top row: Seat No. with dotted line on the left, Enrollment No. with dotted line on the right.
- Center title block in bold uppercase:
  - Institution name
  - Faculty / department name
  - Exam or worksheet title
- Metadata block below title:
  - Left side: semester/class, subject code, subject name.
  - Right side: date, time/duration, total marks.

## Instructions
- Add an "Instructions:" heading.
- Number instructions clearly.
- If Bloom's taxonomy is enabled, include the BT legend:
  - Remember-1, Understand-2, Apply-3, Analyse-4, Evaluate-5, Create-6.

## Body
- For sample papers/question papers/question banks, divide into SECTION - A, SECTION - B, etc. when useful.
- Use a bordered table for questions with columns:
  - Question number
  - Question text
  - Marks
  - CO
  - BT
- For worksheets, sections may be activity-based, but keep marks visible when provided.
- For question banks, group questions by type, unit, difficulty, or Bloom's level when relevant.
- Keep subquestions as (i), (ii), (iii) under the parent question.
- Put marks aligned to the right or in a marks column.

## Answer Key
- If answer key is "after_question", place the answer directly after each question in a clearly labeled line.
- If answer key is "at_last", add a final "Answer Key" section after all questions.
- If answer key is "none", do not include answers.
`;

const QuestionTypeSchema = z.object({
  type: z.string().describe("Question type, e.g. mcq, fill_blanks, short_answer, long_answer, case_study, numericals."),
  count: z.number().int().positive().optional().describe("Number of questions of this type."),
  marksEach: z.number().positive().optional().describe("Marks per question."),
  totalMarks: z.number().positive().optional().describe("Total marks allotted to this question type."),
  notes: z.string().optional().describe("Any special instructions for this question type."),
});

const GeneratorSchema = {
  documentKind: z
    .enum(["worksheet", "sample_paper", "question_paper", "question_bank"])
    .optional()
    .describe("What to generate: worksheet, sample_paper, question_paper, or question_bank."),
  subject: z.string().optional().describe("Subject name."),
  topic: z.string().optional().describe("Topic, chapter, unit, or syllabus scope."),
  audience: z.string().optional().describe("Class, grade, semester, or learner level."),
  semester: z.string().optional().describe("Semester or academic term."),
  institutionName: z.string().optional().describe("Institution name for the header."),
  facultyOrDepartment: z.string().optional().describe("Faculty, department, school, or program name."),
  examTitle: z.string().optional().describe("Exam, worksheet, or paper title."),
  subjectCode: z.string().optional().describe("Optional subject/course code."),
  date: z.string().optional().describe("Optional paper date."),
  duration: z.string().optional().describe("Optional duration or time window."),
  totalMarks: z.number().positive().optional().describe("Total marks for the paper."),
  answerKey: z
    .enum(["none", "at_last", "after_question"])
    .optional()
    .describe("Answer key preference: none, at_last, or after_question."),
  blooms: z
    .object({
      enabled: z.boolean(),
      levels: z.array(z.enum(BLOOMS_LEVELS)).optional(),
    })
    .optional()
    .describe("Whether to follow Bloom's taxonomy and which levels to include."),
  difficulty: z.enum(["easy", "medium", "hard"]).optional().describe("Overall difficulty."),
  questionTypes: z.array(QuestionTypeSchema).optional().describe("Question types and marks distribution."),
  outputFormat: z.enum(["md", "docx", "pdf"]).optional().describe("Preferred output format."),
  sourceMaterial: z.string().optional().describe("Reference notes, syllabus, chapter text, fetched content, attachment summaries, or constraints to base questions on."),
  sourceMode: z
    .enum(["materio", "attachment", "external", "mixed"])
    .optional()
    .describe("Primary source mode: materio resource library, user attachment, outside external resources, or mixed."),
  sourceValidationPlan: z
    .string()
    .optional()
    .describe("Short note describing how the host should validate or ground the content before generation."),
  customInstructions: z.string().optional().describe("Additional generation instructions."),
  templateSkillMd: z.string().optional().describe("Template Skill.md content to apply. If omitted, the default formal template is used."),
};

const TemplateSchema = {
  operation: z.enum(["create", "edit"]).describe("Create a new template or edit an existing template."),
  templateName: z.string().optional().describe("Name for the template skill."),
  templateDescription: z.string().describe("User's requested template structure and formatting rules."),
  existingTemplateSkillMd: z.string().optional().describe("Existing Skill.md content when editing a template."),
  referenceImageNotes: z.string().optional().describe("Optional description of a reference image or layout."),
};

const REQUIRED_GENERATOR_FIELDS: Array<keyof typeof GeneratorSchema> = [
  "documentKind",
  "subject",
  "topic",
  "answerKey",
  "blooms",
  "difficulty",
  "questionTypes",
  "outputFormat",
];

function missingGeneratorFields(input: Record<string, unknown>): string[] {
  return REQUIRED_GENERATOR_FIELDS.filter((field) => input[field] === undefined);
}

function stringifyQuestionTypes(questionTypes: QuestionType[] | undefined): string {
  if (!questionTypes?.length) return "Not provided";
  return questionTypes
    .map((q) => {
      const parts = [q.type];
      if (q.count) parts.push(`${q.count} questions`);
      if (q.marksEach) parts.push(`${q.marksEach} marks each`);
      if (q.totalMarks) parts.push(`${q.totalMarks} total marks`);
      if (q.notes) parts.push(q.notes);
      return `- ${parts.join("; ")}`;
    })
    .join("\n");
}

function buildClaudeModalGuidance(): string {
  return `Claude-specific interaction:
If any required field is missing, call Claude's internal ask_user_input_v0 tool as a sequence/modal with these questions, then call this MCP tool again with the collected values.

Questions:
1. Answer key: yes/no. If yes, place it at last or after each question?
2. Follow Bloom's taxonomy: yes/no. If yes, which levels should be included? remember, understand, apply, analyse, evaluate, create.
3. Difficulty: easy, medium, or hard?
4. Question types and marks distribution: MCQ, fill blanks, short questions, long questions, case studies, numericals, etc.
5. Output format: docx, pdf, or md.`;
}

function buildGenerationPrompt(input: z.infer<z.ZodObject<any>>): string {
  const template = input.templateSkillMd || DEFAULT_TEMPLATE_SKILL;
  const bloomsText = input.blooms?.enabled
    ? `Enabled. Include levels: ${(input.blooms.levels || []).join(", ") || "balanced across relevant levels"}.`
    : "Disabled.";
  const sourceMode = input.sourceMode || "mixed";
  const sourceValidationPlan =
    input.sourceValidationPlan ||
    `If the requested semester/subject/topic exists in Materio, gather relevant syllabus and content using Materio tools before generating. If the user supplied attachments or outside resources, extract and ground the content from those materials first. Do not invent syllabus coverage.`;

  return `You are generating a polished ${input.documentKind} using the template and requirements below.

## Output Contract
- Produce the final ${input.outputFormat?.toUpperCase()} content.
- If outputFormat is md, return clean Markdown.
- If outputFormat is docx or pdf, create the document in that format when the host environment supports document generation; otherwise return document-ready Markdown with clear conversion guidance.
- Follow the template faithfully.
- Do not include meta commentary.

## Template Skill.md
${template}

## Paper Details
- Document kind: ${input.documentKind}
- Institution: ${input.institutionName || "Not provided"}
- Faculty/Department: ${input.facultyOrDepartment || "Not provided"}
- Exam/Worksheet title: ${input.examTitle || "Not provided"}
- Subject: ${input.subject}
- Subject code: ${input.subjectCode || "Not provided"}
- Audience: ${input.audience || "Not provided"}
- Semester/term: ${input.semester || "Not provided"}
- Topic/scope: ${input.topic}
- Date: ${input.date || "Not provided"}
- Duration: ${input.duration || "Not provided"}
- Total marks: ${input.totalMarks || "Derive from marks distribution"}
- Difficulty: ${input.difficulty}
- Answer key: ${input.answerKey}
- Bloom's taxonomy: ${bloomsText}

## Question Types And Marks Distribution
${stringifyQuestionTypes(input.questionTypes)}

## Source Material
- Source mode: ${sourceMode}
- Validation plan: ${sourceValidationPlan}
- Source content: ${input.sourceMaterial || "Fetch and ground from relevant source material before writing questions."}

## Additional Instructions
${input.customInstructions || "None."}

## Quality Rules
- Ground the generated questions in the validated source material before writing.
- If Materio content is available, align to semester, subject, and syllabus scope instead of guessing.
- If attachments or outside resources are provided, prioritize those materials and stay within their scope.
- Use a formal academic tone.
- Ensure marks add up to total marks when total marks is provided.
- Keep questions unambiguous and age/level appropriate.
- If Bloom's taxonomy is enabled, add BT labels to questions.
- Add CO labels when the template asks for CO and no CO map is provided; use CO1, CO2, etc. consistently.
- Answer key placement must exactly match the answerKey setting.
- For question banks, prefer broad and reusable coverage across the validated scope rather than one sitting-style paper flow.`;
}

function buildTemplateSkill(input: z.infer<z.ZodObject<any>>): string {
  const name = (input.templateName || "custom-worksheet-paper-template")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const base = input.existingTemplateSkillMd
    ? `\n## Existing Template To Preserve Or Modify\n${input.existingTemplateSkillMd}\n`
    : "";
  const reference = input.referenceImageNotes
    ? `\n## Reference Image Notes\n${input.referenceImageNotes}\n`
    : "";

  return `---
name: ${name}
version: 1.0.0
description: "Custom worksheet, sample paper, question paper, and question bank layout template."
---

# ${input.templateName || "Custom Worksheet / Paper Template"}

## Intent
Use this Skill.md as template context for generating worksheets, sample papers, question papers, and question banks in the current chat or a future chat.

## User Template Request
${input.templateDescription}
${reference}${base}
## Template Requirements
- Define the header layout, including logo placement, title block, metadata fields, and alignment.
- Define body typography, section headings, spacing, tables, marks columns, and answer key placement.
- Specify whether worksheets, sample papers, question papers, and question banks should share the same layout or use variants.
- Preserve user-specified font sizes, margins, logos, labels, and field positions.
- When information is missing, use a clean formal academic default rather than asking again.

## Default Fallback Structure
${DEFAULT_TEMPLATE_SKILL}`;
}

export function registerWorksheetPaperTools(server: McpServer): void {
  server.registerTool(
    "CreateWorksheetPaper",
    {
      title: "Create Worksheet / Sample Paper / Question Paper / Question Bank",
      description: `Create a worksheet, sample paper, question paper, or question bank using a formal template.

Required user choices:
- Answer key: no, at last, or after each question
- Bloom's taxonomy: yes/no and levels to include
- Difficulty: easy/medium/hard
- Question types and marks distribution
- Format: docx/pdf/md

Grounding requirements:
- When semester/subject/topic map to the Materio library, the host should fetch or ground from relevant Materio tools such as ResourceLibrary, GlobalSearch, SnapSearch, DeepThink, ConceptExplorer, or ResourceAccess before generating.
- When the user provides attached PDFs, notes, or outside resources, the host should ground the paper on those materials instead of assuming Materio coverage.

For Claude: if required choices are missing, call ask_user_input_v0 as a modal/sequence with those questions, then call this tool again. This tool does not run ask_user_input_v0 itself.`,
      inputSchema: GeneratorSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      const missing = missingGeneratorFields(input as Record<string, unknown>);
      if (missing.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  status: "requires_input",
                  missingFields: missing,
                  claudeModalGuidance: buildClaudeModalGuidance(),
                  fallbackPlainQuestions: [
                    "Answer key: no, at last, or after each question?",
                    "Follow Bloom's taxonomy? If yes, which levels should be included?",
                    "Difficulty: easy, medium, or hard?",
                    "Which question types should be included, and what marks distribution should each type have?",
                    "Output format: docx, pdf, or md?",
                  ],
                },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: buildGenerationPrompt(input as any),
          },
        ],
      };
    }
  );

  server.registerTool(
    "CreateOrEditPaperTemplate",
    {
      title: "Create or Edit Worksheet / Paper Template Skill",
      description: `Create or edit a reusable Skill.md template for worksheets, sample papers, question papers, and question banks.

The generated Skill.md should be kept in the current chat context and can be supplied back to CreateWorksheetPaper as templateSkillMd. The user can also reuse the returned Skill.md in future chats as template context.`,
      inputSchema: TemplateSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      return {
        content: [
          {
            type: "text" as const,
            text: buildTemplateSkill(input as any),
          },
        ],
      };
    }
  );
}
