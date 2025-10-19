/**
 * This file centralizes the default prompts provided to the AI.
 * To add, remove, or edit a default prompt, modify this array.
 * The `seedInitialPrompts` function in `utils/idb.ts` will automatically
 * sync these definitions with the IndexedDB database on application startup.
 */
import LEAD_ENGINEER_PROTOCOL from './protocols/lead_engineer_protocol';
import SENIOR_UI_UX_ENGINEER_PROTOCOL from './protocols/senior_ui_ux_engineer_protocol';
import SENIOR_SOFTWARE_ARCHITECT_PROTOCOL from './protocols/senior_software_architect_protocol';
import DEVOPS_SPECIALIST_PROTOCOL from './protocols/devops_specialist_protocol';
import QUALITY_ASSURANCE_ENGINEER_PROTOCOL from './protocols/quality_assurance_engineer_protocol';
import SENIOR_DATABASE_ENGINEER_PROTOCOL from './protocols/senior_database_engineer_protocol';
import AUTHENTICATION_SPECIALIST_PROTOCOL from './protocols/authentication_specialist_protocol';
import FEATURE_IMPLEMENTATION_PROTOCOL from './protocols/feature_implementation_protocol';
import APP_CREATION_PROTOCOL from './protocols/app_creation_protocol';
import DEBUGGING_PROTOCOL from './protocols/debugging_protocol';
import FEATURE_TRACING_PROTOCOL from './protocols/feature_tracing_protocol';
import GIT_COMMIT_PROTOCOL from './protocols/git_commit_protocol';
import USER_FEEDBACK_PROTOCOL from './protocols/user_feedback_protocol';
import CHAT_CONTEXT_PROTOCOL from './protocols/chat_context_protocol';
import LISTENING_CONTROL_PROTOCOL from './protocols/listening_control_protocol';
import SELF_CORRECTION_PROTOCOL from './protocols/self_correction_protocol';
import BUILD_ENVIRONMENT_CONTEXT from './protocols/build_environment_context';
import PROJECT_ANALYSIS_PROTOCOL from './protocols/project_analysis_protocol';
import REACT_STYLE_GUIDE from './protocols/react_style_guide';
import CODE_REFACTORING_PROTOCOL from './protocols/code_refactoring_protocol';
import DOCUMENTATION_PROTOCOL from './protocols/documentation_protocol';
import TESTING_PROTOCOL from './protocols/testing_protocol';
import ACCESSIBILITY_PROTOCOL from './protocols/accessibility_protocol';
import CREATIVE_ASSET_PROTOCOL from './protocols/creative_asset_protocol';
import COMPONENT_SCAFFOLDING_PROTOCOL from './protocols/component_scaffolding_protocol';
import AMBIGUITY_RESOLUTION_PROTOCOL from './protocols/ambiguity_resolution_protocol';
import REQUEST_VALIDATION_PROTOCOL from './protocols/request_validation_protocol';
import SOLUTION_PRESENTATION_PROTOCOL from './protocols/solution_presentation_protocol';
import TASK_MANAGEMENT_PROTOCOL from './protocols/task_management_protocol';
import UI_UX_DESIGN_PROTOCOL from './protocols/ui_ux_design_protocol';
import VISION_PROTOCOL from './protocols/vision_protocol';
import ASSET_MANAGEMENT_PROTOCOL from './protocols/asset_management_protocol';
import CONTEXT_GATHERING_PROTOCOL from './protocols/context_gathering_protocol';


interface DefaultPrompt {
  id: string;
  description: string;
  content: string;
}


