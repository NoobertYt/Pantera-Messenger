import React from 'react';
import { X, Download, ZoomIn } from 'lucide-react';

interface ImageViewerModalProps {
  imageUrl: string;
  senderName?: string;
  onClose: () => void;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({ imageUrl, senderName, onClose }) => {
  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `panther_photo_${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      id="image-viewer-modal"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-4"
    >
      <div className="absolute top-4 right-4 flex items-center gap-3 z-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDownload();
          }}
          className="p-2.5 rounded-full bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 transition cursor-pointer"
          title="Скачать фото"
        >
          <Download className="w-5 h-5" />
        </button>
        <button
          onClick={onClose}
          className="p-2.5 rounded-full bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 transition cursor-pointer"
          title="Закрыть"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {senderName && (
        <div className="absolute top-4 left-4 z-10 text-sm font-semibold text-zinc-200 bg-zinc-900/80 px-3 py-1.5 rounded-full border border-zinc-700">
          Фото от: {senderName}
        </div>
      )}

      <div
        className="max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl border border-zinc-800 shadow-2xl flex items-center justify-center bg-black"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={imageUrl}
          alt="Фото в чате"
          referrerPolicy="no-referrer"
          className="max-w-full max-h-[85vh] object-contain"
        />
      </div>
    </div>
  );
};
