import {
    bulkUpsertEvaluationScores,
    deleteEvaluationScores,
    listEvaluationScores,
    upsertEvaluationScore,
} from "@/models/evaluation-score.model"

export const EvaluationScoresController = {
    list: listEvaluationScores,
    upsert: upsertEvaluationScore,
    bulkUpsert: bulkUpsertEvaluationScores,
    deleteByEvaluation: deleteEvaluationScores,
}
