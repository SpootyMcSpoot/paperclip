import { describe, expect, it } from "vitest";
import {
  acceptInviteSchema,
  archiveCompanyMemberSchema,
  authSessionSchema,
  claimJoinRequestApiKeySchema,
  createCliAuthChallengeSchema,
  createCompanyInviteSchema,
  currentUserProfileSchema,
  listCompanyInvitesQuerySchema,
  searchAdminUsersQuerySchema,
  updateCompanyMemberSchema,
  updateCompanyMemberWithPermissionsSchema,
  updateCurrentUserProfileSchema,
  updateMemberPermissionsSchema,
  updateUserCompanyAccessSchema,
} from "./access.js";

// Pure-helper tests for access.ts -- the auth/membership boundary.
//
// These schemas gate Zod parses on every invite/membership/profile API
// call, so silent drift translates directly into auth bypasses or
// 500s on the membership UI. The non-obvious parts pinned here:
//
//   - createCompanyInviteSchema.allowedJoinTypes defaults to "both"
//     -- absent value MUST NOT mean "no joins permitted"; the API
//     wires this into a default-open invite.
//   - updateCompanyMemberSchema requires AT LEAST one of
//     {membershipRole, status} -- empty PATCH is a no-op disguise
//     attack vector.
//   - archiveCompanyMemberSchema rejects BOTH agent + user
//     reassignment (logic ambiguity); either-or-neither is allowed.
//   - profileImageSchema accepts /api/assets/<id>/content (with
//     optional ?query and #frag) AND http(s) URLs -- pinning both
//     branches prevents drift to "URL only" (would 500 every
//     existing in-app avatar reference).
//   - updateCurrentUserProfileSchema empty-string image transforms
//     to null -- the React form sends "" to clear; if the schema
//     starts persisting "" the avatar component crashes.
//   - claimJoinRequestApiKeySchema min=16 -- the brute-force ceiling
//     for join-claim secrets; silently lowering would make join
//     requests guessable.
//   - listCompanyInvitesQuerySchema.limit coerces from string to
//     int (URL query strings are stringly-typed); regression to
//     z.number() without coerce would 400 every list call.
//   - searchAdminUsersQuerySchema trims its `query` -- whitespace-
//     only requests must collapse to "" so the API treats them as
//     "no filter" and not "search for spaces".

describe("createCompanyInviteSchema", () => {
  it("defaults allowedJoinTypes to 'both' when omitted", () => {
    const out = createCompanyInviteSchema.parse({});
    expect(out.allowedJoinTypes).toBe("both");
  });

  it("accepts 'human', 'agent', or 'both'", () => {
    for (const t of ["human", "agent", "both"] as const) {
      expect(createCompanyInviteSchema.parse({ allowedJoinTypes: t }).allowedJoinTypes).toBe(t);
    }
  });

  it("rejects unknown allowedJoinTypes", () => {
    expect(() => createCompanyInviteSchema.parse({ allowedJoinTypes: "everyone" })).toThrow();
  });

  it("rejects unknown humanRole", () => {
    expect(() => createCompanyInviteSchema.parse({ humanRole: "ceo" })).toThrow();
  });

  it("accepts each canonical humanRole", () => {
    for (const r of ["owner", "admin", "operator", "viewer"] as const) {
      expect(createCompanyInviteSchema.parse({ humanRole: r }).humanRole).toBe(r);
    }
  });

  it("caps agentMessage at 4000 chars", () => {
    expect(() =>
      createCompanyInviteSchema.parse({ agentMessage: "x".repeat(4001) }),
    ).toThrow();
    expect(
      createCompanyInviteSchema.parse({ agentMessage: "x".repeat(4000) }).agentMessage,
    ).toHaveLength(4000);
  });
});

