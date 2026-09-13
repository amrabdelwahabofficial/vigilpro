---
name: Vigil bucket labels
description: Compatibility rule for renaming built-in budget buckets.
---

Built-in bucket IDs are persisted with plans and referenced by transactions, so user-facing bucket names should change through localized display text rather than by renaming the stored ID.

**Why:** Renaming an ID would strand existing saved allocations and transaction references, while localized labels provide the requested wording without a data migration.

**How to apply:** Keep the stable internal ID when changing a built-in bucket name; update the display copy for every supported language and reserve ID changes for an explicit data migration.