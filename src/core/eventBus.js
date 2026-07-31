import EventEmitter from "events";

class ADEEventBus extends EventEmitter {}

export const eventBus = new ADEEventBus();
