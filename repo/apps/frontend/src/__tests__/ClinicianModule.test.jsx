import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { ClinicianModule } from '../modules/clinician/ClinicianModule.jsx';

// ---------------------------------------------------------------------------
// Mock API modules
// ---------------------------------------------------------------------------

vi.mock('../api/mindTrackApi.js', () => ({
  amendEntry: vi.fn(),
  createClient: vi.fn(),
  createEntry: vi.fn(),
  deleteEntry: vi.fn(),
  fetchTimeline: vi.fn(),
  restoreEntry: vi.fn(),
  signEntry: vi.fn(),
  updateClientProfile: vi.fn()
}));

vi.mock('../shared/ui/AttachmentUploader.jsx', () => ({
  AttachmentUploader: ({ onChange }) => (
    <div data-testid="attachment-uploader">
      <button type="button" onClick={() => onChange([])}>Clear attachments</button>
    </div>
  )
}));

vi.mock('../shared/ui/CustomFieldsRenderer.jsx', () => ({
  CustomFieldsRenderer: () => null
}));

vi.mock('../shared/ui/TimelineItem.jsx', () => ({
  TimelineItem: ({ entry }) => <div data-testid={`entry-${entry._id}`}>{entry.title}</div>
}));

import { createEntry, fetchTimeline, createClient } from '../api/mindTrackApi.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_CLIENTS = [
  { _id: 'cli001', name: 'Alice Smith' },
  { _id: 'cli002', name: 'Bob Jones' }
];

const MOCK_TIMELINE_DATA = [
  { _id: 'e1', entryType: 'assessment', title: 'Initial Assessment', body: 'Body', status: 'signed' },
  { _id: 'e2', entryType: 'counseling_note', title: 'Session note', body: 'Note', status: 'draft' }
];

const DEFAULT_USER = { role: 'clinician', username: 'dr_smith', permissions: [] };

function renderClinician({ clients = MOCK_CLIENTS, profileFields = {}, onClientCreated = vi.fn(), currentUser = DEFAULT_USER } = {}) {
  return render(
    <ClinicianModule
      clients={clients}
      profileFields={profileFields}
      onClientCreated={onClientCreated}
      currentUser={currentUser}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Initial rendering
// ---------------------------------------------------------------------------

describe('ClinicianModule — initial rendering', () => {
  test('renders entry type select', () => {
    renderClinician();
    expect(screen.getAllByRole('combobox').length >= 1).toBeTruthy();
  });

  test('renders Save entry button', () => {
    renderClinician();
    expect(screen.getByRole('button', { name: 'Save entry' })).toBeTruthy();
  });

  test('renders client select when clients list is provided', () => {
    renderClinician();
    expect(screen.getByLabelText('Client')).toBeTruthy();
  });

  test('renders attachment uploader', () => {
    renderClinician();
    expect(screen.getByTestId('attachment-uploader')).toBeTruthy();
  });

  test('renders Register new client toggle button', () => {
    renderClinician();
    expect(screen.getByRole('button', { name: /Register new client/i })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Form validation
// ---------------------------------------------------------------------------

describe('ClinicianModule — form validation', () => {
  test('shows clientId error when submitting without selecting a client', async () => {
    renderClinician();
    fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
    await waitFor(() => {
      expect(screen.getByText('Client is required.')).toBeTruthy();
    });
  });

  test('shows title error when title is empty', async () => {
    renderClinician();
    fireEvent.change(screen.getByLabelText('Client'), { target: { value: 'cli001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
    await waitFor(() => {
      expect(screen.getByText('Title is required.')).toBeTruthy();
    });
  });

  test('shows body error when body is empty', async () => {
    fetchTimeline.mockResolvedValue([]);
    renderClinician();
    fireEvent.change(screen.getByLabelText('Client'), { target: { value: 'cli001' } });
    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'My Title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
    await waitFor(() => {
      expect(screen.getByText('Body is required.')).toBeTruthy();
    });
  });

  test('does not call createEntry when validation errors exist', async () => {
    renderClinician();
    fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
    await waitFor(() => {
      expect(screen.getByText('Client is required.')).toBeTruthy();
    });
    expect(createEntry).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Timeline loading
// ---------------------------------------------------------------------------

describe('ClinicianModule — timeline', () => {
  test('loads timeline when a client is selected', async () => {
    fetchTimeline.mockResolvedValue(MOCK_TIMELINE_DATA);
    renderClinician();
    fireEvent.change(screen.getByLabelText('Client'), { target: { value: 'cli001' } });
    await waitFor(() => {
      expect(fetchTimeline).toHaveBeenCalledWith('cli001');
    });
  });

  test('renders timeline entries after loading', async () => {
    fetchTimeline.mockResolvedValue(MOCK_TIMELINE_DATA);
    renderClinician();
    fireEvent.change(screen.getByLabelText('Client'), { target: { value: 'cli001' } });
    await waitFor(() => {
      expect(screen.getByText('Initial Assessment')).toBeTruthy();
    });
  });

  test('shows empty message when timeline is empty', async () => {
    fetchTimeline.mockResolvedValue([]);
    renderClinician();
    fireEvent.change(screen.getByLabelText('Client'), { target: { value: 'cli001' } });
    await waitFor(() => {
      expect(screen.getByText('No timeline entries for this client yet.')).toBeTruthy();
    });
  });

  test('shows error message when fetchTimeline fails', async () => {
    fetchTimeline.mockRejectedValue(new Error('Timeline load error'));
    renderClinician();
    fireEvent.change(screen.getByLabelText('Client'), { target: { value: 'cli001' } });
    await waitFor(() => {
      expect(screen.getByText('Timeline load error')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Add new client toggle
// ---------------------------------------------------------------------------

describe('ClinicianModule — new client form', () => {
  test('shows new client form when Register new client is clicked', () => {
    renderClinician();
    fireEvent.click(screen.getByRole('button', { name: /Register new client/i }));
    expect(screen.getByLabelText(/Name/i)).toBeTruthy();
  });

  test('hides form when toggled off', () => {
    renderClinician();
    fireEvent.click(screen.getByRole('button', { name: /Register new client/i }));
    expect(screen.getByLabelText(/Name/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Cancel new client/i }));
    expect(screen.queryByLabelText(/Name/i)).toBeNull();
  });
});
