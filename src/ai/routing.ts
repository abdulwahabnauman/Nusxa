/**
 * Decides whether an AI call goes through the serverless proxy or straight
 * to the user's own provider keys.
 *
 * The proxy is used when it is configured AND the user has not opted into
 * their own keys — or has opted in but holds no key for this call, so the
 * built-in service quietly covers the gap.
 */
export function shouldUseProxy(
  proxyConfigured: boolean,
  preferOwnKeys: boolean,
  hasOwnKeys: boolean
): boolean {
  if (!proxyConfigured) return false;
  if (!preferOwnKeys) return true;
  return !hasOwnKeys;
}
