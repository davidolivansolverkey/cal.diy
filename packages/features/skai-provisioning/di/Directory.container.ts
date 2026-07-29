import prisma from "@calcom/prisma";
import { DirectoryRepository } from "../repositories/DirectoryRepository";
import { DirectoryService } from "../services/DirectoryService";

export function getDirectoryService(): DirectoryService {
  return new DirectoryService({ directoryRepo: new DirectoryRepository(prisma) });
}
