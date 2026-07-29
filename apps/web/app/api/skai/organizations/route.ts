import { createOrganizationInputSchema } from "@calcom/features/skai-provisioning/Directory.types";
import { getDirectoryService } from "@calcom/features/skai-provisioning/di/Directory.container";
import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import { respondToSkaiError } from "app/api/skai/respondToSkaiError";
import { verifySkaiSecret } from "app/api/skai/verifySkaiSecret";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

async function postHandler(request: NextRequest) {
  if (!verifySkaiSecret(request)) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  const parsed = createOrganizationInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid request body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const organization = await getDirectoryService().createOrganization(parsed.data);
    return NextResponse.json(organization, { status: 201 });
  } catch (error) {
    const response = respondToSkaiError(error);
    if (response) return response;
    throw error;
  }
}

export const POST = defaultResponderForAppDir(postHandler);
