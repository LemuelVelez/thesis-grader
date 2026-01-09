
import {
    bulkUpsertEvaluationScores,
    createEvaluation,
    createRubricCriterion,
    createRubricTemplate,
    deleteEvaluationScores,
    deleteRubricCriterion,
    deleteRubricTemplate,
    deleteStudentEvaluation,
    getEvaluationByAssignment,
    getEvaluationById,
    getRubricTemplateById,
    getStudentEvaluationById,
    listEvaluationScores,
    listEvaluations,
    listRubricCriteria,
    listRubricTemplates,
    listStudentEvaluations,
    updateEvaluation,
    updateRubricCriterion,
    updateRubricTemplate,
    updateStudentEvaluation,
    upsertEvaluationScore,
    upsertStudentEvaluation,
} from "@/models/evaluationModel"

export const EvaluationController = {
    // rubric templates
    listRubricTemplates,
    getRubricTemplateById,
    createRubricTemplate,
    updateRubricTemplate,
    deleteRubricTemplate,

    // rubric criteria
    listRubricCriteria,
    createRubricCriterion,
    updateRubricCriterion,
    deleteRubricCriterion,

    // evaluations
    listEvaluations,
    getEvaluationById,
    getEvaluationByAssignment,
    createEvaluation,
    updateEvaluation,

    // evaluation scores
    listEvaluationScores,
    upsertEvaluationScore,
    bulkUpsertEvaluationScores,
    deleteEvaluationScores,

    // student evaluations
    listStudentEvaluations,
    getStudentEvaluationById,
    upsertStudentEvaluation,
    updateStudentEvaluation,
    deleteStudentEvaluation,
}
