import {
    addSchedulePanelist,
    listSchedulePanelists,
    removeSchedulePanelist,
} from "@/models/schedule-panelist.model"

export const SchedulePanelistsController = {
    add: addSchedulePanelist,
    remove: removeSchedulePanelist,
    list: listSchedulePanelists,
}
