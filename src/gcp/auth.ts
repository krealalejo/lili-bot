const METADATA_TOKEN_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

/** Refresh a minute early rather than discover expiry mid-request. */
const EXPIRY_MARGIN_MS = 60_000;
const TIMEOUT_MS = 3_000;

export type TokenSource = () => Promise<string>;

type MetadataToken = {
  access_token: string;
  expires_in: number;
};

/**
 * Cloud Run hands out access tokens for the service account through the metadata server,
 * so no key file and no auth library are needed. The token is cached until shortly before
 * it expires; one fetch per instance lifetime is the normal case.
 */
export function createMetadataTokenSource(): TokenSource {
  let cached: { token: string; expiresAt: number } | null = null;
  let inFlight: Promise<string> | null = null;

  async function fetchToken(): Promise<string> {
    const response = await fetch(METADATA_TOKEN_URL, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Metadata server returned ${response.status}`);
    }

    const body = (await response.json()) as MetadataToken;
    cached = {
      token: body.access_token,
      expiresAt: Date.now() + body.expires_in * 1_000 - EXPIRY_MARGIN_MS,
    };

    return body.access_token;
  }

  return async function getToken(): Promise<string> {
    if (cached !== null && Date.now() < cached.expiresAt) {
      return cached.token;
    }

    // Concurrent requests on a cold instance share a single fetch.
    inFlight ??= fetchToken().finally(() => {
      inFlight = null;
    });

    return inFlight;
  };
}
