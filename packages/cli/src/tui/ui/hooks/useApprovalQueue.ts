import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { ApprovalDecision, ApprovalRequest } from "@terminuz/core";

export const APPROVAL_ENTER_ARM_DELAY_MS = 350;
export const APPROVAL_PROMPT_REVEAL_DELAY_MS = 150;

export interface ApprovalQueueState {
  approvalQueue: ApprovalRequest[];
  approvalQueueRef: RefObject<ApprovalRequest[]>;
  approvalPromptVisible: boolean;
  enqueueApproval: (request: ApprovalRequest) => void;
  clearApprovalQueue: () => void;
  resolveApproval: (decision: ApprovalDecision) => void;
  canApproveWithEnter: () => boolean;
}

export function useApprovalQueue(options: {
  emitDecision: (requestId: string, decision: ApprovalDecision) => void;
  onQueueDrained?: () => void;
}): ApprovalQueueState {
  const { emitDecision, onQueueDrained } = options;
  const [approvalQueue, setApprovalQueue] = useState<ApprovalRequest[]>([]);
  const [approvalPromptVisible, setApprovalPromptVisible] = useState(false);
  const approvalQueueRef = useRef<ApprovalRequest[]>([]);
  const approvalEnterArmRef = useRef<{ id: string; time: number } | null>(null);
  const currentApprovalId = approvalQueue[0]?.id;

  useEffect(() => {
    if (currentApprovalId !== undefined) {
      approvalEnterArmRef.current = { id: currentApprovalId, time: Date.now() };
    } else {
      approvalEnterArmRef.current = null;
    }
  }, [currentApprovalId]);

  useEffect(() => {
    setApprovalPromptVisible(false);
    if (currentApprovalId === undefined) {
      onQueueDrained?.();
      return;
    }

    const timeout = setTimeout(() => {
      setApprovalPromptVisible(true);
    }, APPROVAL_PROMPT_REVEAL_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [currentApprovalId, onQueueDrained]);

  const enqueueApproval = useCallback((request: ApprovalRequest) => {
    setApprovalQueue((prev) => {
      const next = [...prev, request];
      approvalQueueRef.current = next;
      return next;
    });
  }, []);

  const clearApprovalQueue = useCallback(() => {
    approvalQueueRef.current = [];
    setApprovalQueue([]);
  }, []);

  const resolveApproval = useCallback(
    (decision: ApprovalDecision) => {
      const current = approvalQueueRef.current[0];
      if (!current) return;

      emitDecision(current.id, decision);
      setApprovalQueue((prev) => {
        const next = prev.slice(1);
        approvalQueueRef.current = next;
        return next;
      });
    },
    [emitDecision],
  );

  const canApproveWithEnter = useCallback((): boolean => {
    const arm = approvalEnterArmRef.current;
    const current = approvalQueueRef.current[0];
    return (
      arm !== null &&
      current !== undefined &&
      arm.id === current.id &&
      Date.now() - arm.time >= APPROVAL_ENTER_ARM_DELAY_MS
    );
  }, []);

  return {
    approvalQueue,
    approvalQueueRef,
    approvalPromptVisible,
    enqueueApproval,
    clearApprovalQueue,
    resolveApproval,
    canApproveWithEnter,
  };
}
