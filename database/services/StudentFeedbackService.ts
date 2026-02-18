import type {
    ISODateTime,
    JsonObject,
    StudentEvaluationRow,
    StudentEvalStatus,
    StudentRow,
    UserRow,
    UUID,
} from '../models/Model';
import type { Services } from './Services';

export type StudentFeedbackFormSchema = JsonObject;

export const DEFAULT_STUDENT_FEEDBACK_FORM_SCHEMA: StudentFeedbackFormSchema = {
    version: 1,
    key: 'student-feedback-v1',
    title: 'Student Feedback Form',
    description:
        'Your feedback helps improve the thesis defense experience. Please answer honestly.',
    sections: [
        {
            id: 'overall',
            title: 'Overall Experience',
            questions: [
                {
                    id: 'overall_satisfaction',
                    type: 'rating',
                    label: 'Overall satisfaction with the defense process',
                    scale: { min: 1, max: 5, minLabel: 'Poor', maxLabel: 'Excellent' },
                    required: true,
                },
                {
                    id: 'schedule_clarity',
                    type: 'rating',
                    label: 'Clarity of schedule, venue, and instructions',
                    scale: { min: 1, max: 5, minLabel: 'Unclear', maxLabel: 'Very clear' },
                    required: true,
                },
                {
                    id: 'time_management',
                    type: 'rating',
                    label: 'Time management during the defense',
                    scale: { min: 1, max: 5, minLabel: 'Poor', maxLabel: 'Excellent' },
                    required: true,
                },
            ],
        },
        {
            id: 'panel',
            title: 'Panel & Feedback Quality',
            questions: [
                {
                    id: 'feedback_helpfulness',
                    type: 'rating',
                    label: 'Helpfulness of panel feedback',
                    scale: { min: 1, max: 5, minLabel: 'Not helpful', maxLabel: 'Very helpful' },
                    required: true,
                },
                {
                    id: 'feedback_fairness',
                    type: 'rating',
                    label: 'Fairness and professionalism of evaluation',
                    scale: { min: 1, max: 5, minLabel: 'Unfair', maxLabel: 'Very fair' },
                    required: true,
                },
                {
                    id: 'feedback_clarity',
                    type: 'rating',
                    label: 'Clarity of comments and recommendations',
                    scale: { min: 1, max: 5, minLabel: 'Unclear', maxLabel: 'Very clear' },
                    required: true,
                },
            ],
        },
        {
            id: 'facilities',
            title: 'Facilities & Logistics',
            questions: [
                {
                    id: 'venue_readiness',
                    type: 'rating',
                    label: 'Venue readiness (room, equipment, setup)',
                    scale: { min: 1, max: 5, minLabel: 'Poor', maxLabel: 'Excellent' },
                    required: true,
                },
                {
                    id: 'audio_visual',
                    type: 'rating',
                    label: 'Audio/visual support and presentation setup',
                    scale: { min: 1, max: 5, minLabel: 'Poor', maxLabel: 'Excellent' },
                    required: true,
                },
            ],
        },
        {
            id: 'open_ended',
            title: 'Suggestions',
            questions: [
                {
                    id: 'what_went_well',
                    type: 'text',
                    label: 'What went well during the defense?',
                    placeholder: 'Share what worked best...',
                    required: false,
                    maxLength: 1000,
                },
                {
                    id: 'what_to_improve',
                    type: 'text',
                    label: 'What should be improved?',
                    placeholder: 'Share suggestions...',
                    required: false,
                    maxLength: 1000,
                },
                {
                    id: 'other_comments',
                    type: 'text',
                    label: 'Other comments',
                    placeholder: 'Anything else you want to add...',
                    required: false,
                    maxLength: 1000,
                },
            ],
        },
    ],
};

export interface AssignStudentFeedbackFormsInput {
    /**
     * If omitted, the service will auto-detect group members via the schedule's group_id.
     * If provided, only these studentIds will be targeted.
     */
    studentIds?: UUID[];

    /**
     * If true, pending feedback rows will be reset to pending + seedAnswers.
     * Submitted/locked feedback is never overwritten for safety.
     */
    overwritePending?: boolean;

    /**
     * Optional seed structure that the frontend can use as initial answers.
     * (Responses are still stored in student_evaluations.answers.)
     */
    seedAnswers?: JsonObject;

    /**
     * Default status for newly created feedback rows (usually "pending").
     */
    initialStatus?: StudentEvalStatus;
}

export interface AssignStudentFeedbackFormsResult {
    scheduleId: UUID;
    groupId: UUID;
    targetedStudentIds: UUID[];

    created: StudentEvaluationRow[];
    updated: StudentEvaluationRow[];
    existing: StudentEvaluationRow[];

    counts: {
        targeted: number;
        created: number;
        updated: number;
        existing: number;
    };
}

export interface StudentFeedbackStudentInfo {
    id: UUID;
    name: string | null;
    email: string | null;
    program: string | null;
    section: string | null;
}

export interface AdminStudentFeedbackRow extends StudentEvaluationRow {
    student: StudentFeedbackStudentInfo;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toJsonObject(value: unknown): JsonObject {
    if (!isRecord(value)) return {};
    const out: JsonObject = {};
    for (const [k, v] of Object.entries(value)) {
        // Keep it simple; answers payload can be validated at UI layer.
        out[k] = v as any;
    }
    return out;
}

function isoNow(): ISODateTime {
    return new Date().toISOString();
}

function uniqueUuids(values: UUID[]): UUID[] {
    const seen = new Set<string>();
    const out: UUID[] = [];
    for (const v of values) {
        const key = String(v).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(v);
    }
    return out;
}

export class StudentFeedbackService {
    constructor(private readonly services: Services) { }

