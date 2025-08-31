// TenderCard component unit tests
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TenderCard } from '@/components/tenders/TenderCard';

// Mock Next.js navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockTender = {
  id: 'tender-1',
  title: 'IT Services Tender',
  description: 'Comprehensive IT services for government department with long description that should be truncated if too long to display properly in the card component',
  category: 'IT_SERVICES',
  status: 'SCRAPED' as const,
  deadline: '2024-12-31T23:59:59.000Z',
  estimatedValue: 100000,
  currency: 'USD',
  sourceUrl: 'https://example.com/tender/123',
  sourceReference: 'TND-2024-001',
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T10:00:00.000Z',
  assigneeId: null,
  assignee: null,
};

describe('TenderCard Component', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('renders tender information correctly', () => {
    render(<TenderCard tender={mockTender} />);
    
    expect(screen.getByText('IT Services Tender')).toBeInTheDocument();
    expect(screen.getByText('IT_SERVICES')).toBeInTheDocument();
    expect(screen.getByText('SCRAPED')).toBeInTheDocument();
    expect(screen.getByText('$100,000')).toBeInTheDocument();
    expect(screen.getByText('TND-2024-001')).toBeInTheDocument();
  });

  it('truncates long descriptions', () => {
    render(<TenderCard tender={mockTender} />);
    
    const description = screen.getByText(/Comprehensive IT services/);
    expect(description).toBeInTheDocument();
    // Should be truncated if description is too long
    expect(description.textContent?.length).toBeLessThanOrEqual(150);
  });

  it('formats deadline correctly', () => {
    render(<TenderCard tender={mockTender} />);
    
    // Should show formatted deadline
    expect(screen.getByText(/Dec 31, 2024/)).toBeInTheDocument();
  });

  it('shows different status badges with correct styling', () => {
    const { rerender } = render(<TenderCard tender={mockTender} />);
    
    let statusBadge = screen.getByText('SCRAPED');
    expect(statusBadge).toHaveClass('bg-blue-100 text-blue-800');

    rerender(<TenderCard tender={{ ...mockTender, status: 'VALIDATED' }} />);
    statusBadge = screen.getByText('VALIDATED');
    expect(statusBadge).toHaveClass('bg-green-100 text-green-800');

    rerender(<TenderCard tender={{ ...mockTender, status: 'ASSIGNED' }} />);
    statusBadge = screen.getByText('ASSIGNED');
    expect(statusBadge).toHaveClass('bg-yellow-100 text-yellow-800');

    rerender(<TenderCard tender={{ ...mockTender, status: 'SUBMITTED' }} />);
    statusBadge = screen.getByText('SUBMITTED');
    expect(statusBadge).toHaveClass('bg-purple-100 text-purple-800');
  });

  it('shows assignee information when assigned', () => {
    const assignedTender = {
      ...mockTender,
      status: 'ASSIGNED' as const,
      assigneeId: 'user-1',
      assignee: {
        id: 'user-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
      },
    };

    render(<TenderCard tender={assignedTender} />);
    
    expect(screen.getByText('Assigned to:')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('navigates to tender detail on click', async () => {
    const user = userEvent.setup();
    render(<TenderCard tender={mockTender} />);
    
    const card = screen.getByRole('article');
    await user.click(card);
    
    expect(mockPush).toHaveBeenCalledWith('/tenders/tender-1');
  });

  it('navigates to tender detail on Enter key', async () => {
    const user = userEvent.setup();
    render(<TenderCard tender={mockTender} />);
    
    const card = screen.getByRole('article');
    card.focus();
    await user.keyboard('{Enter}');
    
    expect(mockPush).toHaveBeenCalledWith('/tenders/tender-1');
  });

  it('has proper accessibility attributes', () => {
    render(<TenderCard tender={mockTender} />);
    
    const card = screen.getByRole('article');
    expect(card).toHaveAttribute('tabIndex', '0');
    expect(card).toHaveClass('cursor-pointer');
    expect(card).toHaveAttribute('aria-label', 'Tender: IT Services Tender');
  });

  it('shows urgency indicator for near-deadline tenders', () => {
    const urgentTender = {
      ...mockTender,
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 1 day from now
    };

    render(<TenderCard tender={urgentTender} />);
    
    expect(screen.getByText('Urgent')).toBeInTheDocument();
    expect(screen.getByText('Urgent')).toHaveClass('bg-red-100 text-red-800');
  });

  it('handles different currencies correctly', () => {
    const { rerender } = render(<TenderCard tender={mockTender} />);
    
    expect(screen.getByText('$100,000')).toBeInTheDocument();

    rerender(<TenderCard tender={{ ...mockTender, currency: 'EUR' }} />);
    expect(screen.getByText('€100,000')).toBeInTheDocument();

    rerender(<TenderCard tender={{ ...mockTender, currency: 'GBP' }} />);
    expect(screen.getByText('£100,000')).toBeInTheDocument();
  });

  it('shows actions menu on hover or focus', async () => {
    const user = userEvent.setup();
    render(<TenderCard tender={mockTender} onEdit={jest.fn()} onDelete={jest.fn()} />);
    
    const card = screen.getByRole('article');
    
    // Initially actions should not be visible
    expect(screen.queryByRole('button', { name: /more actions/i })).not.toBeInTheDocument();
    
    // Hover to show actions
    await user.hover(card);
    expect(screen.getByRole('button', { name: /more actions/i })).toBeInTheDocument();
  });

  it('calls edit handler when edit is clicked', async () => {
    const user = userEvent.setup();
    const mockOnEdit = jest.fn();
    
    render(<TenderCard tender={mockTender} onEdit={mockOnEdit} />);
    
    const card = screen.getByRole('article');
    await user.hover(card);
    
    const moreButton = screen.getByRole('button', { name: /more actions/i });
    await user.click(moreButton);
    
    const editButton = screen.getByRole('menuitem', { name: /edit/i });
    await user.click(editButton);
    
    expect(mockOnEdit).toHaveBeenCalledWith(mockTender);
  });

  it('calls delete handler when delete is clicked', async () => {
    const user = userEvent.setup();
    const mockOnDelete = jest.fn();
    
    render(<TenderCard tender={mockTender} onDelete={mockOnDelete} />);
    
    const card = screen.getByRole('article');
    await user.hover(card);
    
    const moreButton = screen.getByRole('button', { name: /more actions/i });
    await user.click(moreButton);
    
    const deleteButton = screen.getByRole('menuitem', { name: /delete/i });
    await user.click(deleteButton);
    
    expect(mockOnDelete).toHaveBeenCalledWith(mockTender);
  });

  it('prevents navigation when action buttons are clicked', async () => {
    const user = userEvent.setup();
    const mockOnEdit = jest.fn();
    
    render(<TenderCard tender={mockTender} onEdit={mockOnEdit} />);
    
    const card = screen.getByRole('article');
    await user.hover(card);
    
    const moreButton = screen.getByRole('button', { name: /more actions/i });
    await user.click(moreButton);
    
    // Navigation should not happen when clicking action menu
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('handles missing optional data gracefully', () => {
    const minimalTender = {
      id: 'tender-minimal',
      title: 'Minimal Tender',
      category: 'OTHER' as const,
      status: 'SCRAPED' as const,
      deadline: '2024-12-31T23:59:59.000Z',
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };

    render(<TenderCard tender={minimalTender} />);
    
    expect(screen.getByText('Minimal Tender')).toBeInTheDocument();
    expect(screen.getByText('OTHER')).toBeInTheDocument();
    expect(screen.getByText('SCRAPED')).toBeInTheDocument();
    
    // Should not crash when optional fields are missing
    expect(screen.queryByText('$')).not.toBeInTheDocument();
    expect(screen.queryByText('Assigned to:')).not.toBeInTheDocument();
  });

  it('applies custom className when provided', () => {
    render(<TenderCard tender={mockTender} className="custom-tender-card" />);
    
    const card = screen.getByRole('article');
    expect(card).toHaveClass('custom-tender-card');
  });
});