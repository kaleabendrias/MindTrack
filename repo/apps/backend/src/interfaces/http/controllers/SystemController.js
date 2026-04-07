export class SystemController {
  constructor(systemService) {
    this.systemService = systemService;
  }

  offlinePolicy = async (_req, res) => {
    const data = this.systemService.getOfflinePolicy();
    res.status(200).json({ data });
  };

  backupStatus = async (_req, res) => {
    const data = await this.systemService.getBackupStatus();
    res.status(200).json({ data });
  };

  profileFields = async (_req, res) => {
    const data = await this.systemService.getProfileFields();
    res.status(200).json({ data });
  };

  updateProfileFields = async (req, res) => {
    const data = await this.systemService.updateProfileFields({
      actor: req.user,
      profileFields: req.body.profileFields,
      reason: req.body.reason
    });
    res.status(200).json({ data });
  };

  addCustomProfileField = async (req, res) => {
    const data = await this.systemService.addCustomProfileField({
      actor: req.user,
      field: req.body.field,
      reason: req.body.reason
    });
    res.status(201).json({ data });
  };

  updateCustomProfileField = async (req, res) => {
    const data = await this.systemService.updateCustomProfileField({
      actor: req.user,
      key: req.params.key,
      updates: req.body.updates,
      reason: req.body.reason
    });
    res.status(200).json({ data });
  };

  deleteCustomProfileField = async (req, res) => {
    const data = await this.systemService.deleteCustomProfileField({
      actor: req.user,
      key: req.params.key,
      reason: req.body.reason
    });
    res.status(200).json({ data });
  };

  listBackupFiles = async (_req, res) => {
    const data = await this.systemService.listBackupFiles();
    res.status(200).json({ data });
  };

  restoreFromBackup = async (req, res) => {
    const data = await this.systemService.restoreFromBackup({
      actor: req.user,
      filename: req.body.filename,
      reason: req.body.reason,
      idempotencyKey: req.get("x-idempotency-key")
    });
    res.status(data.statusCode || 200).json({ data: data.body || data, idempotentReplay: data.idempotentReplay });
  };

  runBackupNow = async (req, res) => {
    const data = await this.systemService.runBackupNow({
      actor: req.user,
      reason: req.body?.reason || "manual backup execution"
    });
    res.status(200).json({ data });
  };

  // Self-scoped: any authenticated user can fetch their own security flags.
  // Kept intentionally for the existing /my-security-flags route.
  mySecurityFlags = async (req, res) => {
    const data = await this.systemService.securityFlags(req.user.id);
    res.status(200).json({ data });
  };

  // Globally scoped admin view used for platform-wide anomaly monitoring.
  // Supports filtering by user, session, rule code, and timestamp window.
  // Backed by the auditRead permission via the route layer.
  securityFlags = async (req, res) => {
    const data = await this.systemService.listSecurityFlagsAdmin({
      userId: req.query.userId,
      sessionId: req.query.sessionId,
      ruleCode: req.query.ruleCode,
      from: req.query.from,
      to: req.query.to,
      limit: req.query.limit
    });
    res.status(200).json({
      data,
      filters: {
        userId: req.query.userId || null,
        sessionId: req.query.sessionId || null,
        ruleCode: req.query.ruleCode || null,
        from: req.query.from || null,
        to: req.query.to || null
      }
    });
  };

  auditImmutabilityCheck = async (_req, res) => {
    const data = await this.systemService.auditImmutabilityCheck();
    res.status(200).json({ data });
  };
}
