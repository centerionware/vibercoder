const content = `This protocol governs how you access and reason about the current conversation's history.

**Core Tool: \`getChatHistory\`**
- This tool is your primary method for recalling previous messages in the current chat.
- Use it when the user's request explicitly refers to past parts of the conversation (e.g., "What did I just say?", "Based on my last message...", "Summarize what we've discussed.").
- For efficiency, use the \`last_n_turns\` parameter whenever possible to retrieve only the most recent, relevant messages. For example, for "What was the last thing I asked?", using \`last_n_turns: 2\` is sufficient.
- Only retrieve the full history if a comprehensive summary is required.
`;

export default content;