describe("acceptInviteSchema", () => {
  it("requires requestType", () => {
    expect(() => acceptInviteSchema.parse({})).toThrow();
  });

  it("accepts 'human' and 'agent' requestTypes", () => {
    expect(acceptInviteSchema.parse({ requestType: "human" }).requestType).toBe("human");
    expect(acceptInviteSchema.parse({ requestType: "agent" }).requestType).toBe("agent");
  });

  it("rejects unknown requestType", () => {
    expect(() => acceptInviteSchema.parse({ requestType: "service-account" })).toThrow();
  });

  it("constrains agentName length 1..120", () => {
    expect(() => acceptInviteSchema.parse({ requestType: "agent", agentName: "" })).toThrow();
    expect(() =>
      acceptInviteSchema.parse({ requestType: "agent", agentName: "a".repeat(121) }),
    ).toThrow();
  });

  it("caps capabilities at 4000 chars", () => {
    expect(() =>
      acceptInviteSchema.parse({ requestType: "agent", capabilities: "x".repeat(4001) }),
    ).toThrow();
  });
});

describe("updateCompanyMemberSchema", () => {
  it("requires at least one of membershipRole or status", () => {
    const r = updateCompanyMemberSchema.safeParse({});
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toMatch(/membershipRole or status/);
    }
  });

  it("accepts membershipRole only", () => {
    expect(updateCompanyMemberSchema.parse({ membershipRole: "admin" }).membershipRole).toBe(
      "admin",
    );
  });

  it("accepts status only", () => {
    expect(updateCompanyMemberSchema.parse({ status: "suspended" }).status).toBe("suspended");
  });

  it("rejects unknown status", () => {
    // 'archived' is not in editableMembershipStatuses -- only pending/active/suspended.
    expect(() => updateCompanyMemberSchema.parse({ status: "archived" })).toThrow();
  });

  it("explicit null membershipRole counts as 'provided'", () => {
    // Setting membershipRole=null is a real intent (clear role) -- it
    // satisfies the refine() because membershipRole is no longer undefined.
    expect(
      updateCompanyMemberSchema.parse({ membershipRole: null }).membershipRole,
    ).toBeNull();
  });
});

describe("updateCompanyMemberWithPermissionsSchema", () => {
  it("defaults grants to []", () => {
    const out = updateCompanyMemberWithPermissionsSchema.parse({ status: "active" });
    expect(out.grants).toEqual([]);
  });

  it("inherits the same require-one-of refine", () => {
    expect(updateCompanyMemberWithPermissionsSchema.safeParse({}).success).toBe(false);
  });
});

