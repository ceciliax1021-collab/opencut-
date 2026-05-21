import React, { useState } from 'react';
import { TextClip } from '../types';
import { Copy, Trash2, Pin, PinOff, Check, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TextCardProps {
  key?: React.Key;
  text: TextClip;
  isSelected: boolean;
  isCopied: boolean;
  isSelectionMode?: boolean;
  onClick: (e: React.MouseEvent) => void;
  onCopy: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onToggleSelect?: (text: TextClip) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onEdit?: () => void;
}

export function TextCard({
  text,
  isSelected,
  isCopied,
  isSelectionMode,
  onClick,
  onCopy,
  onDelete,
  onTogglePin,
  onToggleSelect,
  onContextMenu,
  onEdit,
}: TextCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.18 }}
      className={`text-card-item group relative bg-white border cursor-pointer flex flex-col justify-between ${
        isSelected
          ? 'border-2 border-[#191919] rounded-lg p-3 shadow-sm ring-4 ring-[#191919]/10'
          : 'border-[#D1D1D1] rounded-lg p-3 hover:border-[#191919]/50 hover:ring-4 hover:ring-[#191919]/5 hover:scale-[1.01] hover:shadow-md z-0 hover:z-10'
      } transition-all duration-200 min-h-[140px] max-h-[220px]`}
      data-id={text.id}
      onClick={onClick}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onCopy();
      }}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {}
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-[#F0F0F0] shrink-0 select-none">
        <div className="flex items-center gap-1.5">
          {text.isPinned && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-sans text-xs font-semibold border border-amber-200/50">
              <Pin className="w-3 h-3 fill-amber-500" />
              置顶
            </span>
          )}
          <span className="text-xs text-[#999999] font-mono">
            {formatDate(text.createdAt)}
          </span>
        </div>
        <div className="text-xs text-[#999999] font-mono uppercase">
          {text.content.length} 字
        </div>
      </div>

      {}
      <div className="flex-1 overflow-hidden overflow-y-auto mb-2 text-xs font-mono text-[#222222] text-left leading-relaxed break-all select-text whitespace-pre-wrap pr-1 scrollbar-thin">
        {text.content}
      </div>

      {}
      <div className={`mt-1 flex items-center justify-between transition-all duration-150 select-none shrink-0 ${
        isSelectionMode || isSelected
          ? 'opacity-100'
          : 'opacity-0 group-hover:opacity-100'
      }`}>
        {}
        <div>
          {onToggleSelect && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect(text);
              }}
              className={`w-4 h-4 rounded-full border transition-all duration-150 flex items-center justify-center ${
                isSelected
                  ? 'bg-[#191919] border-[#191919] text-white'
                  : 'bg-white border-gray-300 hover:border-[#191919] text-transparent hover:text-[#191919] shadow-sm'
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" className="w-2.5 h-2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          )}
        </div>

        {}
        <div className="flex items-center gap-1">
          <button
            title={text.isPinned ? '取消置顶' : '固定/置顶'}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            className={`p-1 rounded hover:bg-[#F2F2F2] transition-colors ${
              text.isPinned ? 'text-amber-500' : 'text-[#666666] hover:text-[#1A1A1A]'
            }`}
          >
            {text.isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
          
          <button
            title="一键复制"
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
            className="p-1 rounded hover:bg-[#F2F2F2] text-[#666666] hover:text-[#1A1A1A] transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>

          {onEdit && (
            <button
              title="编辑内容"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="p-1 rounded hover:bg-[#F2F2F2] text-[#666666] hover:text-[#1A1A1A] transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            title="删除"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 rounded hover:bg-red-50 text-[#666666] hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {}
      <AnimatePresence>
        {isCopied && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-emerald-500/95 flex flex-col items-center justify-center text-white z-20 rounded-lg pointer-events-none select-none"
          >
            <motion.div
              initial={{ scale: 0.7, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0.7 }}
              transition={{ type: 'spring', stiffness: 220 }}
              className="mb-1 bg-white/20 p-2 rounded-full"
            >
              <Check className="w-6 h-6 stroke-[3]" />
            </motion.div>
            <span className="font-sans text-xs font-bold tracking-wider">已保存至剪贴板</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
