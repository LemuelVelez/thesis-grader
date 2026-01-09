import {
    createSession,
    deleteSessionById,
    deleteSessionByTokenHash,
    deleteSessionsByUserId,
    findSessionByTokenHash,
    purgeExpiredSessions,
} from "@/models/session.model"

export const SessionsController = {
    create: createSession,
    findByTokenHash: findSessionByTokenHash,
    deleteById: deleteSessionById,
    deleteByTokenHash: deleteSessionByTokenHash,
    deleteByUserId: deleteSessionsByUserId,
    purgeExpired: purgeExpiredSessions,
}
