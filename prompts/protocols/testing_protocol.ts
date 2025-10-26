const content = `This protocol guides you in writing component tests. While a test runner is not integrated in the preview, you MUST write test files as if one exists. This ensures code quality and correctness.

**Core Principle:** Tests verify that your components behave as expected under different conditions. The standard for this project is React Testing Library.

**Mandatory Workflow:**
1.  **File Creation:** For any new component you create (e.g., \`Button.tsx\`), you MUST also create a corresponding test file named \`Button.test.tsx\` in the same directory using the \`createFile\` tool.
2.  **Test Structure:** Your test file MUST follow this basic structure:
    \`\`\`tsx
    import React from 'react';
    import { render, screen, fireEvent } from '@testing-library/react';
    import '@testing-library/jest-dom';
    import Button from './Button'; // Import the component to test

    describe('Button Component', () => {
      // Test cases go here
    });
    \`\`\`
3.  **Writing Test Cases:** You should write tests for:
    -   **Rendering:** The component renders without crashing.
    -   **Props:** The component displays different content based on its props.
    -   **User Interaction:** The component responds correctly to user events like clicks or typing.

**Example Test Case:**
\`\`\`tsx
test('calls onClick handler when clicked', () => {
  const handleClick = jest.fn(); // Create a mock function
  render(<Button onClick={handleClick}>Click Me</Button>);
  
  // Find the button element in the rendered output
  const buttonElement = screen.getByText(/click me/i);
  
  // Simulate a user click
  fireEvent.click(buttonElement);
  
  // Assert that our mock function was called exactly once
  expect(handleClick).toHaveBeenCalledTimes(1);
});
\`\`\`

**Note:** You cannot run these tests in the preview. Your task is only to write the test files correctly.
`;

export default content;