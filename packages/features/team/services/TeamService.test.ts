import { describe, expect, it, vi } from "vitest";
import type { TeamRepository } from "../repositories/TeamRepository";
import { TeamService } from "./TeamService";

const TEAM = {
  id: 7,
  name: "Ventas",
  slug: "ventas",
  bio: null,
  logoUrl: null,
  isPrivate: false,
  hideBranding: false,
  isOrganization: false,
  parentId: null,
};

function buildRepo(overrides: Partial<Record<keyof TeamRepository, unknown>> = {}) {
  const repo = {
    findManyByUserId: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(TEAM),
    findMembers: vi.fn().mockResolvedValue([]),
    findBySlug: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(TEAM),
    update: vi.fn().mockResolvedValue(TEAM),
    delete: vi.fn().mockResolvedValue(undefined),
    countOwners: vi.fn().mockResolvedValue(2),
    findRole: vi.fn().mockResolvedValue("OWNER"),
    updateMemberRole: vi.fn().mockResolvedValue(undefined),
    removeMember: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return repo as unknown as TeamRepository & typeof repo;
}

describe("get", () => {
  it("refuses someone who does not belong to the team", async () => {
    const repo = buildRepo({ findRole: vi.fn().mockResolvedValue(null) });
    const service = new TeamService({ teamRepo: repo });

    await expect(service.get(7, 1)).rejects.toThrow(/do not belong/);
    expect(repo.findMembers).not.toHaveBeenCalled();
  });
});

describe("create", () => {
  it("makes the creator the owner", async () => {
    const repo = buildRepo();
    const service = new TeamService({ teamRepo: repo });

    await service.create({ name: "Ventas", slug: "ventas" }, 42);

    expect(repo.create).toHaveBeenCalledWith({ name: "Ventas", slug: "ventas", ownerUserId: 42 });
  });

  it("refuses a taken slug", async () => {
    const repo = buildRepo({ findBySlug: vi.fn().mockResolvedValue({ id: 9 }) });
    const service = new TeamService({ teamRepo: repo });

    await expect(service.create({ name: "X", slug: "ventas" }, 42)).rejects.toMatchObject({
      data: { teamId: 9, alreadyExists: true },
    });
  });
});

describe("update", () => {
  it("lets an admin rename the team", async () => {
    const repo = buildRepo({ findRole: vi.fn().mockResolvedValue("ADMIN") });
    const service = new TeamService({ teamRepo: repo });

    await service.update(7, { name: "Comercial" }, 1);

    expect(repo.update).toHaveBeenCalledWith(7, { name: "Comercial" });
  });

  it("refuses a plain member", async () => {
    const repo = buildRepo({ findRole: vi.fn().mockResolvedValue("MEMBER") });
    const service = new TeamService({ teamRepo: repo });

    await expect(service.update(7, { name: "Comercial" }, 1)).rejects.toThrow(/requires one of/);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("refuses a slug already used by another team", async () => {
    const repo = buildRepo({ findBySlug: vi.fn().mockResolvedValue({ id: 99 }) });
    const service = new TeamService({ teamRepo: repo });

    await expect(service.update(7, { slug: "otra" }, 1)).rejects.toThrow(/already taken/);
  });

  it("allows a team to keep its own slug", async () => {
    const repo = buildRepo({ findBySlug: vi.fn().mockResolvedValue({ id: 7 }) });
    const service = new TeamService({ teamRepo: repo });

    await service.update(7, { slug: "ventas" }, 1);

    expect(repo.update).toHaveBeenCalled();
  });
});

describe("delete", () => {
  it("is owner-only", async () => {
    const repo = buildRepo({ findRole: vi.fn().mockResolvedValue("ADMIN") });
    const service = new TeamService({ teamRepo: repo });

    await expect(service.delete(7, 1)).rejects.toThrow(/requires one of/);
    expect(repo.delete).not.toHaveBeenCalled();
  });
});

describe("changeMemberRole", () => {
  it("refuses demoting the last owner", async () => {
    const repo = buildRepo({ countOwners: vi.fn().mockResolvedValue(1) });
    const service = new TeamService({ teamRepo: repo });

    await expect(service.changeMemberRole(7, 5, "MEMBER", 1)).rejects.toThrow(/at least one owner/);
    expect(repo.updateMemberRole).not.toHaveBeenCalled();
  });

  it("allows demoting an owner when another remains", async () => {
    const repo = buildRepo({ countOwners: vi.fn().mockResolvedValue(2) });
    const service = new TeamService({ teamRepo: repo });

    await service.changeMemberRole(7, 5, "MEMBER", 1);

    expect(repo.updateMemberRole).toHaveBeenCalledWith(7, 5, "MEMBER");
  });

  it("refuses when the target is not in the team", async () => {
    const repo = buildRepo({
      findRole: vi.fn().mockResolvedValueOnce("OWNER").mockResolvedValueOnce(null),
    });
    const service = new TeamService({ teamRepo: repo });

    await expect(service.changeMemberRole(7, 5, "ADMIN", 1)).rejects.toThrow(/does not belong/);
  });
});

describe("removeMember", () => {
  it("lets a plain member leave on their own", async () => {
    const repo = buildRepo({ findRole: vi.fn().mockResolvedValue("MEMBER") });
    const service = new TeamService({ teamRepo: repo });

    await service.removeMember(7, 1, 1);

    expect(repo.removeMember).toHaveBeenCalledWith(7, 1);
  });

  it("stops a plain member from removing somebody else", async () => {
    const repo = buildRepo({ findRole: vi.fn().mockResolvedValue("MEMBER") });
    const service = new TeamService({ teamRepo: repo });

    await expect(service.removeMember(7, 5, 1)).rejects.toThrow(/requires one of/);
    expect(repo.removeMember).not.toHaveBeenCalled();
  });

  it("stops the last owner from leaving", async () => {
    const repo = buildRepo({ countOwners: vi.fn().mockResolvedValue(1) });
    const service = new TeamService({ teamRepo: repo });

    await expect(service.removeMember(7, 1, 1)).rejects.toThrow(/at least one owner/);
  });
});
