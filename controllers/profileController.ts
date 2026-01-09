
import {
    getStaffProfile,
    getStudentProfile,
    getUserById,
    listUsers,
    updateUser,
    upsertStaffProfile,
    upsertStudentProfile,
} from "@/models/profileModel"

export const ProfileController = {
    listUsers,
    getUserById,
    updateUser,

    getStudentProfile,
    upsertStudentProfile,

    getStaffProfile,
    upsertStaffProfile,
}
