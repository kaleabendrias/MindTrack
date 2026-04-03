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
      reason: req.body.reason
    });
    res.status(200).json({ data });
  };

  runBackupNow = async (req, res) => {
    const data = await this.systemService.runBackupNow({
      actor: req.user,
      reason: req.body?.reason || "manual backup execution"
    });
    res.status(200).json({ data });
  };

  securityFlags = async (req, res) => {
    const data = await this.systemService.securityFlags(req.user.id);
    res.status(200).json({ data });
  };

  mySecurityFlags = async (req, res) => {
    const data = await this.systemService.securityFlags(req.user.id);
    res.status(200).json({ data });
  };

  auditImmutabilityCheck = async (_req, res) => {
    const data = await this.systemService.auditImmutabilityCheck();
    res.status(200).json({ data });
  };
}
