import prisma from "@calcom/prisma";
import { CompanyProvisioningRepository } from "../repositories/CompanyProvisioningRepository";
import { CompanyProvisioningService } from "../services/CompanyProvisioningService";

export function getCompanyProvisioningService(): CompanyProvisioningService {
  return new CompanyProvisioningService({
    companyProvisioningRepo: new CompanyProvisioningRepository(prisma),
  });
}