describe("archiveCompanyMemberSchema", () => {
  it("accepts no reassignment", () => {
    expect(archiveCompanyMemberSchema.parse({}).reassignment).toBeUndefined();
  });

  it("accepts agent-only reassignment", () => {
    const out = archiveCompanyMemberSchema.parse({
      reassignment: { assigneeAgentId: "00000000-0000-0000-0000-000000000001" },
    });
    expect(out.reassignment?.assigneeAgentId).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("accepts user-only reassignment", () => {
    const out = archiveCompanyMemberSchema.parse({
      reassignment: { assigneeUserId: "00000000-0000-0000-0000-000000000002" },
    });
    expect(out.reassignment?.assigneeUserId).toBe("00000000-0000-0000-0000-000000000002");
  });

  it("rejects BOTH agent and user reassignment", () => {
    // Logic ambiguity: which reassignment wins? -- API rejects to force a choice.
    const result = archiveCompanyMemberSchema.safeParse({
      reassignment: {
        assigneeAgentId: "00000000-0000-0000-0000-000000000001",
        assigneeUserId: "00000000-0000-0000-0000-000000000002",
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/Choose either an agent or user/);
    }
  });
});

describe("currentUserProfileSchema", () => {
  it("accepts an /api/assets/<id>/content path image", () => {
    const out = currentUserProfileSchema.parse({
      id: "u1",
      email: "u@example.com",
      name: "Alice",
      image: "/api/assets/abcd-1234/content",
    });
    expect(out.image).toBe("/api/assets/abcd-1234/content");
  });

  it("accepts the asset path with query string and fragment", () => {
    const out = currentUserProfileSchema.parse({
      id: "u1",
      email: null,
      name: null,
      image: "/api/assets/abc/content?cache=1#anchor",
    });
    expect(out.image).toBe("/api/assets/abc/content?cache=1#anchor");
  });

  it("accepts an https URL image", () => {
    const out = currentUserProfileSchema.parse({
      id: "u1",
      email: null,
      name: null,
      image: "https://cdn.example.com/avatar.png",
    });
    expect(out.image).toBe("https://cdn.example.com/avatar.png");
  });

  it("rejects bare relative paths that aren't asset routes", () => {
    expect(() =>
      currentUserProfileSchema.parse({
        id: "u1",
        email: null,
        name: null,
        image: "/profile.png",
      }),
    ).toThrow();
  });

  it("rejects non-http(s) protocols", () => {
    expect(() =>
      currentUserProfileSchema.parse({
        id: "u1",
        email: null,
        name: null,
        image: "ftp://example.com/avatar.png",
      }),
    ).toThrow();
  });

  it("allows null image and email and name", () => {
    expect(
      currentUserProfileSchema.parse({ id: "u1", email: null, name: null, image: null }).image,
    ).toBeNull();
  });

  it("rejects malformed email", () => {
    expect(() =>
      currentUserProfileSchema.parse({ id: "u1", email: "not-an-email", name: null, image: null }),
    ).toThrow();
  });
});

describe("updateCurrentUserProfileSchema", () => {
  it("transforms image='' to null", () => {
    // React form sends "" to clear avatar; schema MUST normalize so the
    // DB never stores an empty string the avatar component will crash on.
    const out = updateCurrentUserProfileSchema.parse({ name: "Alice", image: "" });
    expect(out.image).toBeNull();
  });

  it("preserves null image as null", () => {
    expect(updateCurrentUserProfileSchema.parse({ name: "Alice", image: null }).image).toBeNull();
  });

  it("allows omitted image", () => {
    expect(updateCurrentUserProfileSchema.parse({ name: "Alice" }).image).toBeUndefined();
  });

  it("trims and validates name length 1..120", () => {
    expect(() => updateCurrentUserProfileSchema.parse({ name: "" })).toThrow();
    expect(() => updateCurrentUserProfileSchema.parse({ name: "   " })).toThrow();
    expect(() => updateCurrentUserProfileSchema.parse({ name: "x".repeat(121) })).toThrow();
    expect(updateCurrentUserProfileSchema.parse({ name: "  Alice  " }).name).toBe("Alice");
  });

  it("rejects bad image URL", () => {
    expect(() =>
      updateCurrentUserProfileSchema.parse({ name: "Alice", image: "javascript:alert(1)" }),
    ).toThrow();
  });
});

describe("authSessionSchema", () => {
  it("requires session.id, session.userId, and a full user profile", () => {
    expect(() =>
      authSessionSchema.parse({
        session: { id: "s1", userId: "u1" },
        user: { id: "u1", email: null, name: null, image: null },
      }),
    ).not.toThrow();
  });

  it("rejects empty session id", () => {
    expect(() =>
      authSessionSchema.parse({
        session: { id: "", userId: "u1" },
        user: { id: "u1", email: null, name: null, image: null },
      }),
    ).toThrow();
  });
});

describe("claimJoinRequestApiKeySchema", () => {
  it("rejects secrets shorter than 16 chars", () => {
    expect(() => claimJoinRequestApiKeySchema.parse({ claimSecret: "x".repeat(15) })).toThrow();
  });

  it("accepts 16-char secrets (boundary)", () => {
    expect(
      claimJoinRequestApiKeySchema.parse({ claimSecret: "x".repeat(16) }).claimSecret,
    ).toHaveLength(16);
  });

  it("rejects secrets longer than 256 chars", () => {
    expect(() => claimJoinRequestApiKeySchema.parse({ claimSecret: "x".repeat(257) })).toThrow();
  });
});

describe("createCliAuthChallengeSchema", () => {
  it("requires command", () => {
    expect(() => createCliAuthChallengeSchema.parse({})).toThrow();
  });

  it("defaults requestedAccess to 'board'", () => {
    expect(createCliAuthChallengeSchema.parse({ command: "login" }).requestedAccess).toBe(
      "board",
    );
  });

  it("accepts 'instance_admin_required' as elevated requestedAccess", () => {
    expect(
      createCliAuthChallengeSchema.parse({
        command: "manage",
        requestedAccess: "instance_admin_required",
      }).requestedAccess,
    ).toBe("instance_admin_required");
  });

  it("rejects unknown requestedAccess", () => {
    expect(() =>
      createCliAuthChallengeSchema.parse({ command: "x", requestedAccess: "root" }),
    ).toThrow();
  });

  it("constrains command length 1..240", () => {
    expect(() => createCliAuthChallengeSchema.parse({ command: "" })).toThrow();
    expect(() => createCliAuthChallengeSchema.parse({ command: "x".repeat(241) })).toThrow();
  });

  it("rejects non-uuid requestedCompanyId", () => {
    expect(() =>
      createCliAuthChallengeSchema.parse({ command: "x", requestedCompanyId: "not-a-uuid" }),
    ).toThrow();
  });
});

describe("listCompanyInvitesQuerySchema", () => {
  it("coerces stringly-typed limit and offset (URL query semantics)", () => {
    // URL query strings arrive as strings; without z.coerce these become
    // ZodError("expected number, received string") on every list call.
    const out = listCompanyInvitesQuerySchema.parse({ limit: "50", offset: "100" });
    expect(out.limit).toBe(50);
    expect(out.offset).toBe(100);
  });

  it("defaults limit=20 offset=0 when omitted", () => {
    const out = listCompanyInvitesQuerySchema.parse({});
    expect(out.limit).toBe(20);
    expect(out.offset).toBe(0);
  });

  it("rejects limit above 100", () => {
    expect(() => listCompanyInvitesQuerySchema.parse({ limit: "101" })).toThrow();
  });

  it("rejects negative offset", () => {
    expect(() => listCompanyInvitesQuerySchema.parse({ offset: "-1" })).toThrow();
  });

  it("rejects unknown state filter", () => {
    expect(() => listCompanyInvitesQuerySchema.parse({ state: "spammy" })).toThrow();
  });
});

describe("searchAdminUsersQuerySchema", () => {
  it("trims whitespace-only query to ''", () => {
    // "no filter" intent -- if persisted as whitespace the LIKE % %
    // would silently match everything by pattern but produce wrong UX.
    expect(searchAdminUsersQuerySchema.parse({ query: "   " }).query).toBe("");
  });

  it("defaults missing query to ''", () => {
    expect(searchAdminUsersQuerySchema.parse({}).query).toBe("");
  });

  it("caps query at 120 chars (post-trim)", () => {
    expect(() => searchAdminUsersQuerySchema.parse({ query: "x".repeat(121) })).toThrow();
  });
});

describe("updateMemberPermissionsSchema", () => {
  it("requires grants array", () => {
    expect(() => updateMemberPermissionsSchema.parse({})).toThrow();
  });

  it("accepts empty grants array (revoke-all semantic)", () => {
    expect(updateMemberPermissionsSchema.parse({ grants: [] }).grants).toEqual([]);
  });

  it("rejects unknown permissionKey", () => {
    expect(() =>
      updateMemberPermissionsSchema.parse({
        grants: [{ permissionKey: "delete_universe" }],
      }),
    ).toThrow();
  });
});

describe("updateUserCompanyAccessSchema", () => {
  it("defaults companyIds to []", () => {
    expect(updateUserCompanyAccessSchema.parse({}).companyIds).toEqual([]);
  });

  it("rejects non-uuid entries", () => {
    expect(() =>
      updateUserCompanyAccessSchema.parse({ companyIds: ["not-a-uuid"] }),
    ).toThrow();
  });

  it("accepts a list of valid UUIDs", () => {
    const ids = [
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
    ];
    expect(updateUserCompanyAccessSchema.parse({ companyIds: ids }).companyIds).toEqual(ids);
  });
});
