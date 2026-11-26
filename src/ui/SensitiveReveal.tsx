/**
 * Shared sensitive-content reveal pattern (per-item warning + confirmation).
 *
 * Used identically in both Diagnose (Findings) and Fix (Prescriptions) so
 * sensitive data is always redacted by default and revealed one item at a time
 * after an explicit warning.
 */

import React, { useState } from "react";
import type { FindingEvidence } from "../domain/types";
import styles from "./SensitiveReveal.module.css";

export function plainText(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "[Unserializable evidence]";
    }
  }
  return String(value);
}

export function containsAbsolutePath(value: unknown): boolean {
  const text = plainText(value);
  return /(?:^|[\s"'=(])(?:\/(?!\/)[^\s"']+|[A-Za-z]:[\\/][^\s"']+|\\\\[^\\\s]+\\[^\s"']+)/.test(
    text
  );
}

export function isSensitiveEvidence(evidence: FindingEvidence): boolean {
  if (evidence.redactable) return true;
  if (
    evidence.type === "message" ||
    evidence.type === "command" ||
    evidence.type === "cross-reference"
  ) {
    return true;
  }
  if (evidence.externalCommands !== undefined) return true;
  if (
    evidence.fieldPath !== undefined &&
    /(?:content|toolCalls.*arguments|task\.title|primaryWorkspace)/i.test(
      evidence.fieldPath
    )
  ) {
    return true;
  }
  return containsAbsolutePath(evidence.rawValue);
}

export interface SensitiveRevealControlProps {
  revealed: boolean;
  pending: boolean;
  onRequestReveal: () => void;
  onConfirmReveal: () => void;
  onCancelReveal: () => void;
  onHide: () => void;
}

/**
 * Controlled reveal bar for a single sensitive item.
 */
export function SensitiveRevealControl({
  revealed,
  pending,
  onRequestReveal,
  onConfirmReveal,
  onCancelReveal,
  onHide,
}: SensitiveRevealControlProps): React.JSX.Element {
  return (
    <div className={styles.revealBar}>
      {!revealed && !pending && (
        <button
          type="button"
          className={styles.revealButton}
          onClick={onRequestReveal}
        >
          Show raw content…
        </button>
      )}
      {pending && (
        <div className={styles.revealWarning} role="alert">
          <p className={styles.revealWarningText}>
            <strong>Warning:</strong> this action may expose message content,
            tool arguments, the full prompt in task.title and absolute paths.
            Only reveal it if your surroundings are safe.
          </p>
          <div className={styles.revealWarningActions}>
            <button
              type="button"
              className={styles.revealConfirmButton}
              onClick={onConfirmReveal}
              autoFocus
            >
              Understood — show this item
            </button>
            <button
              type="button"
              className={styles.revealCancelButton}
              onClick={onCancelReveal}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {revealed && (
        <button type="button" className={styles.revealButton} onClick={onHide}>
          Hide raw content
        </button>
      )}
    </div>
  );
}

export interface InlineSensitiveRevealProps {
  /** Render the revealed content as safe React text nodes. */
  renderRevealed: () => React.ReactNode;
  /** Optional placeholder shown while redacted. Defaults to "[REDACTED]". */
  redactedText?: string;
}

/**
 * Self-contained per-item sensitive reveal wrapper used in Prescription cards
 * so each sensitive evidence item has its own confirmation state.
 */
export function InlineSensitiveReveal({
  renderRevealed,
  redactedText = "[REDACTED]",
}: InlineSensitiveRevealProps): React.JSX.Element {
  const [revealed, setRevealed] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <div className={styles.inlineWrap}>
      {revealed ? (
        <div className={styles.revealedContent}>{renderRevealed()}</div>
      ) : (
        <span className={styles.redactedToken}>{redactedText}</span>
      )}
      <SensitiveRevealControl
        revealed={revealed}
        pending={pending}
        onRequestReveal={() => setPending(true)}
        onConfirmReveal={() => {
          setPending(false);
          setRevealed(true);
        }}
        onCancelReveal={() => setPending(false)}
        onHide={() => setRevealed(false)}
      />
    </div>
  );
}
