import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { accounts, sessions, users, verifications } from "@/db/schema/auth";
import { developers, developerUsers } from "@/db/schema/catalog";

/**
 * Inviting people to an existing canonical developer profile
 * (DECISIONS.md 2026-09-19; docs/tasklists/2026-09-19-admin-portal.md slice 2).
 *
 * Design, as approved: an admin invites an email address to a profile that
 * already exists — the properties uploaded under it need no transfer. The invite
 * creates a user with no password, a `developer_users` row in `invited` status,
 * and a single-use token that expires in seven days. Only the SHA-256 hash of the
 * token is stored, in Better Auth's generic `verifications` table, so a database
 * leak does not leak working invite links. Until an email provider exists the
 * admin is shown the link once and shares it. The invitee sets a password (12+
 * characters), which creates their credential account, activates the link, and
 * consumes the token; the link cannot be used twice. A profile may have several
 * users; one user belongs to one profile.
 *
 * This writes identity and access only — never a live catalog table. The password
 * hasher is injected so this module stays testable without the auth server.
 */

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 12;

export type InviteErrorCode =
  | "developer_not_found"
  | "invalid_email"
  | "account_exists"
  | "already_member"
  | "member_not_found"
  | "invalid_link"
  | "weak_password";

export class InviteError extends Error {
  constructor(
    public readonly code: InviteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "InviteError";
  }
}

const UUID = /^[0-9a-f-]{36}$/i;
const identifierFor = (userId: string) => `developer-invite:${userId}`;

export const hashInviteToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

const tokensMatch = (storedHash: string, token: string): boolean => {
  const given = Buffer.from(hashInviteToken(token));
  const stored = Buffer.from(storedHash);
  return given.length === stored.length && timingSafeEqual(given, stored);
};

const normaliseEmail = (raw: string): string => {
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new InviteError("invalid_email", "Enter a valid email address.");
  }
  return email;
};

type Db = PostgresJsDatabase;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Replaces any earlier token for this user with a fresh one. */
const issueToken = async (
  tx: Tx,
  userId: string,
  now: Date,
): Promise<{ token: string; expiresAt: Date }> => {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  await tx
    .delete(verifications)
    .where(eq(verifications.identifier, identifierFor(userId)));
  await tx.insert(verifications).values({
    id: randomUUID(),
    identifier: identifierFor(userId),
    value: hashInviteToken(token),
    expiresAt,
  });
  return { token, expiresAt };
};

export interface IssuedInvite {
  developerUserId: string;
  userId: string;
  email: string;
  /** Shown once; only its hash is stored. */
  token: string;
  expiresAt: Date;
}

export const createDeveloperInvite = async (
  database: Db,
  input: { developerId: string; email: string; title?: string; now?: Date },
): Promise<IssuedInvite> => {
  const email = normaliseEmail(input.email);
  const now = input.now ?? new Date();
  if (!UUID.test(input.developerId)) {
    throw new InviteError(
      "developer_not_found",
      "Developer profile not found.",
    );
  }

  return database.transaction(async (tx) => {
    const [developer] = await tx
      .select({ id: developers.id })
      .from(developers)
      .where(eq(developers.id, input.developerId));
    if (!developer) {
      throw new InviteError(
        "developer_not_found",
        "Developer profile not found.",
      );
    }

    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));

    if (existing) {
      const [link] = await tx
        .select({
          id: developerUsers.id,
          developerId: developerUsers.developerId,
          status: developerUsers.status,
        })
        .from(developerUsers)
        .where(eq(developerUsers.userId, existing.id));
      if (
        link &&
        link.developerId === developer.id &&
        link.status === "invited"
      ) {
        // Same person, same profile, still waiting: hand out a fresh link.
        const { token, expiresAt } = await issueToken(tx, existing.id, now);
        return {
          developerUserId: link.id,
          userId: existing.id,
          email,
          token,
          expiresAt,
        };
      }
      if (
        link &&
        link.developerId === developer.id &&
        link.status === "active"
      ) {
        throw new InviteError(
          "already_member",
          "That person is already on this team.",
        );
      }
      // Any other existing account (a buyer, an admin, another developer's team,
      // a revoked member) is refused rather than quietly re-purposed.
      throw new InviteError(
        "account_exists",
        "That email already has an account here.",
      );
    }

    const userId = randomUUID().replaceAll("-", "");
    await tx.insert(users).values({
      id: userId,
      name: email.split("@")[0],
      email,
      emailVerified: false,
    });
    const [link] = await tx
      .insert(developerUsers)
      .values({
        developerId: developer.id,
        userId,
        title: input.title?.trim() || null,
        status: "invited",
      })
      .returning({ id: developerUsers.id });
    const { token, expiresAt } = await issueToken(tx, userId, now);
    return { developerUserId: link.id, userId, email, token, expiresAt };
  });
};

