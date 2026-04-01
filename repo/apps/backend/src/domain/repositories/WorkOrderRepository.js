export class WorkOrderRepository {
  async findAll() {
    throw new Error("findAll not implemented");
  }

  async findByRole(_role) {
    throw new Error("findByRole not implemented");
  }

  async create(_workOrder) {
    throw new Error("create not implemented");
  }

  async updateStatus(_id, _status) {
    throw new Error("updateStatus not implemented");
  }

  async delete(_id) {
    throw new Error("delete not implemented");
  }

  async upsertMany(_workOrders) {
    throw new Error("upsertMany not implemented");
  }
}
