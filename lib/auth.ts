import type { ThesisRole, UserRow } from "../database/models/Model"

export type Role = ThesisRole
export type PublicUser = Omit<UserRow, "password_hash">