export const defaultPrompts: DefaultPrompt[] = [
    {
        id: 'lead_engineer_protocol',
        description: 'The main orchestrator protocol that dictates which specialized engineering persona to adopt for a task.',
        content: LEAD_ENGINEER_PROTOCOL,
    },
    {
        id: 'senior_ui_ux_engineer_protocol',
        description: 'Persona for creating beautiful, intuitive, and accessible user interfaces.',
        content: SENIOR_UI_UX_ENGINEER_PROTOCOL,
    },
    {
        id: 'senior_software_architect_protocol',
        description: 'Persona for managing code structure, quality, refactoring, and documentation.',
        content: SENIOR_SOFTWARE_ARCHITECT_PROTOCOL,
    },
    {
        id: 'devops_specialist_protocol',
        description: 'Persona for handling Git workflows, build processes, and debugging operational errors.',
        content: DEVOPS_SPECIALIST_PROTOCOL,
    },
    {
        id: 'quality_assurance_engineer_protocol',
        description: 'Persona for verifying functionality, manual testing, and writing automated tests.',
        content: QUALITY_ASSURANCE_ENGINEER_PROTOCOL,
    },
    {
        id: 'senior_database_engineer_protocol',
        description: 'Persona for managing data models, schema, and queries using Dexie.js, with a focus on security.',
        content: SENIOR_DATABASE_ENGINEER_PROTOCOL,
    },
    {
        id: 'authentication_specialist_protocol',
        description: 'Persona for securely managing user credentials, primarily for Git, and guiding users on token creation.',
        content: AUTHENTICATION_SPECIALIST_PROTOCOL,
    },
    {
        id: 'feature_implementation_protocol',
        description: 'A protocol for implementing new features completely, including UI, state, and logic.',
        content: FEATURE_IMPLEMENTATION_PROTOCOL,
    },
    {
        id: 'app_creation_protocol',
        description: 'A strict protocol for creating a new React application from scratch, following the standard VibeCode project structure.',
        content: APP_CREATION_PROTOCOL,
    },
    {
        id: 'debugging_protocol',
        description: 'A systematic protocol for diagnosing and fixing build-time or run-time errors in the application.',
        content: DEBUGGING_PROTOCOL,
    },
    {
        id: 'feature_tracing_protocol',
        description: 'A protocol for understanding and tracing the implementation of an existing feature within the codebase.',
        content: FEATURE_TRACING_PROTOCOL,
    },
    {
        id: 'git_commit_protocol',
        description: 'A protocol for creating Conventional Commit messages based on workspace changes.',
        content: GIT_COMMIT_PROTOCOL,
    },
    {
        id: 'user_feedback_protocol',
        description: 'A protocol for soliciting and incorporating user feedback during development.',
        content: USER_FEEDBACK_PROTOCOL,
    },
    {
        id: 'chat_context_protocol',
        description: 'A protocol for accessing and reasoning about the current conversation history.',
        content: CHAT_CONTEXT_PROTOCOL,
    },
    {
        id: 'listening_control_protocol',
        description: 'A protocol explaining how to use the `pauseListening` and `stopListening` tools to manage a voice conversation.',
        content: LISTENING_CONTROL_PROTOCOL,
    },
    {
        id: 'self_correction_protocol',
        description: 'A protocol for reverting or undoing your own work when the user indicates you have made a mistake.',
        content: SELF_CORRECTION_PROTOCOL,
    },
    {
        id: 'build_environment_context',
        description: 'Describes the rules and conventions of the VibeCode build environment, including entry points and styling.',
        content: BUILD_ENVIRONMENT_CONTEXT,
    },
    {
        id: 'project_analysis_protocol',
        description: 'A protocol for analyzing a new or unfamiliar project to gain context before making changes.',
        content: PROJECT_ANALYSIS_PROTOCOL,
    },
    {
        id: 'react_style_guide',
        description: "The official VibeCode style guide for creating React applications with Tailwind CSS, based on the IDE's aesthetic.",
        content: REACT_STYLE_GUIDE,
    },
    {
        id: 'code_refactoring_protocol',
        description: 'A protocol for improving code quality without changing its functionality.',
        content: CODE_REFACTORING_PROTOCOL,
    },
    {
        id: 'documentation_protocol',
        description: 'A protocol for writing JSDoc and inline comments for code.',
        content: DOCUMENTATION_PROTOCOL,
    },
    {
        id: 'testing_protocol',
        description: 'A protocol for writing component tests using React Testing Library.',
        content: TESTING_PROTOCOL,
    },
    {
        id: 'accessibility_protocol',
        description: 'A protocol for ensuring all created UI is accessible (A11y).',
        content: ACCESSIBILITY_PROTOCOL,
    },
    {
        id: 'creative_asset_protocol',
        description: 'A protocol for generating creative assets like images and videos.',
        content: CREATIVE_ASSET_PROTOCOL,
    },
    {
        id: 'component_scaffolding_protocol',
        description: 'A protocol defining the standard file structure for creating new React components.',
        content: COMPONENT_SCAFFOLDING_PROTOCOL,
    },
    {
        id: 'ambiguity_resolution_protocol',
        description: 'A protocol for handling vague or incomplete user requests by asking clarifying questions.',
        content: AMBIGUITY_RESOLUTION_PROTOCOL,
    },
    {
        id: 'request_validation_protocol',
        description: 'A safety protocol that requires user confirmation before performing destructive actions.',
        content: REQUEST_VALIDATION_PROTOCOL,
    },
    {
        id: 'solution_presentation_protocol',
        description: 'A protocol for summarizing completed work in a clear, structured format.',
        content: SOLUTION_PRESENTATION_PROTOCOL,
    },
    {
        id: 'task_management_protocol',
        description: 'A protocol for using short-term memory to track and execute multi-step tasks.',
        content: TASK_MANAGEMENT_PROTOCOL,
    },
    {
        id: 'ui_ux_design_protocol',
        description: 'A protocol for applying UI/UX design principles beyond the basic style guide.',
        content: UI_UX_DESIGN_PROTOCOL,
    },
    {
        id: 'vision_protocol',
        description: 'A protocol that explains how to use visual tools like screen capture and live video stream.',
        content: VISION_PROTOCOL,
    },
    {
        id: 'asset_management_protocol',
        description: 'A protocol for handling and organizing generated assets like images within the project.',
        content: ASSET_MANAGEMENT_PROTOCOL,
    },
    {
        id: 'context_gathering_protocol',
        description: 'A protocol for using the gatherContextForTask tool to efficiently research the codebase.',
        content: CONTEXT_GATHERING_PROTOCOL,
    }
];