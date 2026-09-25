import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const vigilSupportRequests = pgTable(
  "vigil_support_requests",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    provider: text("provider").notNull(),
    accountEmail: text("account_email"),
    category: text("category").notNull(),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    attachmentName: text("attachment_name"),
    attachmentMimeType: text("attachment_mime_type"),
    attachmentData: text("attachment_data"),
    appVersion: text("app_version"),
    osVersion: text("os_version"),
    language: text("language").notNull(),
    plan: text("plan").notNull(),
    status: text("status").notNull().default("new"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    statusChangedBy: text("status_changed_by"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    attachmentBytes: integer("attachment_bytes"),
  },
  (table) => [
    index("vigil_support_requests_user_id_idx").on(table.userId),
    index("vigil_support_requests_status_idx").on(table.status),
    index("vigil_support_requests_submitted_at_idx").on(table.submittedAt),
  ],
);

export type VigilSupportRequest = typeof vigilSupportRequests.$inferSelect;