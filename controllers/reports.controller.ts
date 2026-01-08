import { getReportsSummary, buildAuditExportCsv } from "@/lib/reports-admin"

export const ReportsController = {
    getSummary: getReportsSummary,
    buildAuditCsv: buildAuditExportCsv,
}
