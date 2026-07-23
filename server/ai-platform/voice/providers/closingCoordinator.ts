import crypto from "node:crypto";

export type ClosingState =
  | "active"
  | "closing_intent_detected"
  | "farewell_pending"
  | "farewell_generating"
  | "farewell_playing"
  | "farewell_completed"
  | "hangup_requested"
  | "hangup_confirmed"
  | "closed"
  | "closing_failed";

export type SafeHangupResult = {
  actionRefSafe: string;
  requestedAt: number;
  confirmedAt: number;
  latencyMs: number;
  ariResult: "confirmed";
  failureCodeSafe: null;
};

export class ClosingCoordinator {
  state: ClosingState = "active";
  readonly sessionRef: string;
  farewellResponseId: string | null = null;
  closingIntentCount = 0;
  duplicateClosingIntentIgnored = 0;
  farewellResponseCount = 0;
  hangupRequestedCount = 0;
  hangupConfirmedCount = 0;
  duplicateResponsePrevented = 0;
  hangupResult: SafeHangupResult | null = null;
  private intentKeys = new Set<string>();

  constructor(sessionRef: string) {
    this.sessionRef = crypto.createHash("sha256").update(sessionRef).digest("hex").slice(0, 16);
  }

  detectIntent(intentRef: string) {
    const key = `${this.sessionRef}:${crypto.createHash("sha256").update(intentRef).digest("hex")}`;
    this.closingIntentCount++;
    if (this.state !== "active" || this.intentKeys.has(key)) {
      this.duplicateClosingIntentIgnored++;
      return { accepted: false, duplicate: true };
    }
    this.intentKeys.add(key);
    this.state = "closing_intent_detected";
    this.state = "farewell_pending";
    return { accepted: true, duplicate: false };
  }

  canCreateFarewell(providerActive: boolean, audibleActive: boolean) {
    if (this.state !== "farewell_pending") return false;
    if (providerActive || audibleActive) {
      this.duplicateResponsePrevented++;
      return false;
    }
    return true;
  }

  farewellRequested() {
    if (this.state !== "farewell_pending" || this.farewellResponseCount > 0) {
      this.duplicateResponsePrevented++;
      return false;
    }
    this.farewellResponseCount++;
    this.state = "farewell_generating";
    return true;
  }

  bindFarewellResponse(responseId?: string) {
    if (this.state !== "farewell_generating" || this.farewellResponseId) return false;
    this.farewellResponseId = responseId || null;
    return true;
  }

  playoutStarted(responseId?: string) {
    if (
      this.state === "farewell_generating" &&
      this.farewellResponseId &&
      responseId === this.farewellResponseId
    ) {
      this.state = "farewell_playing";
      return true;
    }
    return false;
  }

  playoutCompleted(responseId?: string) {
    if (
      this.state === "farewell_playing" &&
      this.farewellResponseId &&
      responseId === this.farewellResponseId
    ) {
      this.state = "farewell_completed";
      return true;
    }
    return false;
  }

  hangupRequested() {
    if (this.state !== "farewell_completed" || this.hangupRequestedCount > 0)
      return false;
    this.hangupRequestedCount++;
    this.state = "hangup_requested";
    return true;
  }

  hangupConfirmed(result: SafeHangupResult) {
    if (this.state !== "hangup_requested" || this.hangupConfirmedCount > 0)
      return false;
    this.hangupConfirmedCount++;
    this.hangupResult = result;
    this.state = "hangup_confirmed";
    return true;
  }

  close() {
    if (this.state === "hangup_confirmed") this.state = "closed";
  }

  fail() {
    this.state = "closing_failed";
  }

  allowsNormalResponse() {
    return this.state === "active";
  }

  snapshot() {
    return {
      state: this.state,
      sessionRefSafe: this.sessionRef,
      closingIntentCount: this.closingIntentCount,
      duplicateClosingIntentIgnored: this.duplicateClosingIntentIgnored,
      farewellResponseCount: this.farewellResponseCount,
      hangupRequestedCount: this.hangupRequestedCount,
      hangupConfirmedCount: this.hangupConfirmedCount,
      duplicateResponsePrevented: this.duplicateResponsePrevented,
      hangupResult: this.hangupResult,
    };
  }
}
