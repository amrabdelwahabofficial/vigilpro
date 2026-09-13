import { openai } from "@workspace/integrations-openai-ai-server";
import { Router, type Request, type Response } from "express";
import { authenticateVigilRequest } from "../lib/vigilIdentity";

const router = Router();

function asString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function requireUser(req: Request, res: Response) {
  return Boolean(await authenticateVigilRequest(req, res));
}

type Capture = { amount: number; note: string; date: string | null; currency: string | null };

function normalizeCurrency(value: unknown) {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

function parseCaptures(content: string): Capture[] {
  const normalized = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(normalized) as unknown;
    const candidates =
      Array.isArray(parsed)
        ? parsed
        : typeof parsed === "object" && parsed !== null && "transactions" in parsed
          ? (parsed as { transactions: unknown }).transactions
          : [parsed];
    if (!Array.isArray(candidates)) return [];
    return candidates
      .slice(0, 50)
      .map((candidate) => {
        const item = candidate as { amount?: unknown; note?: unknown; date?: unknown; currency?: unknown };
        return {
          amount:
            typeof item.amount === "number" && Number.isFinite(item.amount)
              ? Math.max(0, item.amount)
              : 0,
          note: asString(item.note, 180),
          date: typeof item.date === "string" ? item.date.slice(0, 10) : null,
          currency: normalizeCurrency(item.currency),
        };
      })
      .filter((item) => item.amount > 0);
  } catch {
    return [];
  }
}

async function extractSpendingFromText(text: string): Promise<Capture[]> {
  const completion = await openai.chat.completions.create({
    model: "gpt-5.6-terra",
    max_completion_tokens: 4096,
    messages: [
      {
        role: "system",
        content: [
          "You extract spending transactions from a spoken personal finance note for Vigil.",
          'Return JSON only with exactly: {"transactions":[{"amount":positive number,"currency":"ISO 4217 code or null","note":"short merchant or expense description","date":"YYYY-MM-DD or null"}]}.',
          "Include every distinct purchase, payment, transfer out, or expense mentioned.",
          "Exclude income, deposits, balances, budgets, and duplicate mentions.",
          "A sentence can contain multiple transactions. Never combine separate expenses into one total.",
          "Never invent an amount.",
          "Preserve the currency stated for each expense when it is clear. Use a three-letter ISO 4217 code such as USD, EUR, or AED; use null when the currency is not stated or cannot be determined.",
        ].join(" "),
      },
      {
        role: "user",
        content: text,
      },
    ],
  });
  const content = completion.choices[0]?.message?.content;
  return typeof content === "string" ? parseCaptures(content) : [];
}

router.post("/vigil/capture", async (req: Request, res: Response) => {
  if (!(await requireUser(req, res))) return;

  const imageData = asString(req.body?.imageData, 18_000_000);
  const source = asString(req.body?.source, 20) || "receipt";
  if (!imageData.startsWith("data:image/")) {
    res.status(400).json({ message: "A receipt or bank image is required." });
    return;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.6-terra",
      max_completion_tokens: 8192,
      messages: [
        {
          role: "system",
          content: [
            "You extract spending transactions from a receipt or bank-message screenshot for Vigil.",
            'Return JSON only with exactly: {"transactions":[{"amount":positive number,"currency":"ISO 4217 code or null","note":"short merchant or transfer description","date":"YYYY-MM-DD or null"}]}.',
            "For bank screenshots, include every distinct debit or purchase. Exclude balances, deposits, credits, and duplicates.",
            "For receipts, normally use the final paid total unless multiple separate receipts are visible.",
            "Never invent an amount.",
            "Preserve the currency stated for each expense when it is clear. Use a three-letter ISO 4217 code such as USD, EUR, or AED; use null when the currency is not stated or cannot be determined.",
            `The image source is ${source}.`,
          ].join(" "),
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Read this image and extract all spending transaction details." },
            { type: "image_url", image_url: { url: imageData } },
          ],
        },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    const transactions = typeof content === "string" ? parseCaptures(content) : [];
    if (!transactions.length) {
      res.status(422).json({ message: "No clear spending transactions were found. Enter the details manually." });
      return;
    }
    res.json({ transactions, transaction: transactions[0] });
  } catch (error) {
    req.log?.error?.({ error }, "Vigil capture request failed");
    res.status(502).json({ message: "The image reader is unavailable right now. Enter the amount manually." });
  }
});

router.post("/vigil/capture/voice", async (req: Request, res: Response) => {
  if (!(await requireUser(req, res))) return;

  const audioBase64 = asString(req.body?.audioBase64, 24_000_000);
  const mimeType = asString(req.body?.mimeType, 100) || "audio/m4a";
  const language = asString(req.body?.language, 20);
  if (!audioBase64) {
    res.status(400).json({ message: "A voice recording is required." });
    return;
  }

  try {
    const audio = Buffer.from(audioBase64, "base64");
    if (!audio.length || audio.length > 16 * 1024 * 1024) {
      res.status(400).json({ message: "The recording is empty or too large." });
      return;
    }
    const extension =
      mimeType.includes("webm") ? "webm" :
      mimeType.includes("wav") ? "wav" :
      mimeType.includes("mpeg") ? "mp3" : "m4a";
    const file = new File([audio], `vigil-voice.${extension}`, { type: mimeType });
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "gpt-4o-mini-transcribe",
      response_format: "json",
      ...(language ? { language: language.split("-")[0] } : {}),
      prompt: "A personal spending note. Preserve merchant names, amounts, currencies, and dates. The speaker may use any language.",
    });
    const text = transcription.text.trim();
    if (!text) {
      res.status(422).json({ message: "No speech could be detected." });
      return;
    }
    let transactions: Capture[] = [];
    try {
      transactions = await extractSpendingFromText(text);
    } catch (error) {
      req.log?.warn?.({ error }, "Vigil voice transaction extraction failed after transcription");
    }
    res.json({ text, transactions, transaction: transactions[0] ?? null });
  } catch (error) {
    req.log?.error?.({ error }, "Vigil voice transcription failed");
    res.status(502).json({ message: "Vigil could not transcribe that recording. Try again or type the note." });
  }
});

export default router;