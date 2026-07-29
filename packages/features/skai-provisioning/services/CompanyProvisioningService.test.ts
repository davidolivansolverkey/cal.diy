import process from "node:process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProvisionCompanyInput } from "../CompanyProvisioning.types";
import type { CompanyProvisioningRepository } from "../repositories/CompanyProvisioningRepository";
import {
  buildUsernameCandidate,
  CompanyProvisioningService,
  claimUsername,
} from "./CompanyProvisioningService";

vi.mock("@calcom/features/api-keys-legacy/api-keys/lib/apiKeys", () => ({
  generateUniqueAPIKey: () => ["hashed-key", "plain-key"],
}));

function buildInput(overrides: Partial<ProvisionCompanyInput> = {}): ProvisionCompanyInput {
  return {
    tenantId: "tenant-uuid",
    company: { name: "Santos-Ochoa", slug: "santos-ochoa", timeZone: "Europe/Madrid" },
    members: [
      { name: "Ana Ruiz", email: "ana@santos-ochoa.es" },
      { name: "Luis Gil", email: "luis@santos-ochoa.es" },
    ],
    eventType: {
      title: "Cita comercial",
      slug: "cita",
      lengthInMinutes: 30,
      schedulingType: "ROUND_ROBIN",
    },
    ...overrides,
  };
}

function buildRepo(overrides: Partial<CompanyProvisioningRepository> = {}) {
  const repo = {
    findTeamIdBySlug: vi.fn().mockResolvedValue(null),
    findUserIdsByEmails: vi.fn().mockResolvedValue([]),
    findTakenUsernames: vi.fn().mockResolvedValue([]),
    createCompany: vi.fn().mockImplementation(({ members }) =>
      Promise.resolve({
        teamId: 10,
        eventTypeId: 20,
        members: members.map((member: { email: string; username: string }, index: number) => ({
          userId: 100 + index,
          email: member.email,
          username: member.username,
          linkedExistingUser: false,
        })),
      })
    ),
    ...overrides,
  };
  return repo as unknown as CompanyProvisioningRepository & typeof repo;
}

describe("CompanyProvisioningService", () => {
  beforeEach(() => {
    delete process.env.API_KEY_PREFIX;
  });

  it("provisions a company and returns the prefixed api key", async () => {
    const repo = buildRepo();
    const service = new CompanyProvisioningService({ companyProvisioningRepo: repo });

    const result = await service.provisionCompany(buildInput());

    expect(result.teamId).toBe(10);
    expect(result.eventTypeId).toBe(20);
    expect(result.apiKey).toBe("cal_plain-key");
    expect(result.members).toHaveLength(2);
  });

  it("honours a custom API_KEY_PREFIX", async () => {
    process.env.API_KEY_PREFIX = "skai_";
    const service = new CompanyProvisioningService({ companyProvisioningRepo: buildRepo() });

    const result = await service.provisionCompany(buildInput());

    expect(result.apiKey).toBe("skai_plain-key");
  });

  it("rejects duplicate member emails before touching the database", async () => {
    const repo = buildRepo();
    const service = new CompanyProvisioningService({ companyProvisioningRepo: repo });
    const input = buildInput({
      members: [
        { name: "Ana", email: "ana@santos-ochoa.es" },
        { name: "Ana again", email: "ANA@santos-ochoa.es" },
      ],
    });

    await expect(service.provisionCompany(input)).rejects.toThrow(/Duplicate member email/);
    expect(repo.findTeamIdBySlug).not.toHaveBeenCalled();
  });

  it("reports an already provisioned company with its team id", async () => {
    const repo = buildRepo({ findTeamIdBySlug: vi.fn().mockResolvedValue(7) });
    const service = new CompanyProvisioningService({ companyProvisioningRepo: repo });

    await expect(service.provisionCompany(buildInput())).rejects.toMatchObject({
      data: { teamId: 7, alreadyProvisioned: true },
    });
    expect(repo.createCompany).not.toHaveBeenCalled();
  });

  it("links an existing account instead of creating a duplicate user", async () => {
    const repo = buildRepo({
      findUserIdsByEmails: vi
        .fn()
        .mockResolvedValue([{ id: 42, email: "ana@santos-ochoa.es", username: "ana-existing" }]),
    });
    const service = new CompanyProvisioningService({ companyProvisioningRepo: repo });

    await service.provisionCompany(buildInput());

    const members = repo.createCompany.mock.calls[0][0].members;
    expect(members[0]).toMatchObject({ existingUserId: 42, username: "ana-existing" });
    expect(members[1].existingUserId).toBeUndefined();
  });

  it("applies default host priority and weight, and per-member overrides", async () => {
    const repo = buildRepo();
    const service = new CompanyProvisioningService({ companyProvisioningRepo: repo });
    const input = buildInput({
      members: [
        { name: "Ana", email: "ana@santos-ochoa.es" },
        { name: "Luis", email: "luis@santos-ochoa.es", priority: 4, weight: 200 },
      ],
    });

    await service.provisionCompany(input);

    const members = repo.createCompany.mock.calls[0][0].members;
    expect(members[0]).toMatchObject({ priority: 2, weight: 100 });
    expect(members[1]).toMatchObject({ priority: 4, weight: 200 });
  });

  it("falls back to the company timezone when a member has none", async () => {
    const repo = buildRepo();
    const service = new CompanyProvisioningService({ companyProvisioningRepo: repo });
    const input = buildInput({
      members: [
        { name: "Ana", email: "ana@santos-ochoa.es" },
        { name: "Luis", email: "luis@santos-ochoa.es", timeZone: "Atlantic/Canary" },
      ],
    });

    await service.provisionCompany(input);

    const members = repo.createCompany.mock.calls[0][0].members;
    expect(members[0].timeZone).toBe("Europe/Madrid");
    expect(members[1].timeZone).toBe("Atlantic/Canary");
  });

  it("passes the SKAI tenant id through for reconciliation", async () => {
    const repo = buildRepo();
    const service = new CompanyProvisioningService({ companyProvisioningRepo: repo });

    await service.provisionCompany(buildInput());

    expect(repo.createCompany.mock.calls[0][0].team.skaiTenantId).toBe("tenant-uuid");
  });
});

describe("buildUsernameCandidate", () => {
  it("namespaces the email local part under the company slug", () => {
    expect(buildUsernameCandidate("santos-ochoa", "ana.ruiz@example.com")).toBe("santos-ochoa-ana-ruiz");
  });

  it("strips non-alphanumeric runs and edge hyphens", () => {
    expect(buildUsernameCandidate("acme", "j..doe+tag@example.com")).toBe("acme-j-doe-tag");
  });

  it("falls back to 'member' when the local part has nothing usable", () => {
    expect(buildUsernameCandidate("acme", "+++@example.com")).toBe("acme-member");
  });
});

describe("claimUsername", () => {
  it("returns the candidate when free and reserves it", () => {
    const taken = new Set<string>();
    expect(claimUsername("acme-ana", taken)).toBe("acme-ana");
    expect(taken.has("acme-ana")).toBe(true);
  });

  it("suffixes until it finds a free username", () => {
    const taken = new Set(["acme-ana", "acme-ana-2"]);
    expect(claimUsername("acme-ana", taken)).toBe("acme-ana-3");
  });

  it("does not hand out the same username twice within one batch", () => {
    const taken = new Set<string>();
    expect(claimUsername("acme-ana", taken)).toBe("acme-ana");
    expect(claimUsername("acme-ana", taken)).toBe("acme-ana-2");
  });
});
