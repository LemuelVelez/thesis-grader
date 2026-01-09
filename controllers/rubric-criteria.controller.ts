import {
    createRubricCriterion,
    deleteRubricCriterion,
    listRubricCriteria,
    updateRubricCriterion,
} from "@/models/rubric-criterion.model"

export const RubricCriteriaController = {
    list: listRubricCriteria,
    create: createRubricCriterion,
    update: updateRubricCriterion,
    delete: deleteRubricCriterion,
}
