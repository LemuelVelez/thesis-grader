import { getThesisDashboardStats, listThesisGroups, createThesisGroup, deleteThesisGroup } from "@/lib/thesis-admin"

export const ThesisController = {
  getDashboardStats: getThesisDashboardStats,
  listGroups: listThesisGroups,
  createGroup: createThesisGroup,
  deleteGroup: deleteThesisGroup,
}
