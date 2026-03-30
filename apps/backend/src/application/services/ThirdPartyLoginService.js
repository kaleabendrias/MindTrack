import { AppError } from "../../domain/errors/AppError.js";

export class ThirdPartyLoginService {
  constructor() {
    this.providers = [];
  }

  registerProvider(provider) {
    this.providers.push(provider);
  }

  async authenticate() {
    throw new AppError(
      "third-party login is disabled in offline mode; integrate provider adapters here when enabled",
      501,
      "THIRD_PARTY_LOGIN_DISABLED"
    );
  }
}
