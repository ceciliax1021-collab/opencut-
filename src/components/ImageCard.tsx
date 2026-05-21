import React, { useState, useRef, useEffect } from 'react';
import { UploadedImage, Group } from '../types';
import { Check, Edit2, Folder, Tag } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ImageCardProps {
  key?: React.Key;
  image: UploadedImage;
  isSelected: boolean;
  isCopied: boolean;
  isSelectionMode?: boolean;
  onClick: (e: React.MouseEvent) => void;
  onToggleSelect?: (image: UploadedImage) => void;
  onContextMenu: (e: React.MouseEvent, image: UploadedImage) => void;
  groups: Group[];
  onRenameImage: (id: string, newName: string) => Promise<void>;
  onMoveImage: (id: string, targetGroupId: string) => Promise<void>;
}

export function ImageCard({
  image,
  isSelected,
  isCopied,
  isSelectionMode,
  onClick,
  onToggleSelect,
  onContextMenu,
  groups,
  onRenameImage,
  onMoveImage,
}: ImageCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(image.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditNameValue(image.name);
  }, [image.name]);

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const handleNameSave = async () => {
    setIsEditingName(false);
    if (editNameValue.trim() && editNameValue !== image.name) {
      await onRenameImage(image.id, editNameValue.trim());
    } else {
      setEditNameValue(image.name);
    }
  };

  const currentGroup = groups.find(g => g.id === image.groupId) || { name: '默认分类' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className={`image-card-item group relative bg-white border cursor-pointer select-none flex flex-col ${
        isSelected 
          ? 'border-2 border-[#191919] rounded-lg p-2 shadow-sm ring-4 ring-[#191919]/10' 
          : 'border-[#D1D1D1] rounded-lg p-2 hover:border-[#191919]/50 hover:ring-4 hover:ring-[#191919]/5 hover:scale-[1.01] hover:shadow-md z-0 hover:z-10'
      } transition-all duration-150`}
      data-id={image.id}
      onClick={onClick}
      onContextMenu={(e) => onContextMenu(e, image)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {}
      <div className="aspect-video bg-[#F9F9F9] border border-[#EBEBEB] flex items-center justify-center overflow-hidden mb-2 rounded relative">
        <img
          src={image.url}
          alt={image.name}
          loading="lazy"
          className="max-w-full max-h-full object-contain"
          draggable={false}
        />
        
        {}
        <AnimatePresence>
          {isCopied && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="absolute inset-0 bg-emerald-500/90 flex flex-col items-center justify-center text-white z-20 shadow-inner select-none pointer-events-none"
            >
              <motion.div
                initial={{ scale: 0.5, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0.5 }}
                transition={{ type: 'spring', stiffness: 350, damping: 20 }}
                className="mb-1"
              >
                <Check className="w-8 h-8 stroke-[3]" />
              </motion.div>
              <span className="font-sans text-xs uppercase font-bold tracking-widest text-[#FFFFFF]">已存入剪贴板</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {}
      <div className="flex flex-col gap-1 select-text">
        {isEditingName ? (
          <input
            ref={nameInputRef}
            type="text"
            value={editNameValue}
            onChange={(e) => setEditNameValue(e.target.value)}
            onBlur={handleNameSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNameSave();
              if (e.key === 'Escape') {
                setEditNameValue(image.name);
                setIsEditingName(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-xs leading-tight w-full px-1 border-b border-[#191919] focus:outline-none bg-neutral-100"
          />
        ) : (
          <div className="flex items-center justify-between gap-1 group/name">
            <span 
              title="双击进行名称重命名"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditingName(true);
              }}
              className="font-mono text-xs leading-tight truncate text-[#1A1A1A] font-semibold flex-1"
            >
              {image.name}
            </span>
            <button
              title="重命名"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingName(true);
              }}
              className="opacity-0 group-hover/name:opacity-100 group-hover:opacity-100 p-0.5 rounded text-[#999999] hover:text-[#191919] transition-all hover:bg-gray-100"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        
        {}
        <div className="flex items-center justify-between text-xs text-[#999999] font-mono leading-none select-none">
          <span>{new Date(image.createdAt).toLocaleDateString()}</span>
          
          {}
          <div 
            className="relative flex items-center bg-[#F3F3F3] hover:bg-neutral-100 text-[#666666] hover:text-[#191919] px-1.5 py-0.5 rounded border border-[#E0E0E0] hover:border-neutral-300 transition-colors cursor-pointer gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <Folder className="w-3 h-3 shrink-0" />
            <span className="truncate max-w-[70px] font-sans font-medium text-xs">{currentGroup.name}</span>
            <select
              value={image.groupId}
              onChange={(e) => onMoveImage(image.id, e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full"
            >
              {groups.map(group => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {}
      {(isSelected || isHovered || isSelectionMode) && (
        <div 
          onClick={(e) => {
            if (onToggleSelect) {
              e.stopPropagation();
              onToggleSelect(image);
            }
          }}
          className={`absolute top-2 right-2 w-5.5 h-5.5 rounded-full border-2 transition-all duration-150 z-10 flex items-center justify-center shadow-sm ${
            isSelected 
              ? 'bg-[#191919] border-white text-white scale-110' 
              : 'bg-white border-gray-300 text-gray-400 hover:bg-[#191919] hover:border-[#191919] hover:text-white hover:scale-110'
          }`}
        >
          <svg 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="4" 
            className={`w-3 h-3 transition-opacity duration-150 ${
              isSelected ? 'opacity-100' : 'opacity-0 hover:!opacity-100'
            }`}
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )}
    </motion.div>
  );
}
