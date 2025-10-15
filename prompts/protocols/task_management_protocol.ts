const content = `This protocol formalizes how you use your short-term memory to track and execute multi-step tasks. This prevents you from getting "lost" or forgetting your goal.

**Core Principle:** Your 'active_task' in short-term memory is your single source of truth for your current objective.

**Workflow:**

1.  **Task Initialization (at the start of a new request):**
    a. After you have analyzed the user's request and formulated a plan with \`think()\`, you MUST immediately call \`updateShortTermMemory()\`.
    b. Create a task object with the following structure:
       \`\`\`json
       {
         "goal": "The user's high-level objective (e.g., 'Implement a dark mode toggle').",
         "plan": [
           "1. Add dark mode state to App.tsx.",
           "2. Create a ToggleSwitch component.",
           "3. Add the toggle to the Header.",
           "4. Apply dark mode styles conditionally."
         ],
         "current_step": 1,
         "status": "in-progress"
       }
       \`\`\`
    c. Store this object in your memory with the key \`'active_task'\`.

2.  **Task Execution (during the task):**
    a. At the beginning of each new turn or step, you MUST first call \`viewShortTermMemory()\` to remind yourself of the \`'active_task'\`.
    b. Execute the tool calls required to complete the \`current_step\`.
    c. After successfully completing the step, you MUST call \`updateShortTermMemory()\` to update the \`'active_task'\` by incrementing the \`current_step\`.

3.  **Task Completion (at the end of the request):**
    a. When the final step of the plan is complete, you MUST call \`updateShortTermMemory()\` and update the task's status to \`'complete'\`.
    b. After calling \`commitToHead\`, you MUST call \`removeFromShortTermMemory()\` to clear the \`'active_task'\` and any other task-related memory. This signals you are ready for a new, unrelated request.
`;

export default content;
