import 'dotenv/config';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const MODEL_ID =
  process.env.BEDROCK_MODEL_ID ||
  'us.anthropic.claude-sonnet-4-5-20250929-v1:0';

export async function getAiJobRecommendations(studentInfo, jobs) {
  // Fallback if something blows up
  const stub = () =>
    jobs.slice(0, 5).map((j) => ({
      id: j.id,
      reason: `Match for "${j.job_name}" based on your skills.`,
    }));

  if (!jobs?.length) return [];

  // Compact payload for the model (don’t dump huge unused fields)
  const jobPayload = jobs.map((j) => ({
    id: j.id,
    job_name: j.job_name,
    pay_range: j.pay_range,
    job_description: j.job_description,
    required_experience: j.required_experience,
  }));

  const prompt = `
You match a student to job listings.

Student skills:
${studentInfo.skills_raw_input}

Student project:
${studentInfo.project_description}

Jobs (JSON):
${JSON.stringify(jobPayload)}

Return ONLY a valid JSON array (no markdown, no extra text), maximum 5 items.
Each item must be: {"id": <number from jobs list>, "reason": "<one short sentence>"}
Only use ids that appear in the jobs list.
If fewer than 5 jobs exist, return fewer items.
`.trim();

  try {
    const command = new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const response = await client.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));

    // Claude on Bedrock: result.content[0].text is the model text
    let text = result?.content?.[0]?.text ?? '';
    text = text.trim();

    // If model wraps in ```json ... ```, strip it
    if (text.startsWith('```')) {
      text = text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
    }

    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      console.error('AI did not return an array:', parsed);
      return stub();
    }

    // Validate: real ids only, clean reasons, max 5
    const allowed = new Set(jobs.map((j) => j.id));
    const cleaned = parsed
      .map((item) => ({
        id: Number(item.id),
        reason: String(item.reason ?? '').trim(),
      }))
      .filter(
        (item) =>
          Number.isInteger(item.id) &&
          allowed.has(item.id) &&
          item.reason.length > 0
      )
      .slice(0, 5);

    if (!cleaned.length) {
      console.error('AI returned no valid recommendations:', parsed);
      return stub();
    }

    return cleaned;
  } catch (err) {
    console.error('Bedrock recommendation failed:', err);
    return stub();
  }
}