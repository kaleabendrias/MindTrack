export class MindTrackController {
  constructor(mindTrackService) {
    this.mindTrackService = mindTrackService;
  }

  listClients = async (_req, res) => {
    const data = await this.mindTrackService.listClients(_req.user);
    res.status(200).json({ data });
  };

  createClient = async (req, res) => {
    const data = await this.mindTrackService.createClient({
      actor: req.user,
      payload: req.body
    });
    res.status(201).json({ data });
  };

  mergeClients = async (req, res) => {
    const data = await this.mindTrackService.mergeClients({
      actor: req.user,
      payload: {
        ...req.body,
        idempotencyKey: req.get("x-idempotency-key")
      }
    });
    res.status(data.statusCode).json({ data: data.body, idempotentReplay: data.idempotentReplay });
  };

  timeline = async (req, res) => {
    const data = await this.mindTrackService.listTimeline({ actor: req.user, clientId: req.params.clientId });
    res.status(200).json({ data });
  };

  createEntry = async (req, res) => {
    const data = await this.mindTrackService.createEntry({
      actor: req.user,
      payload: req.body
    });
    res.status(201).json({ data });
  };

  signEntry = async (req, res) => {
    const data = await this.mindTrackService.signEntry({
      actor: req.user,
      entryId: req.params.entryId,
      expectedVersion: req.body.expectedVersion,
      idempotencyKey: req.get("x-idempotency-key"),
      reason: req.body.reason
    });
    res.status(data.statusCode).json({ data: data.body, idempotentReplay: data.idempotentReplay });
  };

  amendEntry = async (req, res) => {
    const data = await this.mindTrackService.amendEntry({
      actor: req.user,
      entryId: req.params.entryId,
      expectedVersion: req.body.expectedVersion,
      body: req.body.body,
      idempotencyKey: req.get("x-idempotency-key"),
      reason: req.body.reason
    });
    res.status(data.statusCode).json({ data: data.body, idempotentReplay: data.idempotentReplay });
  };

  restoreEntry = async (req, res) => {
    const data = await this.mindTrackService.restoreEntry({
      actor: req.user,
      entryId: req.params.entryId,
      expectedVersion: req.body.expectedVersion,
      idempotencyKey: req.get("x-idempotency-key"),
      reason: req.body.reason
    });
    res.status(data.statusCode).json({ data: data.body, idempotentReplay: data.idempotentReplay });
  };

  search = async (req, res) => {
    const data = await this.mindTrackService.searchEntries({
      actor: req.user,
      query: req.query.q,
      from: req.query.from,
      to: req.query.to,
      entryType: req.query.channel,
      tags: req.query.tags ? String(req.query.tags).split(",") : [],
      sort: req.query.sort
    });
    res.status(200).json({ data });
  };

  trendingTerms = async (_req, res) => {
    const data = await this.mindTrackService.trendingTerms(_req.user);
    res.status(200).json({ data });
  };

  nearbyFacilities = async (req, res) => {
    const data = await this.mindTrackService.nearbyFacilities({
      actor: req.user,
      clientId: req.query.clientId,
      radiusMiles: req.query.radiusMiles
    });
    res.status(200).json({ data });
  };

  selfContext = async (req, res) => {
    const data = await this.mindTrackService.selfContext(req.user);
    res.status(200).json({ data });
  };

  updateClient = async (req, res) => {
    const data = await this.mindTrackService.updateClient({
      actor: req.user,
      clientId: req.params.clientId,
      payload: req.body
    });
    res.status(200).json({ data });
  };

  updateGovernance = async (req, res) => {
    const data = await this.mindTrackService.updateGovernanceControls({
      actor: req.user,
      clientId: req.params.clientId,
      payload: req.body
    });
    res.status(200).json({ data });
  };
}
