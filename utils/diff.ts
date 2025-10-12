import { DiffLine } from '../types';

/**
 * A simple line-by-line diff implementation based on the Longest Common Subsequence algorithm.
 * @param text1 The "before" text.
 * @param text2 The "after" text.
 * @returns An array of DiffLine objects representing the changes.
 */
export const performDiff = (text1: string, text2: string): DiffLine[] => {
    const lines1 = text1.split('\n');
    const lines2 = text2.split('\n');
    const matrix = Array(lines1.length + 1).fill(null).map(() => Array(lines2.length + 1).fill(0));

    // Build the LCS matrix
    for (let i = 1; i <= lines1.length; i++) {
        for (let j = 1; j <= lines2.length; j++) {
            if (lines1[i - 1] === lines2[j - 1]) {
                matrix[i][j] = matrix[i - 1][j - 1] + 1;
            } else {
                matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
            }
        }
    }

    // Backtrack through the matrix to construct the diff
    const diff: DiffLine[] = [];
    let i = lines1.length;
    let j = lines2.length;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && lines1[i - 1] === lines2[j - 1]) {
            diff.unshift({ type: 'eql', content: lines1[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
            diff.unshift({ type: 'add', content: lines2[j - 1] });
            j--;
        } else if (i > 0 && (j === 0 || matrix[i][j - 1] < matrix[i - 1][j])) {
            diff.unshift({ type: 'del', content: lines1[i - 1] });
            i--;
        } else {
            break; // Should not be reached
        }
    }
    return diff;
};