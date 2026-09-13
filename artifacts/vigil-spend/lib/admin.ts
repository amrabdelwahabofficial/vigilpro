export const VIGIL_ADMIN_EMAILS = new Set([
  'amrabdelwahabofficial8@gmail.com',
  'saraelhassanova@gmail.com',
]);

export function isVigilAdmin(user: {
  publicMetadata?: { role?: unknown; vigilProOverride?: unknown } | null;
  primaryEmailAddress?: { emailAddress?: string | null } | null;
  emailAddresses?: { emailAddress?: string | null }[];
} | null | undefined) {
  if (user?.publicMetadata?.role === 'admin') return true;
  const emails = [
    user?.primaryEmailAddress?.emailAddress,
    ...(user?.emailAddresses ?? []).map((item) => item.emailAddress),
  ].filter((email): email is string => Boolean(email));
  return emails.some((email) => VIGIL_ADMIN_EMAILS.has(email.trim().toLowerCase()));
}

export function hasVigilProOverride(user: {
  publicMetadata?: { vigilProOverride?: unknown } | null;
} | null | undefined) {
  return user?.publicMetadata?.vigilProOverride === true;
}