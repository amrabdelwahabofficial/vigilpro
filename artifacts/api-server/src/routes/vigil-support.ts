import { createClerkClient } from "@clerk/backend";
import { pool } from "@workspace/db";
import { Router, type Request, type Response } from "express";
import { authenticateVigilRequest, type VigilIdentity } from "../lib/vigilIdentity";
import { getClerkSecretKey } from "../lib/clerkConfig";

const router = Router();
const SUPPORT_CATEGORIES = new Set([
  "Account",
  "Subscription",
  "Transactions",
  "Technical Issue",
  "Feedback",
  "Other",
]);
const LANGUAGES = new Set(["en", "fr", "cs", "de", "es", "ru", "ar"]);
const STATUSES = new Set(["new", "in_progress", "resolved"]);
const MAX_ATTACHMENT_BASE64_LENGTH = 2_800_000;

function stringValue(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function optionalString(value: unknown, maxLength: number) {
  const result = stringValue(value, maxLength);
  return result || null;
}

async function clerkEmail(userId: string) {
  const secretKey = getClerkSecretKey();
  if (!secretKey) return null;
  try {
    const user = await createClerkClient({ secretKey }).users.getUser(userId);
    return user.primaryEmailAddress?.emailAddress?.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

async function accountEmail(identity: VigilIdentity) {
  return identity.email?.trim().toLowerCase() || (identity.provider === "clerk" ? clerkEmail(identity.userId) : null);
}

function requestId() {
  return `vsr_${crypto.randomUUID()}`;
}

router.post("/vigil/support-requests", async (req: Request, res: Response) => {
  const identity = await authenticateVigilRequest(req, res);
  if (!identity) return;

  const category = stringValue(req.body?.category, 40);
  const subject = stringValue(req.body?.subject, 180);
  const message = stringValue(req.body?.message, 8_000);
  const language = stringValue(req.body?.language, 2);
  const plan = stringValue(req.body?.plan, 10);
  const attachment = req.body?.attachment && typeof req.body.attachment === "object"
    ? req.body.attachment as Record<string, unknown>
    : null;
  const attachmentData = attachment ? stringValue(attachment.data, MAX_ATTACHMENT_BASE64_LENGTH) : "";
  const attachmentMimeType = attachment ? stringValue(attachment.mimeType, 80).toLowerCase() : "";
  const attachmentName = attachment ? optionalString(attachment.name, 180) : null;

  if (!SUPPORT_CATEGORIES.has(category)) {
    return res.status(400).json({ message: "Choose a valid support category." });
  }
  if (!subject || subject.length < 2) {
    return res.status(400).json({ message: "Add a subject so the support team knows what to review." });
  }
  if (!message || message.length < 10) {
    return res.status(400).json({ message: "Add a little more detail to your message." });
  }
  if (!LANGUAGES.has(language)) {
    return res.status(400).json({ message: "Choose a supported language." });
  }
  if (plan !== "free" && plan !== "pro") {
    return res.status(400).json({ message: "The plan context is invalid." });
  }
  if (attachmentData) {
    if (!attachmentMimeType.startsWith("image/")) {
      return res.status(400).json({ message: "Only image attachments are supported." });
    }
    if (!/^[A-Za-z0-9+/=\s]+$/.test(attachmentData) || attachmentData.length > MAX_ATTACHMENT_BASE64_LENGTH) {
      return res.status(400).json({ message: "That image is too large. Choose an image under 2 MB." });
    }
  }

  try {
    const email = await accountEmail(identity);
    const id = requestId();
    await pool.query(
      `INSERT INTO vigil_support_requests
       (id, user_id, provider, account_email, category, subject, message,
        attachment_name, attachment_mime_type, attachment_data, app_version,
        os_version, language, plan, status, attachment_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'new', $15)`,
      [
        id,
        identity.userId,
        identity.provider,
        email,
        category,
        subject,
        message,
        attachmentName,
        attachmentData ? attachmentMimeType : null,
        attachmentData || null,
        optionalString(req.body?.appVersion, 40),
        optionalString(req.body?.osVersion, 80),
        language,
        plan,
        attachmentData ? Math.floor((attachmentData.length * 3) / 4) : null,
      ],
    );
    return res.status(201).json({ ok: true, id });
  } catch (error) {
    req.log?.error?.({ error, userId: identity.userId }, "Failed to store Vigil support request");
    return res.status(500).json({ message: "The support request could not be saved. Please try again." });
  }
});

router.delete("/vigil/support-requests/me", async (req: Request, res: Response) => {
  const identity = await authenticateVigilRequest(req, res);
  if (!identity) return;
  try {
    await pool.query("DELETE FROM vigil_support_requests WHERE user_id = $1", [identity.userId]);
    return res.status(204).end();
  } catch (error) {
    req.log?.error?.({ error, userId: identity.userId }, "Failed to delete Vigil support requests");
    return res.status(502).json({ message: "Support data could not be deleted. Please try again." });
  }
});

export { SUPPORT_CATEGORIES, STATUSES };
export default router;