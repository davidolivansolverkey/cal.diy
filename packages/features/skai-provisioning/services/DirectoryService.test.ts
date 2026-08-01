import { describe, expect, it, vi } from "vitest";
import type { DirectoryRepository } from "../repositories/DirectoryRepository";
import { DirectoryService } from "./DirectoryService";

function buildRepo(overrides: Partial<Record<keyof DirectoryRepository, unknown>> = {}) {
  const repo = {
    findTeamBySlug: vi.fn().mockResolvedValue(null),
    createOrganization: vi.fn().mockResolvedValue({ id: 1 }),
    createTeam: vi.fn().mockResolvedValue({ id: 2 }),
    findUserByEmail: vi.fn().mockResolvedValue(null),
    findUsernamesStartingWith: vi.fn().mockResolvedValue([]),
    findMembership: vi.fn().mockResolvedValue(null),
    addMember: vi.fn().mockResolvedValue({ userId: 100, assignedEventTypeIds: [20] }),
    updateMemberRole: vi.fn().mockResolvedValue(undefined),
    removeMember: vi.fn().mockResolvedValue({ removedHostCount: 1 }),
    findAllTeams: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  return repo as unknown as DirectoryRepository & typeof repo;
}

describe("createOrganization", () => {
  it("creates it when the slug is free", async () => {
    const repo = buildRepo();
    const service = new DirectoryService({ directoryRepo: repo });

    const result = await service.createOrganization({
      name: "Grupo Solverkey",
      slug: "solverkey",
      autoAcceptEmailDomain: "",
    });

    expect(result).toEqual({ id: 1, slug: "solverkey" });
    expect(repo.createOrganization).toHaveBeenCalled();
  });

  it("refuses a slug already used by anything, org or team", async () => {
    const repo = buildRepo({
      findTeamBySlug: vi.fn().mockResolvedValue({ id: 9, isOrganization: false }),
    });
    const service = new DirectoryService({ directoryRepo: repo });

    await expect(
      service.createOrganization({ name: "X", slug: "santos-ochoa", autoAcceptEmailDomain: "" })
    ).rejects.toMatchObject({ data: { teamId: 9, alreadyExists: true } });
    expect(repo.createOrganization).not.toHaveBeenCalled();
  });
});

describe("createTeam", () => {
  it("nests the team under an organization", async () => {
    const repo = buildRepo({
      findTeamBySlug: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 5, isOrganization: true }),
    });
    const service = new DirectoryService({ directoryRepo: repo });

    const result = await service.createTeam({
      name: "Ventas",
      slug: "ventas",
      organizationSlug: "solverkey",
    });

    expect(result.parentId).toBe(5);
    expect(repo.createTeam).toHaveBeenCalledWith(expect.objectContaining({ parentId: 5 }));
  });

  it("creates a standalone team when no organization is given", async () => {
    const repo = buildRepo();
    const service = new DirectoryService({ directoryRepo: repo });

    const result = await service.createTeam({ name: "Ventas", slug: "ventas" });

    expect(result.parentId).toBeUndefined();
  });

  it("refuses to nest under a plain team", async () => {
    const repo = buildRepo({
      findTeamBySlug: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 5, isOrganization: false }),
    });
    const service = new DirectoryService({ directoryRepo: repo });

    await expect(
      service.createTeam({ name: "Ventas", slug: "ventas", organizationSlug: "santos-ochoa" })
    ).rejects.toThrow(/is a team, not an organization/);
  });

  it("reports a missing organization", async () => {
    const repo = buildRepo({
      findTeamBySlug: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null),
    });
    const service = new DirectoryService({ directoryRepo: repo });

    await expect(
      service.createTeam({ name: "Ventas", slug: "ventas", organizationSlug: "nope" })
    ).rejects.toThrow(/No organization with slug/);
  });
});

