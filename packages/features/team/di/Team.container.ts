import { WEBAPP_URL } from "@calcom/lib/constants";
import prisma from "@calcom/prisma";
import { TeamRepository } from "../repositories/TeamRepository";
import { TeamService } from "../services/TeamService";

export function getTeamService(): TeamService {
  return new TeamService({ teamRepo: new TeamRepository(prisma), webappUrl: WEBAPP_URL });
}