/** A new link for someone still waiting; the old link stops working. */
export const reissueDeveloperInvite = async (
  database: Db,
  input: { developerUserId: string; now?: Date },
): Promise<IssuedInvite> => {
  if (!UUID.test(input.developerUserId)) {
    throw new InviteError("member_not_found", "Team member not found.");
  }
  return database.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: developerUsers.id,
        userId: developerUsers.userId,
        status: developerUsers.status,
        email: users.email,
      })
      .from(developerUsers)
      .innerJoin(users, eq(users.id, developerUsers.userId))
      .where(eq(developerUsers.id, input.developerUserId))
      .for("update");
    if (!row || row.status !== "invited") {
      throw new InviteError(
        "member_not_found",
        "That invitation is no longer pending.",
      );
    }
    const { token, expiresAt } = await issueToken(
      tx,
      row.userId,
      input.now ?? new Date(),
    );
    return {
      developerUserId: row.id,
      userId: row.userId,
      email: row.email,
      token,
      expiresAt,
    };
  });
};

/** Withdraws a pending invitation or removes an active member's access at once. */
export const revokeDeveloperUser = async (
  database: Db,
  input: { developerUserId: string },
): Promise<void> => {
  if (!UUID.test(input.developerUserId)) {
    throw new InviteError("member_not_found", "Team member not found.");
  }
  await database.transaction(async (tx) => {
    const [row] = await tx
      .update(developerUsers)
      .set({ status: "revoked" })
      .where(eq(developerUsers.id, input.developerUserId))
      .returning({ userId: developerUsers.userId });
    if (!row)
      throw new InviteError("member_not_found", "Team member not found.");
    await tx
      .delete(verifications)
      .where(eq(verifications.identifier, identifierFor(row.userId)));
    // Cut off anyone already signed in.
    await tx.delete(sessions).where(eq(sessions.userId, row.userId));
  });
};

const findValidInvite = async (
  tx: Db | Tx,
  input: { userId: string; token: string; now: Date },
) => {
  if (!input.userId || !input.token) return null;
  const [verification] = await tx
    .select()
    .from(verifications)
    .where(eq(verifications.identifier, identifierFor(input.userId)));
  if (!verification) return null;
  if (verification.expiresAt.getTime() <= input.now.getTime()) return null;
  if (!tokensMatch(verification.value, input.token)) return null;

  const [member] = await tx
    .select({
      id: developerUsers.id,
      email: users.email,
      developerName: developers.name,
    })
    .from(developerUsers)
    .innerJoin(users, eq(users.id, developerUsers.userId))
    .innerJoin(developers, eq(developers.id, developerUsers.developerId))
    .where(
      and(
        eq(developerUsers.userId, input.userId),
        eq(developerUsers.status, "invited"),
      ),
    );
  return member ? { verificationId: verification.id, ...member } : null;
};

/**
 * Checks a link without using it, so the accept page can show the form or a plain
 * "this link no longer works". Every failure — unknown user, wrong token, expired,
 * already used, revoked — is the same answer.
 */
