import { deleteStudentProfile, getStudentProfile, upsertStudentProfile } from "@/models/student.model"

export const StudentsController = {
    getProfile: getStudentProfile,
    upsertProfile: upsertStudentProfile,
    deleteProfile: deleteStudentProfile,
}
