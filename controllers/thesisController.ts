
import {
    addGroupMember,
    createThesisGroup,
    deleteThesisGroup,
    getThesisGroupById,
    listGroupMembers,
    listThesisGroups,
    removeGroupMember,
    setGroupMembers,
    updateThesisGroup,
} from "@/models/thesisModel"

export const ThesisController = {
    listGroups: listThesisGroups,
    getGroupById: getThesisGroupById,
    createGroup: createThesisGroup,
    updateGroup: updateThesisGroup,
    deleteGroup: deleteThesisGroup,

    listMembers: listGroupMembers,
    addMember: addGroupMember,
    removeMember: removeGroupMember,
    setMembers: setGroupMembers,
}
