class ADEError extends Error { constructor(message, code = "SYS_ERR", status = 500) { super(message); this.code = code; this.status = status; } } module.exports = { ADEError };
