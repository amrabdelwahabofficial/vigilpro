import { createClerkClient } from "@clerk/backend";
import { getAuth } from "@clerk/express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { Router, type NextFunction, type Request, type Response } from "express";
import { getClerkSecretKey } from "../lib/clerkConfig";
import { pool } from "@workspace/db";
import { STATUSES } from "./vigil-support";
import { deleteAppleAccountById } from "../lib/vigilIdentity";

type AdminRequest = Request & { adminUserId?: string };
type ClerkUserEmailSource = {
  primaryEmailAddress?: { emailAddress?: string | null } | null;
  primaryEmailAddressId?: string | null;
  emailAddresses?: Array<{ id?: string; emailAddress?: string | null }>;
};

const router = Router();
const connectors = new ReplitConnectors();
const ADMIN_EMAILS = new Set([
  "amrabdelwahabofficial8@gmail.com",
  "saraelhassanova@gmail.com",
]);

function clerkUserEmail(user: ClerkUserEmailSource | null | undefined) {
  const addresses = user?.emailAddresses ?? [];
  const primaryAddress = user?.primaryEmailAddress
    ?? addresses.find((address) => address.id && address.id === user?.primaryEmailAddressId);
  return (
    primaryAddress?.emailAddress?.trim()
    || addresses.find((address) => address.emailAddress?.trim())?.emailAddress?.trim()
    || ""
  );
}

function clerk() {
  const secretKey = getClerkSecretKey();
  if (!secretKey) throw new Error("Clerk secret key is not configured");
  return createClerkClient({ secretKey });
}

