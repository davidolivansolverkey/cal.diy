import { getDirectoryService } from "@calcom/features/skai-provisioning/di/Directory.container";
import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import { verifySkaiSecret } from "app/api/skai/verifySkaiSecret";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

async function getHandler(request: NextRequest) {
  if (!verifySkaiSecret(request)) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json(await getDirectoryService().getDirectory(), { status: 200 });
}

export const GET = defaultResponderForAppDir(getHandler);
