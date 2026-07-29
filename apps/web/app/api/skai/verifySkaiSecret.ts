import { createHash, timingSafeEqual } from "node:crypto";
import process from "node:process";
import type { NextRequest } from "next/server";

const SECRET_HEADER = "x-skai-secret";

export function verifySkaiSecret(request: NextRequest): boolean {
  const expected = process.env.SKAI_PROVISIONING_SECRET;
  // Absent secret disables these endpoints rather than leaving them open.
  if (!expected) return false;

  const provided = request.headers.get(SECRET_HEADER);
  if (!provided) return false;

  // Hashing first keeps the comparison constant-time regardless of length.
  return timingSafeEqual(
    createHash("sha256").update(provided).digest(),
    createHash("sha256").update(expected).digest()
  );
}
