import { createHash, timingSafeEqual } from "node:crypto";
import process from "node:process";
import { provisionCompanyInputSchema } from "@calcom/features/skai-provisioning/CompanyProvisioning.types";
import { getCompanyProvisioningService } from "@calcom/features/skai-provisioning/di/CompanyProvisioning.container";
import { ErrorWithCode } from "@calcom/lib/errors";
import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const SECRET_HEADER = "x-skai-secret";

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.SKAI_PROVISIONING_SECRET;
  // Absent secret disables the endpoint rather than leaving it open.
  if (!expected) return false;

  const provided = request.headers.get(SECRET_HEADER);
  if (!provided) return false;

  // Hashing first keeps the comparison constant-time regardless of length.
  return timingSafeEqual(
    createHash("sha256").update(provided).digest(),
    createHash("sha256").update(expected).digest()
  );
}

async function postHandler(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  const parsed = provisionCompanyInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid request body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const provisioned = await getCompanyProvisioningService().provisionCompany(parsed.data);
    return NextResponse.json(provisioned, { status: 201 });
  } catch (error) {
    if (error instanceof ErrorWithCode && error.data?.alreadyProvisioned) {
      return NextResponse.json({ message: error.message, teamId: error.data.teamId }, { status: 409 });
    }
    throw error;
  }
}

export const POST = defaultResponderForAppDir(postHandler);
