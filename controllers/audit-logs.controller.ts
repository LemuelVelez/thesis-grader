import { insertAuditLog, listAuditLogsInRange } from "@/models/audit-log.model"

export const AuditLogsController = {
    insert: insertAuditLog,
    listInRange: listAuditLogsInRange,
}
