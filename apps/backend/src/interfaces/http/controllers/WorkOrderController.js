export class WorkOrderController {
  constructor(workOrderService) {
    this.workOrderService = workOrderService;
  }

  list = async (req, res) => {
    const data = await this.workOrderService.list(req.query.role);
    res.status(200).json({ data });
  };

  create = async (req, res) => {
    const data = await this.workOrderService.create(
      req.body,
      req.user,
      req.body.reason || "work order creation"
    );
    res.status(201).json({ data });
  };

  updateStatus = async (req, res) => {
    const data = await this.workOrderService.updateStatus(
      req.params.id,
      req.body.status,
      req.user,
      req.body.reason || "work order status update"
    );
    res.status(200).json({ data });
  };

  delete = async (req, res) => {
    const data = await this.workOrderService.delete(
      req.params.id,
      req.user,
      req.body.reason
    );
    res.status(200).json({ data });
  };
}
