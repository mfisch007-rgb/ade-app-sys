class WorkflowDefinition { constructor(id, trigger, steps = []) { this.id = id; this.trigger = trigger; this.steps = steps; } } module.exports = WorkflowDefinition;
