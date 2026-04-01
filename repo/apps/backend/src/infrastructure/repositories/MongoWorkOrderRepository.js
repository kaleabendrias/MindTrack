import { WorkOrder } from "../../domain/models/WorkOrder.js";
import { WorkOrderRepository } from "../../domain/repositories/WorkOrderRepository.js";
import { WorkOrderModel } from "../persistence/models/WorkOrderModel.js";

function mapDocToDomain(doc) {
  return new WorkOrder({
    id: doc._id,
    title: doc.title,
    description: doc.description,
    status: doc.status,
    assignedRole: doc.assignedRole,
    createdAt: doc.createdAt.toISOString()
  });
}

export class MongoWorkOrderRepository extends WorkOrderRepository {
  async findById(id) {
    const doc = await WorkOrderModel.findById(id).lean();
    if (!doc) {
      return null;
    }
    return mapDocToDomain(doc);
  }

  async findAll() {
    const docs = await WorkOrderModel.find().sort({ createdAt: -1 }).lean();
    return docs.map((doc) => mapDocToDomain(doc));
  }

  async findByRole(role) {
    const docs = await WorkOrderModel.find({ assignedRole: role })
      .sort({ createdAt: -1 })
      .lean();
    return docs.map((doc) => mapDocToDomain(doc));
  }

  async create(workOrder) {
    const created = await WorkOrderModel.create({
      _id: workOrder.id,
      title: workOrder.title,
      description: workOrder.description,
      status: workOrder.status,
      assignedRole: workOrder.assignedRole,
      createdAt: new Date(workOrder.createdAt)
    });
    return mapDocToDomain(created.toObject());
  }

  async updateStatus(id, status) {
    const updated = await WorkOrderModel.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).lean();

    if (!updated) {
      return null;
    }

    return mapDocToDomain(updated);
  }

  async delete(id) {
    const deleted = await WorkOrderModel.findByIdAndDelete(id).lean();
    if (!deleted) {
      return null;
    }
    return mapDocToDomain(deleted);
  }

  async upsertMany(workOrders) {
    if (!workOrders.length) {
      return;
    }

    const operations = workOrders.map((workOrder) => ({
      replaceOne: {
        filter: { _id: workOrder.id },
        replacement: {
          _id: workOrder.id,
          title: workOrder.title,
          description: workOrder.description,
          status: workOrder.status,
          assignedRole: workOrder.assignedRole,
          createdAt: new Date(workOrder.createdAt)
        },
        upsert: true
      }
    }));

    await WorkOrderModel.bulkWrite(operations, { ordered: true });
  }
}
