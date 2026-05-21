import React, { useEffect, useRef } from 'react';
import { ExternalLink, Trash2, Info, CheckSquare } from 'lucide-react';

interface Point {
  x: number;
  y: number;
}

interface ContextMenuProps {
  position: Point;
  onClose: () => void;
  onOpen: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onViewInfo: () => void;
  onSelectToggle: () => void;
  isSelected?: boolean;
}

export function ContextMenu({
  position,
  onClose,
  onOpen,
  onDownload,
  onDelete,
  onViewInfo,
  onSelectToggle,
  isSelected
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    

    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('contextmenu', handleClickOutside);
    }, 10);
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('contextmenu', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      style={{ top: `${position.y}px`, left: `${position.x}px` }}
      className="fixed z-50 bg-white border border-[#D1D1D1] shadow-2xl rounded py-1 w-32 text-xs font-sans animate-in fade-in zoom-in-95 duration-100"
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onOpen(); onClose(); }}
        className="w-full px-3 py-1.5 hover:bg-[#F2F2F2] cursor-pointer flex justify-between items-center text-[#1A1A1A] transition-colors"
      >
        <span>打开原图</span>
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onDownload(); onClose(); }}
        className="w-full px-3 py-1.5 hover:bg-[#F2F2F2] cursor-pointer flex justify-between items-center text-[#1A1A1A] transition-colors"
      >
        <span>下载图片</span>
      </button>
      
      <button
        onClick={(e) => { e.stopPropagation(); onSelectToggle(); onClose(); }}
        className="w-full px-3 py-1.5 hover:bg-[#F2F2F2] cursor-pointer flex justify-between items-center text-[#1A1A1A] transition-colors"
      >
        <span>{isSelected ? '取消选择' : '进行选择'}</span>
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onViewInfo(); onClose(); }}
        className="w-full px-3 py-1.5 hover:bg-[#F2F2F2] cursor-pointer flex justify-between items-center text-[#1A1A1A] transition-colors"
      >
        <span>查看信息</span>
      </button>

      <div className="h-px bg-[#EEE] my-1" />
      
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); onClose(); }}
        className="w-full px-3 py-1.5 hover:bg-red-50 cursor-pointer flex justify-between items-center text-red-500 transition-colors"
      >
        <span>永久删除</span>
        <span className="text-xs text-red-400">Del</span>
      </button>
    </div>
  );
}