async function requireAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const currentUser = await clerk().users.getUser(userId);
    const email = clerkUserEmail(currentUser).toLowerCase();
    // Keep the production allowlist exact. A client- or metadata-provided role
    // must not expand access beyond the two approved admin accounts.
    if (!email || !ADMIN_EMAILS.has(email)) {
      return res.status(403).json({ message: "Admin role required" });
    }
    req.adminUserId = currentUser.id;
    return next();
  } catch (error) {
    req.log.warn({
      error: error instanceof Error ? error.message : String(error),
      hasAuthorizationToken: Boolean(req.headers.authorization),
    }, "Vigil admin authentication failed");
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

type SubscriptionDetail = {
  id: string;
  productId: string;
  status: string;
  givesAccess: boolean;
  revenueUsd: number;
  renews: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

async function billingSummary(billingProjectId: string | null, userId: string) {
  let subscriptions: Record<string, unknown>[] = [];
  if (billingProjectId) {
    try {
      const response = await revenueCat(`/v2/projects/${billingProjectId}/customers/${encodeURIComponent(userId)}/subscriptions`);
      subscriptions = (response.items ?? []) as Record<string, unknown>[];
    } catch (error) {
      // The directory should still show the account when one RevenueCat lookup
      // fails. The aggregate note explains a project-wide lookup failure.
      console.warn("RevenueCat customer lookup failed while loading Vigil admin overview", {
        error,
        userId,
      });
    }
  }
  const details: SubscriptionDetail[] = subscriptions.map((item, index) => {
    const productId = String(item.product_id ?? item.store_product_id ?? "Vigil Pro");
    const status = String(item.status ?? "inactive");
    return {
      id: String(item.id ?? `${productId}:${index}`),
      productId,
      status,
      givesAccess: item.gives_access === true,
      revenueUsd: numberValue(item.total_revenue_in_usd),
      renews: item.auto_renewal_status === "will_renew",
      startsAt: String(item.starts_at ?? item.current_period_starts_at ?? "") || null,
      endsAt: String(item.ends_at ?? item.current_period_ends_at ?? "") || null,
    };
  });
  const active = details.filter((item) => item.givesAccess);
  const trial = active.find((item) => item.status.toLowerCase().includes("trial"));
  const current = active[0];
  return {
    subscription: active.length ? (trial ? "trial" : "paid") : "free",
    subscriptionStatus: current?.status ?? "inactive",
    plan: current?.productId ?? null,
    trialStartedAt: trial?.startsAt ?? null,
    trialEndsAt: trial?.endsAt ?? null,
    revenueUsd: details.reduce((sum, item) => sum + item.revenueUsd, 0),
    renews: active.some((item) => item.renews),
    cadence: active.some((item) => item.productId.toLowerCase().includes("year")) ? "yearly" : "monthly",
    subscriptions: details,
  };
}

router.get("/vigil/admin", requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const query = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const requestedOffset = typeof req.query.offset === "string" ? Number.parseInt(req.query.offset, 10) : 0;
    const offset = Number.isFinite(requestedOffset) && requestedOffset >= 0 ? Math.min(requestedOffset, 100_000) : 0;
    const limit = 100;
    const result = await clerk().users.getUserList({ query: query || undefined, limit, offset });
    const appleAccounts = await pool.query<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      pro_override: boolean;
      created_at: Date | string;
    }>(
      `SELECT id, first_name, last_name, email, pro_override, created_at
       FROM vigil_apple_accounts
       WHERE deleted_at IS NULL
         AND (
           $1 = ''
           OR id ILIKE '%' || $1 || '%'
           OR COALESCE(email, '') ILIKE '%' || $1 || '%'
           OR COALESCE(first_name, '') ILIKE '%' || $1 || '%'
           OR COALESCE(last_name, '') ILIKE '%' || $1 || '%'
         )
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [query, limit, offset],
    );
    const appleCountResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM vigil_apple_accounts
       WHERE deleted_at IS NULL
         AND (
           $1 = ''
           OR id ILIKE '%' || $1 || '%'
           OR COALESCE(email, '') ILIKE '%' || $1 || '%'
           OR COALESCE(first_name, '') ILIKE '%' || $1 || '%'
           OR COALESCE(last_name, '') ILIKE '%' || $1 || '%'
         )`,
      [query],
    );
    let billingProjectId: string | null = null;
    let billingNote: string | undefined;
    try {
      billingProjectId = await projectId();
    } catch (error) {
      billingNote = "RevenueCat subscription reporting is temporarily unavailable. Clerk users and support overrides are still shown.";
      req.log.warn({ error }, "RevenueCat project lookup failed while loading Vigil admin overview");
    }

    const clerkUsers = await Promise.all(result.data.map(async (user) => ({
      ...(await billingSummary(billingProjectId, user.id)),
        id: user.id,
        provider: "clerk" as const,
        name: user.fullName || user.username || "Vigil member",
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        imageUrl: user.imageUrl ?? null,
        email: clerkUserEmail(user),
        createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
        proOverride: user.publicMetadata?.vigilProOverride === true,
    })));
    const appleUsers = await Promise.all(appleAccounts.rows.map(async (account) => ({
      ...(await billingSummary(billingProjectId, account.id)),
      id: account.id,
      provider: "apple" as const,
      name: [account.first_name, account.last_name].filter(Boolean).join(" ") || account.email || "Apple member",
      firstName: account.first_name ?? "",
      lastName: account.last_name ?? "",
      imageUrl: null,
      email: account.email ?? "",
      createdAt: new Date(account.created_at).toISOString(),
      proOverride: account.pro_override === true,
    })));
    const users = [...clerkUsers, ...appleUsers];
    const appleTotal = Number(appleCountResult.rows[0]?.count ?? appleAccounts.rows.length);
    const clerkTotal = result.totalCount ?? result.data.length;
    const pageSize = Math.max(result.data.length, appleAccounts.rows.length);
    const paid = users.filter((user) => user.subscription === "paid");
    const trials = users.filter((user) => user.subscription === "trial");
    const revenueUsd = users.reduce((sum, user) => sum + user.revenueUsd, 0);
    const monthlyRevenueUsd = users.filter((user) => user.cadence === "monthly").reduce((sum, user) => sum + user.revenueUsd, 0);
    const yearlyRevenueUsd = users.filter((user) => user.cadence === "yearly").reduce((sum, user) => sum + user.revenueUsd, 0);
    res.json({
      users,
      page: {
        offset,
        limit: pageSize,
        nextOffset: offset + pageSize < Math.max(clerkTotal, appleTotal) ? offset + pageSize : null,
        totalCount: clerkTotal + appleTotal,
      },
      totals: {
        totalUsers: clerkTotal + appleTotal,
        trials: trials.length,
        paid: paid.length,
        revenueUsd,
        monthlyRevenueUsd,
        yearlyRevenueUsd,
        estimatedStoreFeesUsd: revenueUsd * 0.15,
        estimatedNetProceedsUsd: revenueUsd * 0.85,
      },
      note: billingNote ?? "Store fees are estimated at 15%. Apple controls billing cancellation; admins can delete app accounts while subscribers manage renewal in Apple Subscriptions.",
    });
  } catch (error) {
    req.log.error({ error }, "Failed to load Vigil admin overview");
    res.status(502).json({ message: "Subscription reporting is temporarily unavailable" });
  }
});

