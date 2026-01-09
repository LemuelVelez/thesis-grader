import {
    createPasswordReset,
    deletePasswordResetById,
    deletePasswordResetsByUserId,
    findPasswordResetByTokenHash,
    markPasswordResetUsed,
    purgeExpiredOrUsedPasswordResets,
} from "@/models/password-reset.model"

export const PasswordResetsController = {
    create: createPasswordReset,
    findByTokenHash: findPasswordResetByTokenHash,
    markUsed: markPasswordResetUsed,
    deleteById: deletePasswordResetById,
    deleteByUserId: deletePasswordResetsByUserId,
    purgeExpiredOrUsed: purgeExpiredOrUsedPasswordResets,
}
