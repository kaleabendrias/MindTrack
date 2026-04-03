import crypto from "node:crypto";
import { config } from "../../config/index.js";
import { AppError } from "../../domain/errors/AppError.js";
import { User, permissions } from "../../domain/models/User.js";
import { hashSecret, verifySecret } from "../../infrastructure/security/passwordHasher.js";
import {
  hashToken,
  issueAccessToken,
  issueRefreshToken,
  verifyRefreshToken
} from "../../infrastructure/security/tokenService.js";
import { enforcePasswordPolicy } from "../security/passwordPolicy.js";

function maskPii(value) {
  if (!value) {
    return "";
  }
  if (value.length <= 4) {
    return "*".repeat(value.length);
  }
  return `${"*".repeat(value.length - 4)}${value.slice(-4)}`;
}

export class AuthService {
  constructor({ userRepository, sessionRepository, auditService }) {
    this.userRepository = userRepository;
    this.sessionRepository = sessionRepository;
    this.auditService = auditService;
  }

  sanitizeUser(user, canViewPii) {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      mindTrackClientId: user.mindTrackClientId || null,
      permissions: user.permissions,
      phone: canViewPii ? user.phone : maskPii(user.phone),
      address: canViewPii ? user.address : user.address ? "***masked***" : "",
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  async registerByAdmin({ actor, username, password, role, phone, address, securityQuestions, reason }) {
    if (!actor || !actor.permissions.includes(permissions.userManage)) {
      throw new AppError("insufficient permissions", 403, "FORBIDDEN");
    }

    const normalizedUsername = User.normalizeUsername(username);
    User.validateRole(role);
    enforcePasswordPolicy(password);

    const existing = await this.userRepository.findByUsername(normalizedUsername);
    if (existing) {
      throw new AppError("username already exists", 409, "USER_EXISTS");
    }

    if (!Array.isArray(securityQuestions) || !securityQuestions.length) {
      throw new AppError("at least one security question is required", 400, "INVALID_REQUEST");
    }

    const normalizedQuestions = [];
    for (const entry of securityQuestions) {
      if (!entry.question || !entry.answer) {
        throw new AppError("security question and answer are required", 400, "INVALID_REQUEST");
      }
      normalizedQuestions.push({
        question: entry.question.trim(),
        answerHash: await hashSecret(entry.answer.trim().toLowerCase())
      });
    }

    const rolePermissions = role === "administrator"
      ? [permissions.piiView, permissions.userManage, permissions.auditRead]
      : [];

    const created = await this.userRepository.create({
      id: crypto.randomUUID().replaceAll("-", ""),
      username: normalizedUsername,
      role,
      mindTrackClientId: null,
      permissions: rolePermissions,
      passwordHash: await hashSecret(password),
      phone: phone || "",
      address: address || "",
      securityQuestions: normalizedQuestions
    });

    await this.auditService.logAction({
      actorUserId: actor.id,
      action: "create",
      entityType: "user",
      entityId: created.id,
      reason: reason || "administrator account creation",
      before: null,
      after: {
        username: created.username,
        role: created.role
      }
    });

    return this.sanitizeUser(created, actor.permissions.includes(permissions.piiView));
  }

  async login({ username, password, ipAddress, userAgent }) {
    const normalizedUsername = User.normalizeUsername(username);
    const user = await this.userRepository.findByUsername(normalizedUsername);
    if (!user) {
      throw new AppError("invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError("account is temporarily locked", 423, "ACCOUNT_LOCKED");
    }

    const isPasswordValid = await verifySecret(password, user.passwordHash);
    if (!isPasswordValid) {
      const nextAttempts = (user.failedLoginAttempts || 0) + 1;
      const lockUntil =
        nextAttempts >= config.failedLoginLimit
          ? new Date(Date.now() + config.accountLockMinutes * 60 * 1000)
          : null;

      await this.userRepository.update(user.id, {
        failedLoginAttempts: nextAttempts,
        lockedUntil: lockUntil
      });

      throw new AppError("invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    await this.userRepository.update(user.id, {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date()
    });

    const sessionId = crypto.randomUUID().replaceAll("-", "");
    const csrfToken = crypto
      .createHmac("sha256", config.requestSigningSecret)
      .update(`${user.id}:${sessionId}:${crypto.randomUUID()}`)
      .digest("hex");
    const requestSigningKey = csrfToken;
    const refreshToken = issueRefreshToken({ userId: user.id, sessionId });
    const accessToken = issueAccessToken({
      userId: user.id,
      sessionId,
      role: user.role,
      permissions: user.permissions
    });

    await this.sessionRepository.create({
      id: sessionId,
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + config.refreshTokenTtlSeconds * 1000),
      lastSeenAt: new Date(),
      csrfToken,
      requestSigningKey,
      ipHistory: ipAddress ? [ipAddress] : [],
      userAgentHistory: userAgent ? [userAgent] : []
    });

    const freshUser = await this.userRepository.findById(user.id);

    return {
      accessToken,
      refreshToken,
      csrfToken,
      requestSigningKey,
      expiresInSeconds: config.accessTokenTtlSeconds,
      refreshExpiresInSeconds: config.refreshTokenTtlSeconds,
      user: this.sanitizeUser(
        freshUser,
        freshUser.permissions.includes(permissions.piiView)
      )
    };
  }

  async refreshTokens(refreshToken) {
    const payload = verifyRefreshToken(refreshToken);
    const session = await this.sessionRepository.findById(payload.sid);
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new AppError("invalid session", 401, "INVALID_SESSION");
    }

    if (session.refreshTokenHash !== hashToken(refreshToken)) {
      throw new AppError("refresh token mismatch", 401, "INVALID_TOKEN");
    }

    const user = await this.userRepository.findById(payload.sub);
    if (!user) {
      throw new AppError("user not found", 404, "USER_NOT_FOUND");
    }

    const nextRefreshToken = issueRefreshToken({ userId: user.id, sessionId: session.id });
    const accessToken = issueAccessToken({
      userId: user.id,
      sessionId: session.id,
      role: user.role,
      permissions: user.permissions
    });

    await this.sessionRepository.update(session.id, {
      refreshTokenHash: hashToken(nextRefreshToken),
      expiresAt: new Date(Date.now() + config.refreshTokenTtlSeconds * 1000),
      lastSeenAt: new Date()
    });

    return {
      accessToken,
      refreshToken: nextRefreshToken,
      csrfToken: session.csrfToken,
      expiresInSeconds: config.accessTokenTtlSeconds,
      refreshExpiresInSeconds: config.refreshTokenTtlSeconds
    };
  }

