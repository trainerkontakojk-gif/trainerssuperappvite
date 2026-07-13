import React from "react";
import { ReplyComposer } from "./ReplyComposer";

interface EmailComposerProps {
  mailboxId: string;
  isOpen: boolean;
  onClose: () => void;
  onSend: (text: string) => void;
  isLoading: boolean;
  recipient: string;
  subject: string;
}

export const EmailComposer: React.FC<EmailComposerProps> = ({
  mailboxId,
  isOpen,
  onClose,
  onSend,
  isLoading,
  recipient,
  subject,
}) => {
  if (!isOpen) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 bg-[var(--surface)] border-t border-[var(--border)] pt-3 transform translate-y-0 transition-transform duration-300 ease-in-out">
      <ReplyComposer
        mailboxId={mailboxId}
        recipient={recipient}
        subject={subject}
        onSend={onSend}
        onClose={onClose}
        isLoading={isLoading}
      />
    </div>
  );
};
