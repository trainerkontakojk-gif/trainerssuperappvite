import React from "react";
import { ReplyComposer } from "./ReplyComposer";
import { Card } from "../../../components/ui/card";

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
    <Card className="absolute inset-x-0 bottom-0 z-30 rounded-none border-x-0 border-b-0 border-border bg-card pt-3 transition-transform duration-300 ease-in-out">
      <ReplyComposer
        mailboxId={mailboxId}
        recipient={recipient}
        subject={subject}
        onSend={onSend}
        onClose={onClose}
        isLoading={isLoading}
      />
    </Card>
  );
};
