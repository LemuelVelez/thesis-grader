import {
    createDefenseSchedule,
    deleteDefenseSchedule,
    getDefenseScheduleById,
    listDefenseSchedules,
    updateDefenseSchedule,
} from "@/models/defense-schedule.model"

export const DefenseSchedulesController = {
    create: createDefenseSchedule,
    getById: getDefenseScheduleById,
    update: updateDefenseSchedule,
    delete: deleteDefenseSchedule,
    list: listDefenseSchedules,
}
