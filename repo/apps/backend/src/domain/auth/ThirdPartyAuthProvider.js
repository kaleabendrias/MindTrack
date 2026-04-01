export class ThirdPartyAuthProvider {
  getProviderName() {
    throw new Error("getProviderName not implemented");
  }

  async authenticate(_payload) {
    throw new Error("authenticate not implemented");
  }
}
