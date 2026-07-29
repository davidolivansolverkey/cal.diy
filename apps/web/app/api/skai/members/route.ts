import {
  addMemberInputSchema,
  removeMemberInputSchema,
  updateMemberRoleInputSchema,
} from "@calcom/features/skai-provisioning/Directory.types";
import { getDirectoryService } from "@calcom/features/skai-provisioning/di/Directory.container";
import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import { respondToSkaiError } from "app/api/skai/respondToSkaiError";
import { verifySkaiSecret } from "app/api/skai/verifySkaiSecret";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { ZodTypeAny, z } from "zod";

async function handle<Schema extends ZodTypeAny>(
  request: NextRequest,
  schema: Schema,
  run: (input: z.infer<Schema>) => Promise<unknown>,
  successStatus: number
) {
  if (!verifySkaiSecret(request)) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid request body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(await run(parsed.data), { status: successStatus });
  } catch (error) {
    const response = respondToSkaiError(error);
    if (response) return response;
    throw error;
  }
}

export const POST = defaultResponderForAppDir((request: NextRequest) =>
  handle(request, addMemberInputSchema, (input) => getDirectoryService().addMember(input), 201)
);

export const PATCH = defaultResponderForAppDir((request: NextRequest) =>
  handle(request, updateMemberRoleInputSchema, (input) => getDirectoryService().updateMemberRole(input), 200)
);

export const DELETE = defaultResponderForAppDir((request: NextRequest) =>
  handle(request, removeMemberInputSchema, (input) => getDirectoryService().removeMember(input), 200)
);
