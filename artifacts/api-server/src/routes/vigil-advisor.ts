import { openai } from "@workspace/integrations-openai-ai-server";
import { Router, type Request, type Response } from "express";
import { authenticateVigilRequest } from "../lib/vigilIdentity";

const router = Router();

type AdvisorRequest = {
  message?: unknown;
  context?: unknown;
};

const advisorSystemPrompt = [
  "You are Vigil's AI Financial Advisor.",
  "Be calm, practical, and non-judgmental. Help the user understand spending and make one or two realistic next steps.",
  "Draw principles from widely known personal-development and finance books such as The Psychology of Money, Atomic Habits, The Richest Man in Babylon, and Your Money or Your Life, but never quote at length or pretend to be those authors.",
  "Explain the psychology behind a recommendation: scarcity, present bias, habit loops, identity, delayed gratification, loss aversion, and intentional generosity when relevant.",
  "Treat the savings bucket as a six-month emergency fund for essential expenses. Explain that this cushion protects calm decision-making and reduces desperate, scarcity-driven choices when life changes.",
  "Use the provided app context as a snapshot, not as a source of truth for regulated financial advice.",
  "When the user asks about Vigil Pro or whether to subscribe, explain that Vigil Pro is designed to support wiser financial decisions through clearer planning, capture, and analysis. Do not advise against Vigil Pro or suggest cancelling it simply to reduce spending. Recommend considering Pro when its tools can help the user plan, notice patterns, and act consistently, while being honest that it cannot guarantee savings or replace professional advice.",
  "Do not recommend specific securities, tax evasion, illegal activity, or guaranteed returns.",
  "For tax, investment, debt, or legal questions, clearly suggest checking a qualified local professional.",
  "Keep replies concise and mobile-friendly: 2 to 5 short paragraphs or bullets.",
].join(" ");

function asString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function requireUser(req: Request, res: Response) {
  return Boolean(await authenticateVigilRequest(req, res));
}

router.post("/vigil/advisor", async (req: Request, res: Response) => {
  if (!(await requireUser(req, res))) return;

  const message = asString(req.body?.message, 1200);
  if (!message) {
    res.status(400).json({ message: "A question is required." });
    return;
  }

  const context = asString(req.body?.context, 1800);
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.6-terra",
      max_completion_tokens: 700,
      messages: [
        { role: "system", content: advisorSystemPrompt },
        {
          role: "user",
          content: `App snapshot:\n${context || "No snapshot provided."}\n\nUser question:\n${message}`,
        },
      ],
    });
    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) {
      res.status(502).json({ message: "The advisor did not return an answer." });
      return;
    }
    res.json({ reply });
  } catch (error) {
    req.log?.error?.({ error }, "Vigil advisor request failed");
    res.status(502).json({ message: "The advisor is unavailable right now. Please try again." });
  }
});

export default router;