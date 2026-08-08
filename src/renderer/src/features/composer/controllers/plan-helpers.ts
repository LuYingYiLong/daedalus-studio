export function createPlanClarificationKey(clarification: { planId: string; question: string }): string {
	return `${clarification.planId}\u0000${clarification.question}`;
}

export function createPlanApprovalKey(plan: { planId: string; updatedAt: string; previewMarkdown: string }): string {
	return `${plan.planId}\u0000${plan.updatedAt}\u0000${plan.previewMarkdown}`;
}
