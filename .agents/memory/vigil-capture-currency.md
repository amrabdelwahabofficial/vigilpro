---
name: Vigil capture currency
description: Currency detection and conversion rules for imported spending.
---

Bank-message extraction returns an ISO 4217 currency per transaction when the image makes it clear. Imported amounts are converted into the account’s main currency before saving; the account currency itself must not be changed by the capture flow.

**Why:** Bank screenshots can contain spending in a different currency, and storing the source amount as the account currency would distort budgets and analysis.

**How to apply:** Rates are quoted as currency units per AED, so convert source → AED → account currency: `amount / sourceRate * accountRate`. Refresh rates when a detected source currency is missing, and block saving rather than silently storing an unconverted amount when no rate exists.