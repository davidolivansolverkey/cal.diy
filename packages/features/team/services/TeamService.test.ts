import { MembershipRole } from "@calcom/prisma/enums";
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

const WEBAPP_URL = "https://cal.example.com";

function buildService(repo: TeamRepository) {
  return new TeamService({ teamRepo: repo, webappUrl: WEBAPP_URL });
}

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
    findMembership: vi.fn().mockResolvedValue({ role: "MEMBER", accepted: true }),
    updateMemberRole: vi.fn().mockResolvedValue(undefined),
    removeMember: vi.fn().mockResolvedValue(undefined),
    findUserIdByEmail: vi.fn().mockResolvedValue(null),
    findInvitationsByUserId: vi.fn().mockResolvedValue([]),
    createMembership: vi.fn().mockResolvedValue(undefined),
    acceptMembership: vi.fn().mockResolvedValue(undefined),
    createInviteToken: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return repo as unknown as TeamRepository & typeof repo;
}

describe("get", () => {
  it("refuses someone who does not belong to the team", async () => {
    const repo = buildRepo({ findRole: vi.fn().mockResolvedValue(null) });
    const service = buildService(repo);

    await expect(service.get(7, 1)).rejects.toThrow(/do not belong/);
    expect(repo.findMembers).not.toHaveBeenCalled();
  });
});

describe("create", () => {
  it("makes the creator the owner", async () => {
    const repo = buildRepo();
    const service = buildService(repo);

    await service.create({ name: "Ventas", slug: "ventas" }, 42);

    expect(repo.create).toHaveBeenCalledWith({ name: "Ventas", slug: "ventas", ownerUserId: 42 });
  });

  it("refuses a taken slug", async () => {
    const repo = buildRepo({ findBySlug: vi.fn().mockResolvedValue({ id: 9 }) });
    const service = buildService(repo);

    await expect(service.create({ name: "X", slug: "ventas" }, 42)).rejects.toMatchObject({
      data: { teamId: 9, alreadyExists: true },
    });
  });
});

