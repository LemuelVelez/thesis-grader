import {
    addGroupMember,
    countGroupMembers,
    listGroupMembers,
    removeGroupMember,
} from "@/models/group-member.model"

export const GroupMembersController = {
    add: addGroupMember,
    remove: removeGroupMember,
    list: listGroupMembers,
    count: countGroupMembers,
}
