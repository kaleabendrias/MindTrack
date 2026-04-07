export class SessionRepository {
  async create(_payload) {
    throw new Error("create not implemented");
  }

  async findById(_id) {
    throw new Error("findById not implemented");
  }

  async update(_id, _payload) {
    throw new Error("update not implemented");
  }

  async revoke(_id) {
    throw new Error("revoke not implemented");
  }

  async recordNonce(_id, _nonce, _ttlMs) {
    throw new Error("recordNonce not implemented");
  }
}