describe("update", () => {
  it("lets an admin rename the team", async () => {
    const repo = buildRepo({ findRole: vi.fn().mockResolvedValue("ADMIN") });
    const service = buildService(repo);

    await service.update(7, { name: "Comercial" }, 1);

    expect(repo.update).toHaveBeenCalledWith(7, { name: "Comercial" });
  });

  it("refuses a plain member", async () => {
    const repo = buildRepo({ findRole: vi.fn().mockResolvedValue("MEMBER") });
    const service = buildService(repo);

    await expect(service.update(7, { name: "Comercial" }, 1)).rejects.toThrow(/requires one of/);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("refuses a slug already used by another team", async () => {
    const repo = buildRepo({ findBySlug: vi.fn().mockResolvedValue({ id: 99 }) });
    const service = buildService(repo);

    await expect(service.update(7, { slug: "otra" }, 1)).rejects.toThrow(/already taken/);
  });

  it("allows a team to keep its own slug", async () => {
    const repo = buildRepo({ findBySlug: vi.fn().mockResolvedValue({ id: 7 }) });
    const service = buildService(repo);

    await service.update(7, { slug: "ventas" }, 1);

    expect(repo.update).toHaveBeenCalled();
  });
});

describe("delete", () => {
  it("is owner-only", async () => {
    const repo = buildRepo({ findRole: vi.fn().mockResolvedValue("ADMIN") });
    const service = buildService(repo);

    await expect(service.delete(7, 1)).rejects.toThrow(/requires one of/);
    expect(repo.delete).not.toHaveBeenCalled();
  });
});

describe("changeMemberRole", () => {
  it("refuses demoting the last owner", async () => {
    const repo = buildRepo({ countOwners: vi.fn().mockResolvedValue(1) });
    const service = buildService(repo);

    await expect(service.changeMemberRole(7, 5, "MEMBER", 1)).rejects.toThrow(/at least one owner/);
    expect(repo.updateMemberRole).not.toHaveBeenCalled();
  });

  it("allows demoting an owner when another remains", async () => {
    const repo = buildRepo({ countOwners: vi.fn().mockResolvedValue(2) });
    const service = buildService(repo);

    await service.changeMemberRole(7, 5, "MEMBER", 1);

    expect(repo.updateMemberRole).toHaveBeenCalledWith(7, 5, "MEMBER");
  });

  it("refuses when the target is not in the team", async () => {
    const repo = buildRepo({ findMembership: vi.fn().mockResolvedValue(null) });
    const service = buildService(repo);

    await expect(service.changeMemberRole(7, 5, "ADMIN", 1)).rejects.toThrow(/does not belong/);
  });
});

describe("removeMember", () => {
  it("lets a plain member leave on their own", async () => {
    const repo = buildRepo({ findRole: vi.fn().mockResolvedValue("MEMBER") });
    const service = buildService(repo);

    await service.removeMember(7, 1, 1);

    expect(repo.removeMember).toHaveBeenCalledWith(7, 1);
  });

  it("stops a plain member from removing somebody else", async () => {
    const repo = buildRepo({ findRole: vi.fn().mockResolvedValue("MEMBER") });
    const service = buildService(repo);

    await expect(service.removeMember(7, 5, 1)).rejects.toThrow(/requires one of/);
    expect(repo.removeMember).not.toHaveBeenCalled();
  });

  it("stops the last owner from leaving", async () => {
    const repo = buildRepo({ countOwners: vi.fn().mockResolvedValue(1) });
    const service = buildService(repo);

    await expect(service.removeMember(7, 1, 1)).rejects.toThrow(/at least one owner/);
  });
});

describe("invite", () => {
  it("joins an existing user as a pending member", async () => {
    const repo = buildRepo({
      findUserIdByEmail: vi.fn().mockResolvedValue(99),
      findMembership: vi.fn().mockResolvedValue(null),
    });

    const result = await buildService(repo).invite(7, "Nuevo@Example.com ", MembershipRole.MEMBER, 1);

    expect(result).toEqual({ kind: "membership", userId: 99 });
    expect(repo.findUserIdByEmail).toHaveBeenCalledWith("nuevo@example.com");
    expect(repo.createMembership).toHaveBeenCalledWith(7, 99, MembershipRole.MEMBER);
    expect(repo.createInviteToken).not.toHaveBeenCalled();
  });

  it("hands out a signup link when nobody owns that address", async () => {
    const repo = buildRepo();

    const result = await buildService(repo).invite(7, "sin-cuenta@example.com", MembershipRole.MEMBER, 1);

    if (result.kind !== "link") throw new Error("expected a link");
    const [{ token, email, teamId }] = vi.mocked(repo.createInviteToken).mock.calls[0];
    expect(email).toBe("sin-cuenta@example.com");
    expect(teamId).toBe(7);
    expect(result.url).toBe(`https://cal.example.com/signup?token=${token}`);
    expect(repo.createMembership).not.toHaveBeenCalled();
  });

  it("refuses to invite somebody who is already on the team", async () => {
    const repo = buildRepo({
      findUserIdByEmail: vi.fn().mockResolvedValue(99),
      findMembership: vi.fn().mockResolvedValue({ role: "MEMBER", accepted: true }),
    });

    await expect(buildService(repo).invite(7, "ya@example.com", MembershipRole.MEMBER, 1)).rejects.toThrow(
      /already belongs/
    );
    expect(repo.createMembership).not.toHaveBeenCalled();
  });

  it("refuses a second invitation to the same address", async () => {
    const repo = buildRepo({
      findUserIdByEmail: vi.fn().mockResolvedValue(99),
      findMembership: vi.fn().mockResolvedValue({ role: "MEMBER", accepted: false }),
    });

    await expect(
      buildService(repo).invite(7, "pendiente@example.com", MembershipRole.MEMBER, 1)
    ).rejects.toThrow(/already been invited/);
  });

  it("does not let an admin hand out ownership", async () => {
    const repo = buildRepo({ findRole: vi.fn().mockResolvedValue("ADMIN") });

    await expect(buildService(repo).invite(7, "nuevo@example.com", MembershipRole.OWNER, 1)).rejects.toThrow(
      /requires one of: OWNER/
    );
    expect(repo.createInviteToken).not.toHaveBeenCalled();
  });
});

describe("changeMemberRole", () => {
  it("does not let an admin promote anyone to owner", async () => {
    const repo = buildRepo({ findRole: vi.fn().mockResolvedValue("ADMIN") });

    await expect(buildService(repo).changeMemberRole(7, 2, MembershipRole.OWNER, 1)).rejects.toThrow(
      /requires one of: OWNER/
    );
    expect(repo.updateMemberRole).not.toHaveBeenCalled();
  });
});

describe("acceptInvitation", () => {
  it("accepts a pending membership", async () => {
    const repo = buildRepo({
      findMembership: vi.fn().mockResolvedValue({ role: "MEMBER", accepted: false }),
    });

    await buildService(repo).acceptInvitation(7, 42);

    expect(repo.acceptMembership).toHaveBeenCalledWith(7, 42);
  });

  it("refuses when there is no invitation", async () => {
    const repo = buildRepo({ findMembership: vi.fn().mockResolvedValue(null) });

    await expect(buildService(repo).acceptInvitation(7, 42)).rejects.toThrow(/no invitation/);
  });

  it("is a no-op once already accepted", async () => {
    const repo = buildRepo({
      findMembership: vi.fn().mockResolvedValue({ role: "MEMBER", accepted: true }),
    });

    await buildService(repo).acceptInvitation(7, 42);

    expect(repo.acceptMembership).not.toHaveBeenCalled();
  });
});
