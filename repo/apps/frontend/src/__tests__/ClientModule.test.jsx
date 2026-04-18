import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { ClientModule } from '../modules/client/ClientModule.jsx';

// ---------------------------------------------------------------------------
// Mock API modules
// ---------------------------------------------------------------------------

vi.mock('../api/mindTrackApi.js', () => ({
  createEntry: vi.fn(),
  fetchNearbyFacilities: vi.fn(),
  downloadAttachment: vi.fn()
}));

vi.mock('../shared/ui/TimelineItem.jsx', () => ({
  TimelineItem: ({ entry }) => <div data-testid={`timeline-entry-${entry._id}`}>{entry.title}</div>
}));

vi.mock('../shared/ui/CustomFieldsRenderer.jsx', () => ({
  CustomFieldsRenderer: () => null
}));

import { createEntry, fetchNearbyFacilities } from '../api/mindTrackApi.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_CLIENT = {
  _id: 'cli001',
  name: 'Test Patient',
  phone: '555-1234',
  address: '123 Main St',
  customFields: {}
};

const MOCK_TIMELINE = [
  { _id: 'e1', entryType: 'assessment', title: 'First assessment', body: 'Body', status: 'signed' },
  { _id: 'e2', entryType: 'counseling_note', title: 'Note should be hidden', body: 'Hidden', status: 'signed' },
  { _id: 'e3', entryType: 'follow_up', title: 'Follow-up plan', body: 'Plan', status: 'draft' }
];

const MOCK_SELF_CONTEXT = {
  client: MOCK_CLIENT,
  upcomingFollowUp: null,
  timeline: MOCK_TIMELINE
};

const DEFAULT_USER = { role: 'client', permissions: [] };
const DEFAULT_PROFILE_FIELDS = { phone: true, address: true, piiPolicyVisible: true };