  async getSessionContext(sessionId) {
    const session = await this.sessionRepository.findById(sessionId);
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new AppError("invalid session", 401, "INVALID_SESSION");
    }

    const user = await this.userRepository.findById(session.userId);
    if (!user) {
      throw new AppError("user not found", 404, "USER_NOT_FOUND");
    }

    return {
      csrfToken: session.csrfToken,
      user: this.sanitizeUser(user, user.permissions.includes(permissions.piiView))
    };
  }

  async logout(sessionId) {
    await this.sessionRepository.revoke(sessionId);
  }

  async adminResetPassword({ actor, targetUserId, newPassword, reason }) {
    if (!actor.permissions.includes(permissions.userManage)) {
      throw new AppError("insufficient permissions", 403, "FORBIDDEN");
    }

    enforcePasswordPolicy(newPassword);

    const target = await this.userRepository.findById(targetUserId);
    if (!target) {
      throw new AppError("user not found", 404, "USER_NOT_FOUND");
    }

    await this.userRepository.update(target.id, {
      passwordHash: await hashSecret(newPassword),
      failedLoginAttempts: 0,
      lockedUntil: null
    });

    await this.auditService.logAction({
      actorUserId: actor.id,
      action: "update",
      entityType: "user",
      entityId: target.id,
      reason: reason || "administrator password reset",
      before: { passwordHash: "***" },
      after: { passwordHash: "***" }
    });
  }

  async getSecurityQuestions(username) {
    const normalizedUsername = User.normalizeUsername(username);
    const user = await this.userRepository.findByUsername(normalizedUsername);
    if (!user) {
      throw new AppError("user not found", 404, "USER_NOT_FOUND");
    }
    return (user.securityQuestions || []).map((entry) => ({
      question: entry.question
    }));
  }

  async recoverPasswordWithQuestion({ username, question, answer, newPassword }) {
    const normalizedUsername = User.normalizeUsername(username);
    const user = await this.userRepository.findByUsername(normalizedUsername);
    if (!user) {
      throw new AppError("user not found", 404, "USER_NOT_FOUND");
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError("account is temporarily locked", 423, "ACCOUNT_LOCKED");
    }

    const questionEntry = (user.securityQuestions || []).find(
      (entry) => entry.question.trim().toLowerCase() === question.trim().toLowerCase()
    );

    if (!questionEntry) {
      await this.incrementRecoveryFailure(user);
      throw new AppError("security question mismatch", 401, "SECURITY_QUESTION_MISMATCH");
    }

    const answerValid = await verifySecret(answer.trim().toLowerCase(), questionEntry.answerHash);
    if (!answerValid) {
      await this.incrementRecoveryFailure(user);
      throw new AppError("security answer mismatch", 401, "SECURITY_ANSWER_MISMATCH");
    }

    enforcePasswordPolicy(newPassword);

    await this.userRepository.update(user.id, {
      passwordHash: await hashSecret(newPassword),
      failedLoginAttempts: 0,
      lockedUntil: null
    });

    await this.auditService.logAction({
      actorUserId: user.id,
      action: "update",
      entityType: "user",
      entityId: user.id,
      reason: "security question recovery",
      before: { passwordHash: "***" },
      after: { passwordHash: "***" }
    });
  }

  async incrementRecoveryFailure(user) {
    const nextAttempts = (user.failedLoginAttempts || 0) + 1;
    const lockUntil =
      nextAttempts >= config.failedLoginLimit
        ? new Date(Date.now() + config.accountLockMinutes * 60 * 1000)
        : null;

    await this.userRepository.update(user.id, {
      failedLoginAttempts: nextAttempts,
      lockedUntil: lockUntil
    });

    await this.auditService.logAction({
      actorUserId: user.id,
      action: "update",
      entityType: "user",
      entityId: user.id,
      reason: `failed recovery attempt (${nextAttempts}/${config.failedLoginLimit})`,
      before: null,
      after: { failedLoginAttempts: nextAttempts, locked: Boolean(lockUntil) }
    });
  }
}
