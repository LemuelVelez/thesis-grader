import { findUserByEmail, findUserById, listUsers } from "@/models/user.model"

export const UsersController = {
    findByEmail: findUserByEmail,
    findById: findUserById,
    listUsers,
}
