import { pgTable, uuid, timestamp, unique, pgEnum } from "drizzle-orm/pg-core";
import { groups } from "./groups";
import { subgroups } from "./subgroups";
import { users } from "./users";

export const memberRoleEnum = pgEnum("member_role", ["admin", "member"]);

/** Pertenencia de un usuario a un grupo, con su rol (Fase 2/4). */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("memberships_group_user_unique").on(table.groupId, table.userId)],
);

export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;

/** Pertenencia opcional a un subgrupo (subconjunto de miembros del grupo). */
export const subgroupMemberships = pgTable(
  "subgroup_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subgroupId: uuid("subgroup_id")
      .notNull()
      .references(() => subgroups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("subgroup_memberships_subgroup_user_unique").on(table.subgroupId, table.userId)],
);

export type SubgroupMembership = typeof subgroupMemberships.$inferSelect;
export type NewSubgroupMembership = typeof subgroupMemberships.$inferInsert;
