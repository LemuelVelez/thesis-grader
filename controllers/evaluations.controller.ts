import {
    createEvaluation,
    deleteEvaluation,
    getEvaluationByAssignment,
    getEvaluationById,
    listEvaluationsBySchedule,
    lockEvaluation,
    markEvaluationSubmitted,
    updateEvaluationStatus,
} from "@/models/evaluation.model"

export const EvaluationsController = {
    create: createEvaluation,
    getById: getEvaluationById,
    getByAssignment: getEvaluationByAssignment,
    listBySchedule: listEvaluationsBySchedule,
    updateStatus: updateEvaluationStatus,
    markSubmitted: markEvaluationSubmitted,
    lock: lockEvaluation,
    delete: deleteEvaluation,
}