export const inspectInvite = async (
  database: Db,
  input: { userId: string; token: string; now?: Date },
): Promise<{ email: string; developerName: string }> => {
  const found = await findValidInvite(database, {
    ...input,
    now: input.now ?? new Date(),
  });
  if (!found) {
    throw new InviteError(
      "invalid_link",
      "This link has expired or has already been used.",
    );
  }
  return { email: found.email, developerName: found.developerName };
};

export const acceptDeveloperInvite = async (
  database: Db,
  input: {
    userId: string;
    token: string;
    password: string;
    name?: string;
    hashPassword: (password: string) => Promise<string>;
    now?: Date;
  },
): Promise<{ email: string }> => {
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new InviteError(
      "weak_password",
      `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
  const passwordHash = await input.hashPassword(input.password);

  return database.transaction(async (tx) => {
    const found = await findValidInvite(tx, {
      ...input,
      now: input.now ?? new Date(),
    });
    if (!found) {
      throw new InviteError(
        "invalid_link",
        "This link has expired or has already been used.",
      );
    }
    // Lock the membership row so two simultaneous accepts cannot both succeed.
    const [locked] = await tx
      .select({ status: developerUsers.status })
      .from(developerUsers)
      .where(eq(developerUsers.id, found.id))
      .for("update");
    if (locked?.status !== "invited") {
      throw new InviteError(
        "invalid_link",
        "This link has expired or has already been used.",
      );
    }

    await tx.insert(accounts).values({
      id: randomUUID().replaceAll("-", ""),
      accountId: input.userId,
      providerId: "credential",
      issuer: "local:credential",
      userId: input.userId,
      password: passwordHash,
    });
    const name = input.name?.trim();
    if (name)
      await tx.update(users).set({ name }).where(eq(users.id, input.userId));
    await tx
      .update(developerUsers)
      .set({ status: "active" })
      .where(eq(developerUsers.id, found.id));
    await tx
      .delete(verifications)
      .where(eq(verifications.id, found.verificationId));
    return { email: found.email };
  });
};

export interface TeamMember {
  developerUserId: string;
  email: string;
  name: string;
  title: string | null;
  status: "invited" | "active" | "revoked";
  invitedAt: Date;
  /** Only for a pending invitation. */
  inviteExpiresAt: Date | null;
}

export const listDeveloperTeam = async (
  database: Db,
  developerId: string,
): Promise<TeamMember[]> => {
  if (!UUID.test(developerId)) return [];
  const rows = await database
    .select({
      developerUserId: developerUsers.id,
      email: users.email,
      name: users.name,
      title: developerUsers.title,
      status: developerUsers.status,
      invitedAt: developerUsers.createdAt,
      userId: developerUsers.userId,
    })
    .from(developerUsers)
    .innerJoin(users, eq(users.id, developerUsers.userId))
    .where(eq(developerUsers.developerId, developerId))
    .orderBy(developerUsers.createdAt);

  const result: TeamMember[] = [];
  for (const row of rows) {
    let inviteExpiresAt: Date | null = null;
    if (row.status === "invited") {
      const [verification] = await database
        .select({ expiresAt: verifications.expiresAt })
        .from(verifications)
        .where(eq(verifications.identifier, identifierFor(row.userId)));
      inviteExpiresAt = verification?.expiresAt ?? null;
    }
    result.push({
      developerUserId: row.developerUserId,
      email: row.email,
      name: row.name,
      title: row.title,
      status: row.status,
      invitedAt: row.invitedAt,
      inviteExpiresAt,
    });
  }
  return result;
};

/** The address an invitee opens. The token appears only here, once, and is never stored. */
export const buildInviteUrl = (
  origin: string,
  userId: string,
  token: string,
): string =>
  `${origin.replace(/\/$/, "")}/developers/accept-invite?u=${encodeURIComponent(userId)}&t=${encodeURIComponent(token)}`;
