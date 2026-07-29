import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { NextResponse } from "next/server";

/**
 * Maps the service layer's ErrorWithCode onto HTTP status codes. Returns null for
 * anything unrecognised so the caller rethrows and the generic responder handles it.
 */
export function respondToSkaiError(error: unknown): NextResponse | null {
  if (!(error instanceof ErrorWithCode)) return null;

  if (error.data?.alreadyExists || error.data?.alreadyProvisioned) {
    return NextResponse.json({ message: error.message, teamId: error.data.teamId }, { status: 409 });
  }

  if (error.code === ErrorCode.NotFound) {
    return NextResponse.json({ message: error.message }, { status: 404 });
  }

  if (error.code === ErrorCode.BadRequest) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return null;
}
