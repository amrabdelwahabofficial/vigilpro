import { createClerkClient } from "@clerk/backend";
import { pool } from "@workspace/db";
import { Router, type Request, type Response } from "express";
import { authenticateVigilRequest } from "../lib/vigilIdentity";
import { getClerkSecretKey } from "../lib/clerkConfig";

const router = Router();

router.patch("/vigil/profile", async (req: Request, res: Response) => {
  try {
    const identity = await authenticateVigilRequest(req, res);
    if (!identity) return;
    const firstName = typeof req.body?.firstName === "string" ? req.body.firstName.trim().slice(0, 80) : "";
    const lastName = typeof req.body?.lastName === "string" ? req.body.lastName.trim().slice(0, 80) : "";
    if (!firstName || !lastName) return res.status(400).json({ message: "First and last name are required." });
    if (identity.provider === "apple") {
      await pool.query(
        "UPDATE vigil_apple_accounts SET first_name = $1, last_name = $2, updated_at = NOW() WHERE id = $3 AND deleted_at IS NULL",
        [firstName, lastName, identity.userId],
      );
      return res.json({ ok: true });
    }
    const secretKey = getClerkSecretKey();
    if (!secretKey) return res.status(500).json({ message: "Authentication service is not configured." });
    await createClerkClient({ secretKey }).users.updateUser(identity.userId, { firstName, lastName });
    return res.json({ ok: true });
  } catch {
    return res.status(401).json({ message: "The profile could not be saved." });
  }
});

export default router;