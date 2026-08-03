export default class SecurityPinEngine {
    constructor() {
        this.userPins = new Map(); // userId -> hashedPin or pin
    }

    registerPin(userId, pin) {
        if (!pin || pin.length !== 6 || !/^\d+$/.test(pin)) {
            throw new Error("INVALID_PIN_FORMAT: Must be strictly 6 digits.");
        }
        this.userPins.set(userId, pin);
        console.log(`[SECURITY] 6-digit transaction authorization PIN locked for user: ${userId}`);
        return true;
    }

    verifyPin(userId, pin) {
        const storedPin = this.userPins.get(userId);
        if (!storedPin) {
            throw new Error("PIN_NOT_INITIALIZED");
        }
        if (storedPin !== pin) {
            throw new Error("AUTHORIZATION_FAILED: Incorrect 6-digit PIN.");
        }
        return true;
    }

    hasPin(userId) {
        return this.userPins.has(userId);
    }
}
