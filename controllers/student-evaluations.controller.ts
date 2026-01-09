import {
    deleteStudentEvaluation,
    getStudentEvaluation,
    listStudentEvaluationsBySchedule,
    lockStudentEvaluation,
    submitStudentEvaluation,
    upsertStudentEvaluation,
} from "@/models/student-evaluation.model"

export const StudentEvaluationsController = {
    get: getStudentEvaluation,
    upsert: upsertStudentEvaluation,
    submit: submitStudentEvaluation,
    lock: lockStudentEvaluation,
    listBySchedule: listStudentEvaluationsBySchedule,
    delete: deleteStudentEvaluation,
}
