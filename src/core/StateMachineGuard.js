/**
 * State Machine Transition Guard (Tier 1 & Tier 2)
 * Ensures subsystems transition strictly along allowed lifecycle pathways.
 */
export const LEGAL_STATES = Object.freeze({
  UNINITIALIZED: 'UNINITIALIZED',
  BOOTING: 'BOOTING',
  READY: 'READY',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  RECOVERING: 'RECOVERING',
  SHUTDOWN: 'SHUTDOWN'
});

export class StateMachineGuard {
  constructor(initialState = LEGAL_STATES.UNINITIALIZED) {
    this.currentState = initialState;
    this.allowedTransitions = new Map([
      [LEGAL_STATES.UNINITIALIZED, [LEGAL_STATES.BOOTING]],
      [LEGAL_STATES.BOOTING, [LEGAL_STATES.READY]],
      [LEGAL_STATES.READY, [LEGAL_STATES.RUNNING, LEGAL_STATES.SHUTDOWN]],
      [LEGAL_STATES.RUNNING, [LEGAL_STATES.PAUSED, LEGAL_STATES.RECOVERING, LEGAL_STATES.SHUTDOWN]],
      [LEGAL_STATES.PAUSED, [LEGAL_STATES.RUNNING, LEGAL_STATES.SHUTDOWN]],
      [LEGAL_STATES.RECOVERING, [LEGAL_STATES.RUNNING, LEGAL_STATES.SHUTDOWN]],
      [LEGAL_STATES.SHUTDOWN, [LEGAL_STATES.BOOTING]]
    ]);
  }

  transitionTo(nextState) {
    const validNextStates = this.allowedTransitions.get(this.currentState) || [];
    if (!validNextStates.includes(nextState)) {
      throw new Error(`[StateMachineGuard] Illegal transition attempt from '${this.currentState}' to '${nextState}'`);
    }
    console.log(`[State Transition] ${this.currentState} ===> ${nextState}`);
    this.currentState = nextState;
    return this.currentState;
  }

  getState() {
    return this.currentState;
  }
}

export default StateMachineGuard;