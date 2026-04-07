import { clearSessionCookies, parseCookies, setSessionCookies } from "../httpCookies.js";

export class AuthController {
  constructor(authService, thirdPartyLoginService) {
    this.authService = authService;
    this.thirdPartyLoginService = thirdPartyLoginService;
  }

  login = async (req, res) => {
    const data = await this.authService.login({
      username: req.body.username,
      password: req.body.password,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || ""
    });

    setSessionCookies(res, {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken
    });

    res.status(200).json({
      data: {
        user: data.user,
        csrfToken: data.csrfToken,
        expiresInSeconds: data.expiresInSeconds,
        refreshExpiresInSeconds: data.refreshExpiresInSeconds
      }
    });
  };

  refresh = async (req, res) => {
    const cookies = parseCookies(req);
    const data = await this.authService.refreshTokens(
      req.body.refreshToken || cookies.mindtrack_refresh_token
    );
    setSessionCookies(res, {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken
    });
    res.status(200).json({
      data: {
        csrfToken: data.csrfToken,
        expiresInSeconds: data.expiresInSeconds,
        refreshExpiresInSeconds: data.refreshExpiresInSeconds
      }
    });
  };

  session = async (req, res) => {
    const data = await this.authService.getSessionContext(req.user.sessionId);
    res.status(200).json({ data });
  };

  logout = async (req, res) => {
    await this.authService.logout(req.user.sessionId);
    clearSessionCookies(res);
    res.status(200).json({ data: { success: true } });
  };

  securityQuestions = async (req, res) => {
    const data = await this.authService.getSecurityQuestions(req.query.username);
    res.status(200).json({ data });
  };

  recoverPassword = async (req, res) => {
    // The service returns a uniform `{ success: true }` payload regardless of
    // whether the username/question/answer matched, to prevent account
    // enumeration via differential responses or HTTP status codes.
    const data = await this.authService.recoverPasswordWithQuestion(req.body);
    res.status(200).json({ data });
  };

  thirdPartyLogin = async (_req, _res) => {
    await this.thirdPartyLoginService.authenticate();
  };

  rotatePassword = async (req, res) => {
    const data = await this.authService.rotatePassword({
      actor: req.user,
      currentPassword: req.body?.currentPassword,
      newPassword: req.body?.newPassword
    });
    res.status(200).json({ data });
  };
}
