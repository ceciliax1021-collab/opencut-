import React from 'react';
import { TextClip } from '../types';
import { Copy, Trash2, Pin, PinOff, Check, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { HighlightMatch } from './HighlightMatch';

interface TextCardProps {
  key?: React.Key;
  text: TextClip;
  isSelected: boolean;
  isCopied: boolean;
  isSelectionMode?: boolean;
  searchQuery?: string;
  onClick: (e: React.MouseEvent) => void;
  onCopy: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onToggleSelect?: (text: TextClip) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onEdit?: () => void;
}

function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days === 0) {
    if (hours === 0) {
      if (minutes === 0) return '刚刚';
      return `${minutes} 分钟前`;
    }
    return `${hours} 小时前`;
  }
  if (days === 1) return '昨天';
  if (days <= 3) return `${days} 天前`;
  if (days <= 7) return `${days} 天前`;
  if (days <= 30) return `${Math.floor(days / 7)} 周前`;
  return new Date(timestamp).toLocaleDateString();
}

export function TextCard({
  text,
  isSelected,
  isCopied,
  isSelectionMode,
  searchQuery = '',
  onClick,
  onCopy,
  onDelete,
  onTogglePin,
  onToggleSelect,
  onContextMenu,
  onEdit,
}: TextCardProps) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className={`text-card-item group relative bg-white border cursor-pointer flex flex-col isolate ${
        isSelected
          ? 'border-2 border-[#191919] rounded-xl p-3.5 shadow-sm ring-4 ring-[#191919]/10 z-20 bg-white'
          : 'border-neutral-200 rounded-xl p-3.5 hover:border-[#191919]/35 hover:shadow-[0_14px_30px_-18px_rgba(0,0,0,0.45)] z-0 hover:z-20 bg-white/95'
      } transition-all duration-200`}
      data-id={text.id}
      onClick={onClick}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onCopy();
      }}
      onContextMenu={onContextMenu}
    >
      {/* Pin indicator */}
      {text.isPinned && (
        <div className="absolute top-3 left-3 z-10">
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600 font-sans text-[10px] font-bold border border-amber-200/50">
            <Pin className="w-2.5 h-2.5 fill-amber-500" />
            置顶
          </span>
        </div>
      )}

      {/* Selection checkbox */}
      {onToggleSelect && (
        <button
          title={isSelected ? '取消选中' : '选中'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(text);
          }}
          className={`absolute top-3 right-3 w-5 h-5 rounded-md flex items-center justify-center transition-all z-10 ${
            isSelected
              ? 'bg-[#191919] text-white'
              : 'bg-white/80 border border-neutral-300 text-transparent hover:text-neutral-600 hover:border-neutral-400 opacity-0 group-hover:opacity-100'
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3.5 h-3.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
      )}

      {/* Content */}
      <div className="text-card-content flex-1 overflow-hidden overflow-y-auto mb-3 mt-1 text-sm font-mono text-[#222222] text-left leading-relaxed break-all whitespace-pre-wrap pr-1 scrollbar-thin cursor-text select-text min-h-[60px] max-h-[160px]">
        <HighlightMatch text={text.content} query={searchQuery} />
      </div>

      {/* Bottom row: time + action buttons */}
      <div className="flex items-center justify-between pt-2.5 border-t border-neutral-100">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] text-neutral-400 font-sans">
            {getRelativeTime(text.createdAt)}
          </span>
          <span className="text-[10px] text-neutral-300 font-mono">
            {Array.from(text.content.trim()).length} 字
          </span>
        </div>

        <div className="flex items-center gap-0.5">
          {/* Pin toggle */}
          <button
            title={text.isPinned ? '取消置顶' : '置顶'}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            className={`p-1.5 rounded-lg transition-all ${
              text.isPinned 
                ? 'text-amber-500 bg-amber-50/60' 
                : 'text-neutral-400 hover:text-amber-500 hover:bg-amber-50/40 opacity-0 group-hover:opacity-100'
            }`}
          >
            {text.isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>

          {/* Copy */}
          <button
            title="复制"
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-all opacity-0 group-hover:opacity-100"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>

          {/* Edit */}
          {onEdit && (
            <button
              title="编辑"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-all opacity-0 group-hover:opacity-100"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Delete */}
          <button
            title="删除"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Copied overlay */}
      <AnimatePresence>
        {isCopied && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-emerald-500/95 flex flex-col items-center justify-center text-white z-40 rounded-xl pointer-events-none"
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