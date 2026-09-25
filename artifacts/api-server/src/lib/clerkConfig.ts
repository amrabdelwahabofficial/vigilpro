type ClerkMode = "development" | "production";

function clerkMode(): ClerkMode {
  const configuredMode = process.env.VIGIL_CLERK_MODE?.trim().toLowerCase();
  if (configuredMode === "development" || configuredMode === "preview") {
    return "development";
  }
  if (configuredMode === "production") {
    return "production";
  }
  throw new Error(
    'VIGIL_CLERK_MODE must be explicitly set to "development" or "production".',
  );
}

export function isProductionClerkMode(): boolean {
  return clerkMode() === "production";
}

function requiredExternalCredential(name: string, value: string | undefined): string {
  const credential = value?.trim();
  if (!credential) {
    throw new Error(`${name} is required for the selected external Clerk mode.`);
  }
  return credential;
}

export function getClerkPublishableKey(): string {
  const mode = clerkMode();
  return mode === "production"
    ? requiredExternalCredential("VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY", process.env.VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY)
    : requiredExternalCredential("VIGIL_EXTERNAL_CLERK_DEVELOPMENT_PUBLISHABLE_KEY", process.env.VIGIL_EXTERNAL_CLERK_DEVELOPMENT_PUBLISHABLE_KEY);
}

export function getClerkSecretKey(): string {
  const mode = clerkMode();
  return mode === "production"
    ? requiredExternalCredential("VIGIL_EXTERNAL_CLERK_SECRET_KEY", process.env.VIGIL_EXTERNAL_CLERK_SECRET_KEY)
    : requiredExternalCredential("VIGIL_EXTERNAL_CLERK_DEVELOPMENT_SECRET_KEY", process.env.VIGIL_EXTERNAL_CLERK_DEVELOPMENT_SECRET_KEY);
}