    getSchema(): StudentFeedbackFormSchema {
        return DEFAULT_STUDENT_FEEDBACK_FORM_SCHEMA;
    }

    async assignForSchedule(
        scheduleId: UUID,
        input: AssignStudentFeedbackFormsInput = {},
    ): Promise<AssignStudentFeedbackFormsResult | null> {
        const overwritePending = input.overwritePending ?? false;
        const initialStatus: StudentEvalStatus = input.initialStatus ?? 'pending';
        const seedAnswers = toJsonObject(input.seedAnswers);

        return this.services.transaction(async (tx) => {
            const schedule = await tx.defense_schedules.findById(scheduleId);
            if (!schedule) return null;

            const groupId = schedule.group_id;

            let studentIds: UUID[] = [];
            if (input.studentIds && input.studentIds.length > 0) {
                studentIds = uniqueUuids(input.studentIds);
            } else {
                const members = await tx.group_members.listByGroup(groupId);
                studentIds = uniqueUuids(
                    members
                        .map((m) => m.student_id as UUID)
                        .filter((v): v is UUID => typeof v === 'string' && v.length > 0),
                );
            }

            if (studentIds.length === 0) {
                // No members found for this schedule/group.
                return {
                    scheduleId,
                    groupId,
                    targetedStudentIds: [],
                    created: [],
                    updated: [],
                    existing: [],
                    counts: { targeted: 0, created: 0, updated: 0, existing: 0 },
                };
            }

            const created: StudentEvaluationRow[] = [];
            const updated: StudentEvaluationRow[] = [];
            const existing: StudentEvaluationRow[] = [];

            for (const studentId of studentIds) {
                const finder = tx.student_evaluations.findByScheduleAndStudent;
                const row =
                    typeof finder === 'function'
                        ? await finder(scheduleId, studentId)
                        : await tx.student_evaluations.findOne({
                            schedule_id: scheduleId,
                            student_id: studentId,
                        } as Partial<StudentEvaluationRow>);

                if (row) {
                    // Safety: never overwrite submitted/locked.
                    const isProtected = row.status === 'submitted' || row.status === 'locked';

                    if (!isProtected && overwritePending && row.status === 'pending') {
                        const patched = await tx.student_evaluations.updateOne(
                            { id: row.id },
                            {
                                status: initialStatus,
                                answers: seedAnswers,
                                submitted_at: null,
                                locked_at: null,
                                updated_at: isoNow(),
                            },
                        );

                        updated.push((patched ?? row) as StudentEvaluationRow);
                    } else {
                        existing.push(row as StudentEvaluationRow);
                    }

                    continue;
                }

                const newRow = await tx.student_evaluations.create({
                    schedule_id: scheduleId,
                    student_id: studentId,
                    status: initialStatus,
                    answers: seedAnswers,
                    submitted_at: null,
                    locked_at: null,
                    created_at: isoNow(),
                    updated_at: isoNow(),
                } as any);

                created.push(newRow as StudentEvaluationRow);
            }

            return {
                scheduleId,
                groupId,
                targetedStudentIds: studentIds,
                created,
                updated,
                existing,
                counts: {
                    targeted: studentIds.length,
                    created: created.length,
                    updated: updated.length,
                    existing: existing.length,
                },
            };
        });
    }

    async listForScheduleDetailed(scheduleId: UUID): Promise<AdminStudentFeedbackRow[]> {
        const rows = await this.services.student_evaluations.listBySchedule(scheduleId);

        const studentIds = uniqueUuids(
            rows
                .map((r) => r.student_id as UUID)
                .filter((v): v is UUID => typeof v === 'string' && v.length > 0),
        );

        const [users, profiles] = await Promise.all([
            Promise.all(studentIds.map((id) => this.safeFindUser(id))),
            Promise.all(studentIds.map((id) => this.safeFindStudentProfile(id))),
        ]);

        const userMap = new Map<string, UserRow>();
        for (const u of users) {
            if (u) userMap.set(u.id.toLowerCase(), u);
        }

        const profileMap = new Map<string, StudentRow>();
        for (const p of profiles) {
            if (p) profileMap.set(p.user_id.toLowerCase(), p);
        }

        return rows.map((r) => {
            const key = String(r.student_id).toLowerCase();
            const u = userMap.get(key) ?? null;
            const p = profileMap.get(key) ?? null;

            return {
                ...(r as StudentEvaluationRow),
                student: {
                    id: r.student_id,
                    name: u?.name ?? null,
                    email: u?.email ?? null,
                    program: p?.program ?? null,
                    section: p?.section ?? null,
                },
            };
        });
    }

    private async safeFindUser(id: UUID): Promise<UserRow | null> {
        try {
            return await this.services.users.findById(id);
        } catch {
            return null;
        }
    }

    private async safeFindStudentProfile(id: UUID): Promise<StudentRow | null> {
        try {
            return await this.services.students.findByUserId(id);
        } catch {
            return null;
        }
    }
}

export default StudentFeedbackService;
