import {
    createRubricTemplate,
    deleteRubricTemplate,
    listRubricTemplates,
    updateRubricTemplate,
} from "@/models/rubric-template.model"

export const RubricTemplatesController = {
    list: listRubricTemplates,
    create: createRubricTemplate,
    update: updateRubricTemplate,
    delete: deleteRubricTemplate,
}
