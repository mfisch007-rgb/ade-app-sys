class BaseConnector { constructor(name) { this.name = name; } async connect() { throw new Error("Not Implemented"); } } module.exports = BaseConnector;