describe("addMember", () => {
  it("creates the person and assigns them to the team event types", async () => {
    const repo = buildRepo({
      findTeamBySlug: vi.fn().mockResolvedValue({ id: 7, isOrganization: false }),
    });
    const service = new DirectoryService({ directoryRepo: repo });

    const result = await service.addMember({
      teamSlug: "santos-ochoa",
      name: "Ana",
      email: "Ana@Santos-Ochoa.es",
      role: "MEMBER",
      assignToEventTypes: true,
    });

    expect(result).toMatchObject({ userId: 100, linkedExistingUser: false, assignedEventTypeIds: [20] });
    expect(repo.addMember).toHaveBeenCalledWith(
      expect.objectContaining({ email: "ana@santos-ochoa.es", username: "santos-ochoa-ana" })
    );
  });

  it("links an existing account and keeps its username", async () => {
    const repo = buildRepo({
      findTeamBySlug: vi.fn().mockResolvedValue({ id: 7, isOrganization: false }),
      findUserByEmail: vi.fn().mockResolvedValue({ id: 42, username: "ana-existing" }),
    });
    const service = new DirectoryService({ directoryRepo: repo });

    const result = await service.addMember({
      teamSlug: "santos-ochoa",
      name: "Ana",
      email: "ana@santos-ochoa.es",
      role: "ADMIN",
      assignToEventTypes: true,
    });

    expect(result.linkedExistingUser).toBe(true);
    expect(repo.addMember).toHaveBeenCalledWith(
      expect.objectContaining({ existingUserId: 42, username: "ana-existing" })
    );
  });

  it("refuses to add the same person twice", async () => {
    const repo = buildRepo({
      findTeamBySlug: vi.fn().mockResolvedValue({ id: 7, isOrganization: false }),
      findUserByEmail: vi.fn().mockResolvedValue({ id: 42, username: "ana" }),
      findMembership: vi.fn().mockResolvedValue({ id: 3 }),
    });
    const service = new DirectoryService({ directoryRepo: repo });

    await expect(
      service.addMember({
        teamSlug: "santos-ochoa",
        name: "Ana",
        email: "ana@santos-ochoa.es",
        role: "MEMBER",
        assignToEventTypes: true,
      })
    ).rejects.toThrow(/already belongs to/);
    expect(repo.addMember).not.toHaveBeenCalled();
  });

  it("adds an existing person without needing their name again", async () => {
    const repo = buildRepo({
      findTeamBySlug: vi.fn().mockResolvedValue({ id: 7, isOrganization: true }),
      findUserByEmail: vi.fn().mockResolvedValue({ id: 42, username: "ana" }),
    });
    const service = new DirectoryService({ directoryRepo: repo });

    await service.addMember({
      teamSlug: "solverkey",
      email: "ana@santos-ochoa.es",
      role: "MEMBER",
      assignToEventTypes: true,
    });

    expect(repo.addMember).toHaveBeenCalledWith(expect.objectContaining({ existingUserId: 42 }));
  });

  it("demands a name when the account has to be created", async () => {
    const repo = buildRepo({
      findTeamBySlug: vi.fn().mockResolvedValue({ id: 7, isOrganization: false }),
    });
    const service = new DirectoryService({ directoryRepo: repo });

    await expect(
      service.addMember({
        teamSlug: "ventas",
        email: "nuevo@empresa.es",
        role: "MEMBER",
        assignToEventTypes: true,
      })
    ).rejects.toThrow(/a name is required/);
    expect(repo.addMember).not.toHaveBeenCalled();
  });

  it("sidesteps username collisions including suffixed variants", async () => {
    const repo = buildRepo({
      findTeamBySlug: vi.fn().mockResolvedValue({ id: 7, isOrganization: false }),
      findUsernamesStartingWith: vi.fn().mockResolvedValue(["santos-ochoa-ana", "santos-ochoa-ana-2"]),
    });
    const service = new DirectoryService({ directoryRepo: repo });

    await service.addMember({
      teamSlug: "santos-ochoa",
      name: "Ana",
      email: "ana@santos-ochoa.es",
      role: "MEMBER",
      assignToEventTypes: true,
    });

    expect(repo.addMember).toHaveBeenCalledWith(expect.objectContaining({ username: "santos-ochoa-ana-3" }));
  });
});

describe("removeMember", () => {
  it("removes the membership and reports the hosts dropped with it", async () => {
    const repo = buildRepo({
      findTeamBySlug: vi.fn().mockResolvedValue({ id: 7, isOrganization: false }),
      findUserByEmail: vi.fn().mockResolvedValue({ id: 42, username: "ana" }),
      findMembership: vi.fn().mockResolvedValue({ id: 3 }),
    });
    const service = new DirectoryService({ directoryRepo: repo });

    const result = await service.removeMember({ teamSlug: "santos-ochoa", email: "ana@santos-ochoa.es" });

    expect(result).toEqual({ userId: 42, removedHostCount: 1 });
  });

  it("refuses when the person is not in that team", async () => {
    const repo = buildRepo({
      findTeamBySlug: vi.fn().mockResolvedValue({ id: 7, isOrganization: false }),
      findUserByEmail: vi.fn().mockResolvedValue({ id: 42, username: "ana" }),
    });
    const service = new DirectoryService({ directoryRepo: repo });

    await expect(
      service.removeMember({ teamSlug: "santos-ochoa", email: "ana@santos-ochoa.es" })
    ).rejects.toThrow(/does not belong to/);
    expect(repo.removeMember).not.toHaveBeenCalled();
  });
});

describe("getDirectory", () => {
  it("nests teams under their organization and lists standalone teams apart", async () => {
    const member = {
      role: "OWNER" as const,
      accepted: true,
      user: { id: 1, name: "Ana", email: "ana@x.es", username: "ana" },
    };
    const repo = buildRepo({
      findAllTeams: vi.fn().mockResolvedValue([
        { id: 1, name: "Grupo", slug: "grupo", isOrganization: true, parentId: null, members: [member] },
        { id: 2, name: "Ventas", slug: "ventas", isOrganization: false, parentId: 1, members: [] },
        { id: 3, name: "Suelta", slug: "suelta", isOrganization: false, parentId: null, members: [] },
      ]),
    });
    const service = new DirectoryService({ directoryRepo: repo });

    const result = await service.getDirectory();

    expect(result.organizations).toHaveLength(1);
    expect(result.organizations[0].teams.map((team) => team.slug)).toEqual(["ventas"]);
    expect(result.organizations[0].members[0]).toMatchObject({ email: "ana@x.es", role: "OWNER" });
    expect(result.standaloneTeams.map((team) => team.slug)).toEqual(["suelta"]);
  });
});
