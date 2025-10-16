import { useState, useCallback, RefObject, useEffect } from 'react';
// FIX: Import React to use React-specific types like Dispatch and SetStateAction.
import React from 'react';
import { GitService, GitStatus, Project } from '../types';

interface UseGitLogicProps {
    gitServiceRef: RefObject<GitService | null>;
    activeProject: Project | null;
    files: Record<string, string>;
    setFiles: (files: Record<string, string>) => void;
    // FIX: Changed the type of 'setActiveFile' to correctly represent a React state setter, which can accept a value or an updater function.
    setActiveFile: React.Dispatch<React.SetStateAction<string | null>>;
    createNewProject: (name: string, setActive: boolean, remoteUrl: string, gitSettings?: any) => Promise<Project>;
}

export const useGitLogic = ({ gitServiceRef, activeProject, files, setFiles, setActiveFile, createNewProject }: UseGitLogicProps) => {
    const [isCloning, setIsCloning] = useState(false);
    const [cloningProgress, setCloningProgress] = useState<string | null>(null);
    const [isCommitting, setIsCommitting] = useState(false);
    const [isGitNetworkActivity, setIsGitNetworkActivity] = useState(false);
    const [gitNetworkProgress, setGitNetworkProgress] = useState<string | null>(null);
    const [changedFiles, setChangedFiles] = useState<GitStatus[]>([]);
    const [commitMessage, setCommitMessage] = useState('');

    const updateStatus = useCallback(async () => {
        const svc = gitServiceRef.current;
        if (svc?.isReal) {
            try {
                const status = await svc.status(files);
                setChangedFiles(status);
            } catch (e) {
                console.error("Failed to get git status:", e);
                setChangedFiles([]);
            }
        } else {
            setChangedFiles([]);
        }
    }, [gitServiceRef, files]);

    useEffect(() => {
        const debounce = setTimeout(() => updateStatus(), 500);
        return () => clearTimeout(debounce);
    }, [files, activeProject, updateStatus]);

    const handleClone = async (url: string, name: string, credentialId?: string | null) => {
        const svc = gitServiceRef.current;
        if (!svc || !svc.isReal) {
            alert("Git is not initialized. Cannot clone.");
            return;
        }

        setIsCloning(true);
        setCloningProgress("Initializing clone...");
        try {
            const { files: clonedFiles } = await svc.clone(url, (progress) => {
                setCloningProgress(`${progress.phase} (${progress.loaded}/${progress.total})`);
            });
            await createNewProject(name, true, url, { source: 'specific', credentialId: credentialId || undefined });
            setFiles(clonedFiles);
        } catch (e) {
            console.error("Clone failed:", e);
            alert(`Clone failed: ${(e as Error).message}`);
        } finally {
            setIsCloning(false);
            setCloningProgress(null);
        }
    };
    
    const performNetworkOp = async (op: () => Promise<any>) => {
        const svc = gitServiceRef.current;
        if (!svc || !svc.isReal) {
            alert("Git service not available.");
            return;
        }
        setIsGitNetworkActivity(true);
        try {
            await op();
        } catch (e) {
            console.error(e);
            alert(`Git operation failed: ${(e as Error).message}`);
        } finally {
            setIsGitNetworkActivity(false);
            setGitNetworkProgress(null);
        }
    };

    const onCommit = async (message: string) => {
        const svc = gitServiceRef.current;
        if (!svc || !svc.isReal) return;
        setIsCommitting(true);
        try {
            const { oid, status } = await svc.commit(message, files);
            setChangedFiles(status);
            setCommitMessage('');
            console.log("Committed:", oid);
        } catch (e) {
            alert(`Commit failed: ${(e as Error).message}`);
        } finally {
            setIsCommitting(false);
        }
    };

    const onPush = async () => {
        await performNetworkOp(async () => {
            await gitServiceRef.current!.push(progress => setGitNetworkProgress(`${progress.phase} (${progress.loaded}/${progress.total})`));
        });
    };
    
    const onCommitAndPush = async (message: string) => {
        await onCommit(message);
        setTimeout(() => onPush(), 100);
    };

    const onPull = async (rebase: boolean) => {
        await performNetworkOp(async () => {
            const { files: newFiles, status } = await gitServiceRef.current!.pull(rebase, progress => setGitNetworkProgress(`${progress.phase} (${progress.loaded}/${progress.total})`));
            setFiles(newFiles);
            setChangedFiles(status);
        });
    };

    const onRebase = async (branch: string) => {
        await performNetworkOp(async () => {
            const { files: newFiles, status } = await gitServiceRef.current!.rebase(branch);
            setFiles(newFiles);
            setChangedFiles(status);
        });
    };

    const onDiscardChanges = async () => {
        const svc = gitServiceRef.current;
        if (!svc?.isReal) return;
        try {
            const headFiles = await svc.getHeadFiles();
            setFiles(headFiles);
            setActiveFile(p => p && headFiles[p] === undefined ? null : p);
        } catch (e) {
            alert(`Could not discard changes: ${(e as Error).message}`);
        }
    };
    
    const onBranchSwitch = async (branchName: string) => {
        const svc = gitServiceRef.current;
        if (!svc?.isReal) return;
        try {
            const { files: newFiles } = await svc.checkout(branchName);
            setFiles(newFiles);
            setActiveFile(p => p && newFiles[p] === undefined ? null : p);
        } catch (e) {
            alert(`Could not switch branch: ${(e as Error).message}`);
        }
    };

    return {
        isCloning, cloningProgress, isCommitting, isGitNetworkActivity, gitNetworkProgress, changedFiles, commitMessage, setCommitMessage,
        handleClone, onCommit, onCommitAndPush, onPush, onPull, onRebase, onDiscardChanges, onBranchSwitch,
        updateStatus,
    };
};
