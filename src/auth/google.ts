import { readFile } from "node:fs/promises";
import { sign } from "node:crypto";
import { Buffer } from "node:buffer";

export type GoogleAuthOptions = {
  credentialsPath?: string;
  fetchImpl?: typeof fetch;
};

const tokenUrl = "https://oauth2.googleapis.com/token";

function encodeJson(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** Exchange a signed service-account request for a short-lived access token. */
export async function getGoogleAccessToken(options: GoogleAuthOptions = {}) {
  const path = options.credentialsPath ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!path?.trim()) {
    throw new Error("Set GOOGLE_APPLICATION_CREDENTIALS to your service-account JSON file");
  }

  let account;
  try {
    account = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error("Could not read the service-account JSON file. Check its path and format.");
  }

  if (
    account?.type !== "service_account" ||
    typeof account.client_email !== "string" || !account.client_email.trim() ||
    typeof account.private_key !== "string" || !account.private_key.trim() ||
    typeof account.project_id !== "string" || !account.project_id.trim()
  ) {
    throw new Error("Use the full service-account JSON containing client_email, private_key, and project_id");
  }

  // Google accepts a signed JWT valid for at most one hour.
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: "RS256", typ: "JWT", kid: account.private_key_id });
  const claims = encodeJson({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: tokenUrl,
    iat: now,
    exp: now + 3600,
  });
  const unsignedToken = `${header}.${claims}`;

  let signature: string;
  try {
    signature = sign("RSA-SHA256", Buffer.from(unsignedToken), account.private_key)
      .toString("base64url");
  } catch {
    throw new Error("The service-account private key could not sign the authentication request");
  }

  const sendRequest = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await sendRequest(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${unsignedToken}.${signature}`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("Could not connect to Google to authenticate the service account");
  }

  if (!response.ok) {
    throw new Error(`Google authentication failed (${response.status}). Check that the service-account key is active and your system clock is correct.`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Google returned an invalid authentication response");
  }
  if (typeof data?.access_token !== "string" || !data.access_token.trim()) {
    throw new Error("Google did not return an access token");
  }

  return {
    accessToken: data.access_token as string,
    projectId: account.project_id as string,
  };
}
