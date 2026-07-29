import { issueSetupLinkInputSchema } from "@calcom/features/skai-provisioning/CompanyProvisioning.types";
import { getCompanyProvisioningService } from "@calcom/features/skai-provisioning/di/CompanyProvisioning.container";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import { verifySkaiSecret } from "app/api/skai/verifySkaiSecret";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

async function postHandler(request: NextRequest) {
  if (!verifySkaiSecret(request)) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  const parsed = issueSetupLinkInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid request body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const setupLink = await getCompanyProvisioningService().issueSetupLink(parsed.data);
    return NextResponse.json(setupLink, { status: 201 });
  } catch (error) {
    if (error instanceof ErrorWithCode && error.code === ErrorCode.NotFound) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    throw error;
  }
}

export const POST = defaultResponderForAppDir(postHandler);
