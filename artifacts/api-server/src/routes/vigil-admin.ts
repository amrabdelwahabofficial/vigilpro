import { createClerkClient, verifyToken } from "@clerk/backend";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { Router, type NextFunction, type Request, type Response } from "express";

type AdminRequest = Request & { adminUserId?: string };

const router = Router();
const connectors = new ReplitConnectors();
const ADMIN_EMAILS = new Set([
  "amrabdelwahabofficial8@gmail.com",
  "saraelhassanova@gmail.com",
]);

function clerk() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is not configured");
  return createClerkClient({ secretKey });
}

async function requireAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ message: "Authentication required" });
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    const currentUser = await clerk().users.getUser(payload.sub);
    const email = currentUser.primaryEmailAddress?.emailAddress?.trim().toLowerCase();
    if (currentUser.publicMetadata?.role !== "admin" && (!email || !ADMIN_EMAILS.has(email))) {
      return res.status(403).json({ message: "Admin role required" });
    }
    req.adminUserId = currentUser.id;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired session" });
  }
}

async function revenueCat(path: string, init?: Parameters<ReplitConnectors["proxy"]>[2]) {
  const response = await connectors.proxy("revenuecat", path, init);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`RevenueCat ${response.status}: ${detail}`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}

async function projectId() {
  const configuredProjectId = process.env.REVENUECAT_PROJECT_ID?.trim();
  if (configuredProjectId) return configuredProjectId;
  const projects = await revenueCat("/v2/projects");
  const items = (projects.items ?? []) as { id: string; name?: string }[];
  const preferred = items.find((item) => item.name?.trim().toLowerCase() === "vigil - know where it all goes")
    ?? items.find((item) => item.name?.toLowerCase().includes("vigil"))
    ?? items[0];
  if (!preferred) throw new Error("No RevenueCat project is configured");
  return preferred.id;
}

function numberValue(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (value && typeof value === "object" && "amount" in value) return Number((value as { amount: unknown }).amount) || 0;
  return 0;
}

router.get("/vigil/admin", requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const query = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const result = await clerk().users.getUserList({ query: query || undefined, limit: 50 });
    const id = await projectId();
    const users = await Promise.all(result.data.map(async (user) => {
      let subscriptions: Record<string, unknown>[] = [];
      try {
        const response = await revenueCat(`/v2/projects/${id}/customers/${encodeURIComponent(user.id)}/subscriptions`);
        subscriptions = (response.items ?? []) as Record<string, unknown>[];
      } catch {
        subscriptions = [];
      }
      const active = subscriptions.filter((item) => item.gives_access === true);
      const isTrial = active.some((item) => String(item.status ?? "").toLowerCase().includes("trial"));
      const revenueUsd = subscriptions.reduce((sum, item) => sum + numberValue(item.total_revenue_in_usd), 0);
      return {
        id: user.id,
        name: user.fullName || user.username || "Vigil member",
        email: user.primaryEmailAddress?.emailAddress ?? "",
        subscription: active.length ? (isTrial ? "trial" : "paid") : "free",
        proOverride: user.publicMetadata?.vigilProOverride === true,
        revenueUsd,
        renews: active.some((item) => item.auto_renewal_status === "will_renew"),
        cadence: active.some((item) => String(item.product_id ?? "").toLowerCase().includes("year")) ? "yearly" : "monthly",
      };
    }));
    const paid = users.filter((user) => user.subscription === "paid");
    const trials = users.filter((user) => user.subscription === "trial");
    const revenueUsd = users.reduce((sum, user) => sum + user.revenueUsd, 0);
    const monthlyRevenueUsd = users.filter((user) => user.cadence === "monthly").reduce((sum, user) => sum + user.revenueUsd, 0);
    const yearlyRevenueUsd = users.filter((user) => user.cadence === "yearly").reduce((sum, user) => sum + user.revenueUsd, 0);
    res.json({
      users,
      totals: {
        trials: trials.length,
        paid: paid.length,
        revenueUsd,
        monthlyRevenueUsd,
        yearlyRevenueUsd,
        estimatedStoreFeesUsd: revenueUsd * 0.15,
        estimatedNetProceedsUsd: revenueUsd * 0.85,
      },
      note: "Store fees are estimated at 15%. Apple controls billing cancellation; admins can delete app accounts while subscribers manage renewal in Apple Subscriptions.",
    });
  } catch (error) {
    req.log.error({ error }, "Failed to load Vigil admin overview");
    res.status(502).json({ message: "Subscription reporting is temporarily unavailable" });
  }
});

router.post("/vigil/admin/users/:userId/cancel", requireAdmin, async (_req: AdminRequest, res: Response) => {
  res.json({
    message: "Apple does not allow an app admin to silently cancel a customer subscription. Ask the customer to open Settings → Apple ID → Subscriptions → Vigil, where billing can be cancelled immediately.",
  });
});

router.post("/vigil/admin/users/:userId/pro-override", requireAdmin, async (req: AdminRequest, res: Response) => {
  const userId = String(req.params.userId);
  if (!userId || userId === req.adminUserId) {
    return res.status(400).json({ message: "Choose another user for a support override." });
  }
  if (typeof req.body?.enabled !== "boolean") {
    return res.status(400).json({ message: "The override value must be true or false." });
  }
  try {
    const target = await clerk().users.getUser(userId);
    const currentMetadata = (target.publicMetadata ?? {}) as Record<string, unknown>;
    await clerk().users.updateUserMetadata(userId, {
      publicMetadata: {
        ...currentMetadata,
        vigilProOverride: req.body.enabled,
      },
    });
    return res.json({
      message: req.body.enabled
        ? "Vigil Pro support access is now active for this user."
        : "Vigil Pro support access has been removed for this user.",
      proOverride: req.body.enabled,
    });
  } catch (error) {
    req.log.error({ error, userId }, "Failed to update Vigil Pro override");
    return res.status(502).json({ message: "The Pro override could not be updated." });
  }
});

router.delete("/vigil/admin/users/:userId", requireAdmin, async (req: AdminRequest, res: Response) => {
  const userId = String(req.params.userId);
  if (userId === req.adminUserId) {
    return res.status(400).json({ message: "You cannot delete your own admin account here." });
  }
  try {
    await clerk().users.deleteUser(userId);
    try {
      const id = await projectId();
      await revenueCat(`/v2/projects/${id}/customers/${encodeURIComponent(userId)}`, { method: "DELETE" });
    } catch {
      // The identity deletion succeeded; a missing RevenueCat customer is not an error.
    }
    return res.json({ message: "The user account and associated app customer record were deleted." });
  } catch (error) {
    req.log.error({ error }, "Failed to delete Vigil user");
    return res.status(502).json({ message: "The user could not be deleted." });
  }
});

export default router;