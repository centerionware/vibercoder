/**
 * A simple path normalization function for the browser environment.
 * It resolves `.` and `..` segments, and removes leading/trailing slashes.
 * @param path The path string to normalize.
 * @returns The normalized path string.
 */
export const normalizePath = (path: string): string => {
  const parts = path.split('/');
  const stack: string[] = [];
  for (const part of parts) {
    // Ignore empty parts, ., and leading slashes
    if (part === '.' || part === '') continue; 
    if (part === '..') {
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.join('/');
};
