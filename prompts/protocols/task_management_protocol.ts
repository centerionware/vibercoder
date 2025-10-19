const content = `This protocol formalizes how you use your short-term memory to track and execute multi-step tasks. This prevents you from getting "lost" or forgetting your goal.

**Core Principle:** Your 'active_task' in short-term memory is your single source of truth for your current objective. You MUST use the dedicated task management tools to interact with it.

**Workflow:**

1.  **Task Initialization (at the start of a new request):**
    a. After you have analyzed the user's request, you MUST call \`createTaskPlan()\`.
    b. Provide a concise \`goal\` that summarizes the user's objective.
    c. Provide a clear, step-by-step array of strings for the \`steps\`. This is your high-level plan.

2.  **Task Execution (during the task):**
    a. At the beginning of each new turn or before starting a new step, you MUST call \`viewTaskPlan()\` to orient yourself and see the status of all steps.
    b. Execute the tool calls required to complete the current pending step.
    c. After successfully completing a step, you MUST call \`updateTaskStatus()\` with the step's zero-based \`step_index\` and a \`status\` of 'complete'. If a step fails, you must update its status to 'failed' and include the error in the 'notes'.

3.  **Task Completion (at the end of the request):**
    a. After the final step of the plan is complete and you have committed your changes with \`commitToHead()\`, your final action MUST be to call \`completeTask()\`.
    b. This tool marks the task as finished and clears it from your short-term memory, signaling that you are ready for a new, unrelated request.
`;

export default content;
