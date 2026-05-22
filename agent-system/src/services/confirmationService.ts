// Confirmation Service - manages write operation confirmations

import { v4 as uuidv4 } from 'uuid';
import { AgentAction, ConfirmationRequest } from '../types/index';

// In-memory store - replace with database in production
class ConfirmationService {
  private confirmations: Map<string, ConfirmationRequest> = new Map();

  /**
   * Create a confirmation request for a write operation
   */
  createConfirmation(
    userId: string,
    tenantId: string,
    sessionId: string,
    action: AgentAction,
    expirationMinutes = 5
  ): ConfirmationRequest {
    const id = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expirationMinutes * 60 * 1000);

    const confirmation: ConfirmationRequest = {
      id,
      userId,
      tenantId,
      sessionId,
      action,
      proposedAt: now,
      expiresAt,
      confirmed: false,
    };

    this.confirmations.set(id, confirmation);
    return confirmation;
  }

  /**
   * Confirm a pending action
   */
  confirm(confirmationId: string, confirmedBy: string): boolean {
    const confirmation = this.confirmations.get(confirmationId);
    if (!confirmation) {
      return false;
    }

    if (confirmation.confirmed) {
      return false; // Already confirmed
    }

    if (new Date() > confirmation.expiresAt) {
      return false; // Expired
    }

    confirmation.confirmed = true;
    confirmation.confirmedBy = confirmedBy;
    confirmation.confirmedAt = new Date();
    return true;
  }

  /**
   * Get a confirmation request
   */
  getConfirmation(confirmationId: string): ConfirmationRequest | null {
    const confirmation = this.confirmations.get(confirmationId);
    if (!confirmation) {
      return null;
    }

    // Check if expired
    if (new Date() > confirmation.expiresAt) {
      this.confirmations.delete(confirmationId);
      return null;
    }

    return confirmation;
  }

  /**
   * Get pending confirmations for a session
   */
  getPendingBySession(sessionId: string): ConfirmationRequest[] {
    return Array.from(this.confirmations.values()).filter(
      (c) => c.sessionId === sessionId && !c.confirmed
    );
  }

  /**
   * Reject/cancel a confirmation
   */
  reject(confirmationId: string): boolean {
    const confirmation = this.confirmations.get(confirmationId);
    if (!confirmation) {
      return false;
    }

    this.confirmations.delete(confirmationId);
    return true;
  }

  /**
   * Clean up expired confirmations
   */
  cleanupExpired(): number {
    let removed = 0;
    const now = new Date();

    for (const [id, confirmation] of this.confirmations.entries()) {
      if (now > confirmation.expiresAt) {
        this.confirmations.delete(id);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Clear all confirmations (for testing)
   */
  clearAll(): void {
    this.confirmations.clear();
  }
}

export const confirmationService = new ConfirmationService();

// Cleanup task - run every minute
setInterval(() => {
  const removed = confirmationService.cleanupExpired();
  if (removed > 0) {
    console.log(`[ConfirmationService] Cleaned up ${removed} expired confirmations`);
  }
}, 60000);