router.post("/vigil/admin/users/:userId/cancel", requireAdmin, async (_req: AdminRequest, res: Response) => {
  res.json({
    message: "Subscription changes are managed by Apple. Ask the customer to open Settings → Apple ID → Subscriptions → Vigil to cancel or change their plan.",
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
    if (userId.startsWith("apple_")) {
      const result = await pool.query(
        `UPDATE vigil_apple_accounts
         SET pro_override = $1, updated_at = NOW()
         WHERE id = $2 AND deleted_at IS NULL
         RETURNING id`,
        [req.body.enabled, userId],
      );
      if (!result.rows[0]) return res.status(404).json({ message: "Apple account not found." });
    } else {
      const target = await clerk().users.getUser(userId);
      const currentMetadata = (target.publicMetadata ?? {}) as Record<string, unknown>;
      await clerk().users.updateUserMetadata(userId, {
        publicMetadata: {
          ...currentMetadata,
          vigilProOverride: req.body.enabled,
        },
      });
    }
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
    let supportRequestsDeleted = 0;
    if (userId.startsWith("apple_")) {
      await deleteAppleAccountById(userId);
    } else {
      await clerk().users.deleteUser(userId);
      const supportCleanup = await pool.query(
        "DELETE FROM vigil_support_requests WHERE user_id = $1",
        [userId],
      );
      supportRequestsDeleted = supportCleanup.rowCount ?? 0;
    }
    return res.json({
      message: "The user account and Vigil support records were deleted. Apple and RevenueCat subscription history was not changed.",
      supportRequestsDeleted,
    });
  } catch (error) {
    req.log.error({ error }, "Failed to delete Vigil user");
    return res.status(502).json({ message: "The user could not be deleted." });
  }
});

router.get("/vigil/admin/support-requests", requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const params: string[] = [];
    let where = "";
    if (status) {
      if (!STATUSES.has(status)) return res.status(400).json({ message: "Invalid support status." });
      params.push(status);
      where = "WHERE status = $1";
    }
    const result = await pool.query(
      `SELECT id, user_id AS "userId", provider, account_email AS "accountEmail",
              category, subject, message, attachment_name AS "attachmentName",
              attachment_mime_type AS "attachmentMimeType",
              attachment_data AS "attachmentData", app_version AS "appVersion",
              os_version AS "osVersion", language, plan, status,
              submitted_at AS "submittedAt", updated_at AS "updatedAt"
       FROM vigil_support_requests
       ${where}
       ORDER BY submitted_at DESC
       LIMIT 200`,
      params,
    );
    return res.json({ requests: result.rows });
  } catch (error) {
    req.log.error({ error }, "Failed to load Vigil support requests");
    return res.status(502).json({ message: "Support requests are temporarily unavailable." });
  }
});

router.patch("/vigil/admin/support-requests/:requestId", requireAdmin, async (req: AdminRequest, res: Response) => {
  const requestId = String(req.params.requestId);
  const status = typeof req.body?.status === "string" ? req.body.status.trim() : "";
  if (!requestId || !STATUSES.has(status)) {
    return res.status(400).json({ message: "Choose New, In Progress, or Resolved." });
  }
  try {
    const result = await pool.query(
      `UPDATE vigil_support_requests
       SET status = $1, updated_at = NOW(), status_changed_by = $2, status_changed_at = NOW()
       WHERE id = $3
       RETURNING id, status`,
      [status, req.adminUserId, requestId],
    );
    if (!result.rows[0]) return res.status(404).json({ message: "Support request not found." });
    return res.json({ ok: true, request: result.rows[0] });
  } catch (error) {
    req.log.error({ error, requestId }, "Failed to update Vigil support request");
    return res.status(502).json({ message: "The support request status could not be updated." });
  }
});

export default router;