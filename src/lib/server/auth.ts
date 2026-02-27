import { getAdminAuth } from "@/lib/firebase-admin";

export class RequestAuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

function extractBearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    throw new RequestAuthError("Missing bearer token", 401);
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    throw new RequestAuthError("Missing bearer token", 401);
  }

  return token;
}

export async function getAuthenticatedUid(request: Request): Promise<string> {
  const token = extractBearerToken(request);

  try {
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    return decoded.uid;
  } catch {
    throw new RequestAuthError("Invalid authentication token", 401);
  }
}
