import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
/** Refresh a little before Google's expiry to avoid racing it mid-request. */
const EXPIRY_MARGIN_MS = 60_000;

const base64url = (value: string): string => Buffer.from(value).toString('base64url');

/**
 * Minimal Google service-account OAuth (JWT bearer grant). Hand-rolled with
 * node:crypto instead of pulling in `googleapis` / `google-auth-library`, which
 * keeps serverless cold starts small. Tokens are cached until shortly before
 * they expire, and concurrent callers share a single in-flight refresh.
 */
export class ServiceAccountAuth {
  private token: { value: string; expiresAt: number } | null = null;
  private pending: Promise<string> | null = null;

  constructor(
    private readonly clientEmail: string,
    private readonly privateKey: string,
  ) {}

  async getAccessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
      return this.token.value;
    }
    this.pending ??= this.fetchToken().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async fetchToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(
      JSON.stringify({
        iss: this.clientEmail,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
      }),
    );
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${claims}`);
    const signature = signer.sign(this.privateKey).toString('base64url');

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${header}.${claims}.${signature}`,
      }),
    });
    if (!res.ok) {
      throw new Error(`Google OAuth token request failed (${res.status}): ${await res.text()}`);
    }

    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }
}
