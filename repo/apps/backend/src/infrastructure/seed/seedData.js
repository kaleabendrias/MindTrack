export function getSeedUsers() {
  return [
    {
      id: "0000000000000000000000a1",
      username: "administrator",
      role: "administrator",
      mindTrackClientId: null,
      permissions: ["PII_VIEW", "USER_MANAGE", "AUDIT_READ"],
      password: process.env.SEED_ADMIN_PASSWORD || "RotateMe_Admin_2026x1",
      mustRotatePassword: true,
      phone: "+1-555-0100",
      address: "100 Control Center Ave",
      securityQuestions: [
        {
          question: "What is your primary facility code?",
          answer: "alpha-001"
        }
      ]
    },
    {
      id: "0000000000000000000000b1",
      username: "clinician",
      role: "clinician",
      mindTrackClientId: null,
      permissions: [],
      password: process.env.SEED_CLINICIAN_PASSWORD || "RotateMe_Clinician_2026x1",
      mustRotatePassword: true,
      phone: "+1-555-0199",
      address: "200 Field Station Road",
      securityQuestions: [
        {
          question: "What is your assigned station name?",
          answer: "station-7"
        }
      ]
    },
    {
      id: "0000000000000000000000c1",
      username: "client",
      role: "client",
      mindTrackClientId: "cli001",
      permissions: [],
      password: process.env.SEED_CLIENT_PASSWORD || "RotateMe_Client_2026x1",
      mustRotatePassword: true,
      phone: "+1-555-0155",
      address: "300 Wellness Way",
      securityQuestions: [
        {
          question: "What is your onboarding month?",
          answer: "january"
        }
      ]
    }
  ];
}

export const seedFacilities = [
  {
    _id: "fac001",
    name: "Downtown MindTrack Center",
    address: "10 Main St, New York, NY 10001",
    zip: "10001",
    coordinate: { lat: 40.7521, lon: -73.9941 }
  },
  {
    _id: "fac002",
    name: "Harbor Behavioral Clinic",
    address: "200 Atlantic Ave, Boston, MA 02108",
    zip: "02108",
    coordinate: { lat: 42.3578, lon: -71.0602 }
  },
  {
    _id: "fac003",
    name: "Pacific Wellness Hub",
    address: "500 Market St, San Francisco, CA 94103",
    zip: "94103",
    coordinate: { lat: 37.7749, lon: -122.4194 }
  }
];

export const seedMindTrackClients = [
  {
    _id: "cli001",
    name: "Jordan Miles",
    dob: "1990-05-14",
    phone: "+1-212-555-0144",
    phoneLast4: "0144",
    address: "101 Hudson St, New York, NY 10001",
    tags: ["anxiety", "sleep"],
    channel: "in_person",
    coordinate: { lat: 40.7506, lon: -73.9972, source: "zip_centroid" },
    primaryClinicianId: "0000000000000000000000b1",
    mergedIntoClientId: null,
    mergedAt: null,
    createdBy: "0000000000000000000000b1"
  },
  {
    _id: "cli002",
    name: "Avery Chen",
    dob: "1988-09-02",
    phone: "+1-617-555-0120",
    phoneLast4: "0120",
    address: "60 Beacon St, Boston, MA 02108",
    tags: ["follow_up", "recovery"],
    channel: "telehealth",
    coordinate: { lat: 42.3572, lon: -71.0637, source: "zip_centroid" },
    primaryClinicianId: "0000000000000000000000b1",
    mergedIntoClientId: null,
    mergedAt: null,
    createdBy: "0000000000000000000000b1"
  }
];

export const seedMindTrackEntries = [
  {
    _id: "ent001",
    clientId: "cli001",
    clinicianId: "0000000000000000000000b1",
    entryType: "assessment",
    title: "Initial intake assessment",
    body: "Client reports elevated stress and sleep disruption over six weeks.",
    tags: ["intake", "sleep"],
    channel: "in_person",
    status: "signed",
    occurredAt: "2026-03-25T09:30:00.000Z",
    attachments: [],
    amendedFromEntryId: null,
    deletedAt: null,
    deletedReason: null,
    version: 1
  },
  {
    _id: "ent002",
    clientId: "cli001",
    clinicianId: "0000000000000000000000b1",
    entryType: "counseling_note",
    title: "Session note - breathing protocol",
    body: "Reviewed grounding techniques and set daily practice goal.",
    tags: ["counseling", "coping"],
    channel: "telehealth",
    status: "draft",
    occurredAt: "2026-03-27T15:00:00.000Z",
    attachments: [],
    amendedFromEntryId: null,
    deletedAt: null,
    deletedReason: null,
    version: 1
  },
  {
    _id: "ent003",
    clientId: "cli002",
    clinicianId: "0000000000000000000000b1",
    entryType: "follow_up",
    title: "Follow-up on medication adherence",
    body: "Client reports full adherence and reduced side effects.",
    tags: ["follow_up", "medication"],
    channel: "phone",
    status: "amended",
    occurredAt: "2026-03-28T11:15:00.000Z",
    attachments: [],
    amendedFromEntryId: "ent000",
    deletedAt: null,
    deletedReason: null,
    version: 2
  },
  {
    _id: "ent004",
    clientId: "cli001",
    clinicianId: "0000000000000000000000b1",
    entryType: "follow_up",
    title: "Next follow-up plan",
    body: "Client scheduled for check-in next week with sleep diary review.",
    tags: ["follow_up", "plan"],
    channel: "telehealth",
    status: "signed",
    occurredAt: "2026-04-04T13:00:00.000Z",
    attachments: [],
    amendedFromEntryId: null,
    deletedAt: null,
    deletedReason: null,
    version: 1
  }
];

export const seedMindTrackTemplates = [
  {
    _id: "tpl001",
    title: "Initial anxiety assessment template",
    body: "Assess presenting symptoms, triggers, sleep quality, and coping supports.",
    tags: ["assessment", "anxiety"],
    entryType: "assessment"
  },
  {
    _id: "tpl002",
    title: "Counseling note CBT follow-through",
    body: "Review cognitive reframing progress, barriers, and next session homework.",
    tags: ["counseling", "cbt"],
    entryType: "counseling_note"
  },
  {
    _id: "tpl003",
    title: "Follow-up medication adherence template",
    body: "Check adherence, side effects, safety concerns, and next check-in date.",
    tags: ["follow_up", "medication"],
    entryType: "follow_up"
  }
];
