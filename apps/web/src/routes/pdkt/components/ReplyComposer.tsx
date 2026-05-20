import React, { useState } from 'react';
import { Send, X, Loader2, Reply } from 'lucide-react';

interface ReplyComposerProps {
  recipient: string;
  subject: string;
  onSend: (text: string) => void;
  onClose: () => void;
  isLoading: boolean;
}

export const ReplyComposer: React.FC<ReplyComposerProps> = ({
  recipient,
  subject,
  onSend,
  onClose,
  isLoading,
}) => {
  const [replyText, setReplyText] = useState('');

  const handleSend = () => {
    if (!replyText.trim() || isLoading) return;
    onSend(replyText);
    setReplyText('');
  };

  return (
    <div className="mx-3 mb-3 bg-gray-50/50 border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header Section */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-gray-200 border-l-2 border-l-sky-600 bg-sky-50/50">
        <div className="flex items-center gap-2">
          <Reply className="w-4 h-4 text-sky-600" />
          <span className="text-xs font-bold text-sky-700 uppercase tracking-wider">
            Balas
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center hover:bg-gray-150 rounded-lg transition-all text-gray-500"
          aria-label="Tutup form balasan"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Field Section */}
      <div className="px-4 md:px-6 py-2.5 space-y-2 border-b border-gray-200 text-xs">
        <div className="flex items-center">
          <span className="text-gray-400 w-14 shrink-0 font-medium">Kepada</span>
          <span className="text-gray-800 font-semibold truncate">{recipient}</span>
        </div>
        <div className="flex items-center">
          <span className="text-gray-400 w-14 shrink-0 font-medium">Cc</span>
          <span className="text-gray-400 truncate">-</span>
        </div>
        <div className="flex items-center">
          <span className="text-gray-400 w-14 shrink-0 font-medium">Subjek</span>
          <span className={subject ? 'text-gray-800 font-semibold truncate' : 'text-gray-400 italic truncate'}>
            {subject || 'Tanpa Subjek'}
          </span>
        </div>
      </div>

      {/* Textarea Section */}
      <textarea
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
        className="w-full h-32 md:h-48 p-4 outline-none text-gray-800 bg-white resize-none font-sans text-sm leading-relaxed placeholder:text-gray-400 focus:ring-1 focus:ring-sky-500/20"
        placeholder="Tulis balasan Anda..."
        autoFocus
      />

      {/* Footer Section */}
      <div className="px-4 md:px-6 py-3 flex justify-end items-center border-t border-gray-200">
        <button
          onClick={handleSend}
          disabled={!replyText.trim() || isLoading}
          className="bg-sky-600 hover:bg-sky-700 text-white px-5 py-2 rounded-xl font-bold text-xs flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Mengirim...</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>Kirim</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
