import { permissions } from "../../../domain/models/User.js";

export class UserController {
  constructor(authService, userRepository) {
    this.authService = authService;
    this.userRepository = userRepository;
  }

  list = async (req, res) => {
    const users = await this.userRepository.list();
    const canViewPii = req.user.permissions.includes(permissions.piiView);
    const data = users.map((user) => this.authService.sanitizeUser(user, canViewPii));
    res.status(200).json({ data });
  };

  create = async (req, res) => {
    const data = await this.authService.registerByAdmin({
      actor: req.user,
      ...req.body
    });
    res.status(201).json({ data });
  };

  adminResetPassword = async (req, res) => {
    await this.authService.adminResetPassword({
      actor: req.user,
      targetUserId: req.params.id,
      newPassword: req.body.newPassword,
      reason: req.body.reason
    });
    res.status(200).json({ data: { success: true } });
  };
}
