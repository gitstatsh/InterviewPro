import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";
import type { AIGenerateInput, GenerateFromJDInput, QuestionCreateInput } from "@interview/shared";

const client = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY ?? "",
});

export async function generateQuestions(
  input: AIGenerateInput
): Promise<Omit<QuestionCreateInput, "isGlobal">[]> {
  if (!env.ANTHROPIC_API_KEY) {
    throw Object.assign(
      new Error("AI question generation requires ANTHROPIC_API_KEY to be set"),
      { code: "AI_NOT_CONFIGURED", statusCode: 503 }
    );
  }

  const systemPrompt = `You are an expert technical interviewer. Generate exactly ${input.count} interview questions for the given topic.

Return ONLY a valid JSON array with this exact shape (no markdown, no explanation):
[
  {
    "title": "Short question title (max 100 chars)",
    "body": "Full question with any necessary context, code snippets, or sub-questions. Be specific and actionable.",
    "expectedAnswer": "Key points the interviewer should listen for in a strong answer.",
    "tags": ["tag1", "tag2"]
  }
]

Rules:
- Each question must be practical and relevant to real interviews
- Difficulty: ${input.difficulty}
- Category: ${input.category}
- Tags should be specific technologies or concepts (max 5 per question)
- Body should be 2-5 sentences minimum
- Expected answer should outline 3-5 key evaluation criteria`;

  const topicClause = input.topic ? ` about: ${input.topic}` : "";
  const subCatClause = input.subCategory ? ` (sub-category: ${input.subCategory})` : "";
  const userPrompt = `Generate ${input.count} ${input.difficulty.toLowerCase()} ${input.category}${subCatClause} interview questions${topicClause}${input.context ? `\n\nAdditional context: ${input.context}` : ""}`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: userPrompt }],
    system: systemPrompt,
  });

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as any).text)
    .join("");

  let parsed: any[];
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    // Try to extract JSON array from response if Claude added any extra text
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("AI returned invalid JSON");
    parsed = JSON.parse(match[0]);
  }

  if (!Array.isArray(parsed)) throw new Error("AI response was not an array");

  return parsed.map((q: any) => ({
    title: String(q.title ?? "").slice(0, 200),
    body: String(q.body ?? ""),
    category: input.category,
    difficulty: input.difficulty,
    tags: Array.isArray(q.tags) ? q.tags.map(String).slice(0, 10) : [],
    expectedAnswer: q.expectedAnswer ? String(q.expectedAnswer) : undefined,
    aiGenerated: true,
  })) as any;
}

export async function generateQuestionsFromJD(
  input: GenerateFromJDInput
): Promise<Omit<QuestionCreateInput, "isGlobal">[]> {
  if (!env.ANTHROPIC_API_KEY) {
    throw Object.assign(
      new Error("AI question generation requires ANTHROPIC_API_KEY to be set"),
      { code: "AI_NOT_CONFIGURED", statusCode: 503 }
    );
  }

  const systemPrompt = `You are an expert technical interviewer and talent acquisition specialist.
You will receive a job description and must generate targeted interview questions that assess the exact skills, experience, and competencies required for the role.

Analyze the job description to identify:
- Required technical skills and technologies
- Key responsibilities and domains
- Experience level expected
- Soft skills and behavioral requirements

Then generate exactly ${input.count} interview questions covering those areas.

Return ONLY a valid JSON array with this exact shape (no markdown, no explanation):
[
  {
    "title": "Short question title (max 100 chars)",
    "body": "Full question with context. Be specific to the role requirements.",
    "category": "The skill area being assessed (e.g. React, System Design, Leadership)",
    "subCategory": "More specific sub-topic if applicable (e.g. Hooks, Microservices)",
    "expectedAnswer": "Key points the interviewer should listen for in a strong answer.",
    "tags": ["tag1", "tag2"]
  }
]

Rules:
- Questions must directly reflect skills/requirements mentioned in the JD
- Difficulty: ${input.difficulty}
- Mix technical, situational, and behavioral questions appropriate to the role
- Tags should be specific technologies or concepts mentioned in the JD (max 5 per question)
- Body should be 2-4 sentences, practical and role-specific
- Expected answer should outline 3-5 evaluation criteria`;

  const userPrompt = `Generate ${input.count} ${input.difficulty.toLowerCase()} interview questions based on this job description:\n\n${input.jobDescription}`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 6000,
    messages: [{ role: "user", content: userPrompt }],
    system: systemPrompt,
  });

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as any).text)
    .join("");

  let parsed: any[];
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("AI returned invalid JSON");
    parsed = JSON.parse(match[0]);
  }

  if (!Array.isArray(parsed)) throw new Error("AI response was not an array");

  return parsed.map((q: any) => ({
    title: String(q.title ?? "").slice(0, 200),
    body: String(q.body ?? ""),
    category: String(q.category ?? "General"),
    subCategory: q.subCategory ? String(q.subCategory) : undefined,
    difficulty: input.difficulty,
    tags: Array.isArray(q.tags) ? q.tags.map(String).slice(0, 10) : [],
    expectedAnswer: q.expectedAnswer ? String(q.expectedAnswer) : undefined,
    aiGenerated: true,
  })) as any;
}