function renderClient({ selfContext = MOCK_SELF_CONTEXT, onRefresh = vi.fn(), currentUser = DEFAULT_USER, profileFields = DEFAULT_PROFILE_FIELDS } = {}) {
  return render(
    <ClientModule
      selfContext={selfContext}
      onRefresh={onRefresh}
      profileFields={profileFields}
      currentUser={currentUser}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('ClientModule — loading state', () => {
  test('shows loading message when selfContext is null', () => {
    renderClient({ selfContext: null });
    expect(screen.getByText('Loading your care context...')).toBeTruthy();
  });

  test('shows loading message when selfContext is undefined', () => {
    render(
      <ClientModule
        onRefresh={vi.fn()}
        profileFields={DEFAULT_PROFILE_FIELDS}
        currentUser={DEFAULT_USER}
      />
    );
    expect(screen.getByText('Loading your care context...')).toBeTruthy();
  });

  test('does not render care plan heading when selfContext is null', () => {
    renderClient({ selfContext: null });
    expect(screen.queryByText('My Care Plan')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Client info rendering
// ---------------------------------------------------------------------------

describe('ClientModule — client info', () => {
  test('renders client name', () => {
    renderClient();
    expect(screen.getByText(/Test Patient/)).toBeTruthy();
  });

  test('renders My Care Plan heading', () => {
    renderClient();
    expect(screen.getByRole('heading', { name: 'My Care Plan' })).toBeTruthy();
  });

  test('renders Complete Self-Assessment heading', () => {
    renderClient();
    expect(screen.getByRole('heading', { name: 'Complete Self-Assessment' })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Timeline filtering
// ---------------------------------------------------------------------------

describe('ClientModule — timeline filtering', () => {
  test('renders assessment entries in timeline', () => {
    renderClient();
    expect(screen.getByTestId('timeline-entry-e1')).toBeTruthy();
  });

  test('renders follow_up entries in timeline', () => {
    renderClient();
    expect(screen.getByTestId('timeline-entry-e3')).toBeTruthy();
  });

  test('hides counseling_note entries from timeline', () => {
    renderClient();
    expect(screen.queryByTestId('timeline-entry-e2')).toBeNull();
  });

  test('shows empty message when filtered timeline is empty', () => {
    const ctx = { ...MOCK_SELF_CONTEXT, timeline: [{ _id: 'n1', entryType: 'counseling_note', title: 'Note', body: 'b', status: 'signed' }] };
    renderClient({ selfContext: ctx });
    expect(screen.getByText('No timeline entries yet.')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Upcoming follow-up
// ---------------------------------------------------------------------------

describe('ClientModule — upcoming follow-up', () => {
  test('shows no-follow-up message when upcomingFollowUp is null', () => {
    renderClient({ selfContext: { ...MOCK_SELF_CONTEXT, upcomingFollowUp: null } });
    expect(screen.getByText('No upcoming follow-up is currently scheduled.')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Self-assessment form validation
// ---------------------------------------------------------------------------

describe('ClientModule — self-assessment form validation', () => {
  test('shows title validation error when submitting empty title', async () => {
    renderClient();
    fireEvent.click(screen.getByRole('button', { name: 'Submit Assessment' }));
    await waitFor(() => {
      expect(screen.getByText('Assessment title is required.')).toBeTruthy();
    });
  });

  test('shows body validation error when submitting empty body', async () => {
    renderClient();
    fireEvent.change(screen.getByLabelText('Assessment title'), { target: { value: 'My title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Assessment' }));
    await waitFor(() => {
      expect(screen.getByText('Assessment response is required.')).toBeTruthy();
    });
  });

  test('does not call createEntry when validation fails', async () => {
    renderClient();
    fireEvent.click(screen.getByRole('button', { name: 'Submit Assessment' }));
    await waitFor(() => {
      expect(screen.getByText('Assessment title is required.')).toBeTruthy();
    });
    expect(createEntry).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Self-assessment form submission
// ---------------------------------------------------------------------------

describe('ClientModule — self-assessment submission', () => {
  test('calls createEntry with correct fields on valid submission', async () => {
    createEntry.mockResolvedValue({});
    renderClient();
    fireEvent.change(screen.getByLabelText('Assessment title'), { target: { value: 'Weekly check-in' } });
    fireEvent.change(screen.getByLabelText('Response'), { target: { value: 'Feeling better.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Assessment' }));
    await waitFor(() => {
      expect(createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'cli001',
          entryType: 'assessment',
          title: 'Weekly check-in',
          body: 'Feeling better.'
        })
      );
    });
  });

  test('shows success message after successful submission', async () => {
    createEntry.mockResolvedValue({});
    renderClient();
    fireEvent.change(screen.getByLabelText('Assessment title'), { target: { value: 'Title' } });
    fireEvent.change(screen.getByLabelText('Response'), { target: { value: 'Body text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Assessment' }));
    await waitFor(() => {
      expect(screen.getByText('Assessment saved successfully.')).toBeTruthy();
    });
  });

  test('clears form fields after successful submission', async () => {
    createEntry.mockResolvedValue({});
    renderClient();
    const titleInput = screen.getByLabelText('Assessment title');
    fireEvent.change(titleInput, { target: { value: 'My Assessment' } });
    fireEvent.change(screen.getByLabelText('Response'), { target: { value: 'My response' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Assessment' }));
    await waitFor(() => {
      expect(screen.getByText('Assessment saved successfully.')).toBeTruthy();
    });
    expect(titleInput.value).toBe('');
  });

  test('shows error message when createEntry fails', async () => {
    createEntry.mockRejectedValue(new Error('Network error'));
    renderClient();
    fireEvent.change(screen.getByLabelText('Assessment title'), { target: { value: 'Title' } });
    fireEvent.change(screen.getByLabelText('Response'), { target: { value: 'Body' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Assessment' }));
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeTruthy();
    });
  });

  test('calls onRefresh after successful submission', async () => {
    createEntry.mockResolvedValue({});
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderClient({ onRefresh });
    fireEvent.change(screen.getByLabelText('Assessment title'), { target: { value: 'Title' } });
    fireEvent.change(screen.getByLabelText('Response'), { target: { value: 'Body' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Assessment' }));
    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Nearby facilities
// ---------------------------------------------------------------------------

describe('ClientModule — nearby facilities', () => {
  test('renders Find nearby facilities button', () => {
    renderClient();
    expect(screen.getByRole('button', { name: 'Find nearby facilities' })).toBeTruthy();
  });

  test('calls fetchNearbyFacilities when button is clicked', async () => {
    fetchNearbyFacilities.mockResolvedValue([]);
    renderClient();
    fireEvent.click(screen.getByRole('button', { name: 'Find nearby facilities' }));
    await waitFor(() => {
      expect(fetchNearbyFacilities).toHaveBeenCalledWith('cli001', expect.any(Number));
    });
  });

  test('shows empty state message when no facilities found', async () => {
    fetchNearbyFacilities.mockResolvedValue([]);
    renderClient();
    fireEvent.click(screen.getByRole('button', { name: 'Find nearby facilities' }));
    await waitFor(() => {
      expect(screen.getByText(/No facilities found within/)).toBeTruthy();
    });
  });

  test('renders facility list when facilities are returned', async () => {
    fetchNearbyFacilities.mockResolvedValue([
      { _id: 'f1', name: 'City Mental Health', distanceMiles: 3.2 },
      { _id: 'f2', name: 'Wellness Center', distanceMiles: 7.8 }
    ]);
    renderClient();
    fireEvent.click(screen.getByRole('button', { name: 'Find nearby facilities' }));
    await waitFor(() => {
      expect(screen.getByText(/City Mental Health/)).toBeTruthy();
      expect(screen.getByText(/Wellness Center/)).toBeTruthy();
    });
  });

  test('shows error message when fetchNearbyFacilities fails', async () => {
    fetchNearbyFacilities.mockRejectedValue(new Error('Service unavailable'));
    renderClient();
    fireEvent.click(screen.getByRole('button', { name: 'Find nearby facilities' }));
    await waitFor(() => {
      expect(screen.getByText('Service unavailable')).toBeTruthy();
    });
  });
});
