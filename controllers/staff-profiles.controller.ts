import { deleteStaffProfile, getStaffProfile, upsertStaffProfile } from "@/models/staff-profile.model"

export const StaffProfilesController = {
    getProfile: getStaffProfile,
    upsertProfile: upsertStaffProfile,
    deleteProfile: deleteStaffProfile,
}
