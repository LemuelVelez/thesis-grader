
import {
    addSchedulePanelist,
    createDefenseSchedule,
    deleteDefenseSchedule,
    getDefenseScheduleById,
    listDefenseSchedules,
    listSchedulePanelists,
    removeSchedulePanelist,
    setSchedulePanelists,
    updateDefenseSchedule,
} from "@/models/scheduleModel"

export const ScheduleController = {
    listSchedules: listDefenseSchedules,
    getScheduleById: getDefenseScheduleById,
    createSchedule: createDefenseSchedule,
    updateSchedule: updateDefenseSchedule,
    deleteSchedule: deleteDefenseSchedule,

    listPanelists: listSchedulePanelists,
    addPanelist: addSchedulePanelist,
    removePanelist: removeSchedulePanelist,
    setPanelists: setSchedulePanelists,
}
