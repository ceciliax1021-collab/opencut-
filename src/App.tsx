import React, { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Group, UploadedImage, TextClip } from './types';
import { ImageCard } from './components/ImageCard';
import { TextCard } from './components/TextCard';
import { ContextMenu } from './components/ContextMenu';
import {
  getImages,
  getTexts,
  saveText as storeText,
  togglePinText,
  deleteText as removeText,
  uploadImage,
  deleteImage as removeImage,
  renameImage,
  moveImages,
  createGroup,
  renameGroup,
  deleteGroup,
  updateText,
  copyImageToClipboard,
  copyTextToClipboard as writeTextToClipboard,
  openImagePath,
  onClipUpdated,
  resolveImageUrl,
  quitApp,
  checkSmartCleanup,
  addDeletedContentToCleanup,
  getSmartCleanupConfig,
  saveSmartCleanupConfig,
  type SmartCleanupConfig,
  type CleanupRule,
} from './lib/local';
import {
  Copy,
  Trash2,
  Image as ImageIcon,
  Upload,
  Pin,
  Folder,
  Plus,
  Edit2,
  ChevronDown,
  Settings,
  ChevronLeft,
  Search,
  Sparkles,
  LayoutGrid,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type TextSortMode = 'time-desc' | 'time-asc';
type TextGroupMode = 'none' | 'day' | 'week';

interface TextGroup {
  label: string;
  key: string;
  texts: TextClip[];
}

function groupTexts(texts: TextClip[], mode: TextGroupMode): TextGroup[] {
  if (mode === 'none') return [{ label: '全部', key: 'all', texts }];

  if (mode === 'week') {
    const now = new Date();
    const getWeekStart = (date: Date) => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const currentWeekStart = getWeekStart(now);
    const groups: TextGroup[] = [];
    const thisWeek: TextClip[] = [];
    const lastWeek: TextClip[] = [];
    const twoWeeksAgo: TextClip[] = [];
    const older: TextClip[] = [];

    for (const t of texts) {
      const tDate = new Date(t.createdAt);
      const tWeekStart = getWeekStart(tDate);
      const diffWeeks = Math.floor((currentWeekStart.getTime() - tWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));

      if (diffWeeks === 0) thisWeek.push(t);
      else if (diffWeeks === 1) lastWeek.push(t);
      else if (diffWeeks === 2) twoWeeksAgo.push(t);
      else older.push(t);
    }

    if (thisWeek.length) groups.push({ label: '本周', key: 'thisWeek', texts: thisWeek });
    if (lastWeek.length) groups.push({ label: '上周', key: 'lastWeek', texts: lastWeek });
    if (twoWeeksAgo.length) groups.push({ label: '两周前', key: 'twoWeeksAgo', texts: twoWeeksAgo });
    if (older.length) groups.push({ label: '更早', key: 'older', texts: older });

    return groups;
  }

  // Day mode
  const now = Date.now();
  const groups: TextGroup[] = [];

  const today: TextClip[] = [];
  const yesterday: TextClip[] = [];
  const within3Days: TextClip[] = [];
  const withinWeek: TextClip[] = [];
  const withinMonth: TextClip[] = [];
  const older: TextClip[] = [];

  for (const t of texts) {
    const diff = now - t.createdAt;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) today.push(t);
    else if (days === 1) yesterday.push(t);
    else if (days <= 3) within3Days.push(t);
    else if (days <= 7) withinWeek.push(t);
    else if (days <= 30) withinMonth.push(t);
    else older.push(t);
  }

  if (today.length) groups.push({ label: '今天', key: 'today', texts: today });
  if (yesterday.length) groups.push({ label: '昨天', key: 'yesterday', texts: yesterday });
  if (within3Days.length) groups.push({ label: '三天内', key: 'within3Days', texts: within3Days });
  if (withinWeek.length) groups.push({ label: '一周内', key: 'withinWeek', texts: withinWeek });
  if (withinMonth.length) groups.push({ label: '一个月内', key: 'withinMonth', texts: withinMonth });
  if (older.length) groups.push({ label: '更早', key: 'older', texts: older });

  return groups;
}

export default function App() {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, image: UploadedImage } | null>(null);
  const [toast, setToast] = useState<{ message: string, visible: boolean }>({ message: '', visible: false });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainScrollRef = useRef<HTMLElement>(null);
  const scrollRestoreRef = useRef<{ top: number; left: number } | null>(null);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [activeGroupMenuId, setActiveGroupMenuId] = useState<string | null>(null);
  const [isBatchMoveMenuOpen, setIsBatchMoveMenuOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<'image' | 'text'>('text');
  const [showTextNewForm, setShowTextNewForm] = useState(false);

  const [texts, setTexts] = useState<TextClip[]>([]);
  const [newTextContent, setNewTextContent] = useState('');
  const [selectedTextIds, setSelectedTextIds] = useState<Set<string>>(new Set());
  const [isTextSelectMode, setIsTextSelectMode] = useState(false);
  const [editingText, setEditingText] = useState<TextClip | null>(null);
  const [editingTextContent, setEditingTextContent] = useState('');
  const [textContextMenu, setTextContextMenu] = useState<{ x: number, y: number, text: TextClip } | null>(null);
  const [textCleanupDialog, setTextCleanupDialog] = useState<{
    title: string;
    clips: TextClip[];
    selectedIds: Set<string>;
  } | null>(null);
  const [smartCleanupDialog, setSmartCleanupDialog] = useState<{
    clips: TextClip[];
    selectedIds: Set<string>;
    config: SmartCleanupConfig;
  } | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedTextId, setCopiedTextId] = useState<string | null>(null);

  // Text sort & group state
  const [textSortMode, setTextSortMode] = useState<TextSortMode>('time-desc');
  const [textGroupMode, setTextGroupMode] = useState<TextGroupMode>('none');
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [showCleanupMenu, setShowCleanupMenu] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroupCollapse = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (message: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ message, visible: true });

    toastTimeoutRef.current = setTimeout(() => {
      setToast({ message: '', visible: false });
    }, 1000);
  };

  const loadImages = async () => {
    try {
      const data = await getImages();
      setGroups(data.groups || []);
      setImages(data.images || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadTexts = async () => {
    try {
      const data = await getTexts();
      setTexts(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadImages();
    loadTexts();

    let unlisten: (() => void) | undefined;
    onClipUpdated((kind) => {
      if (kind === 'image') loadImages();
      else loadTexts();
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    const el = mainScrollRef.current;
    if (el) {
      scrollRestoreRef.current = {
        top: el.scrollTop,
        left: el.scrollLeft,
      };
    }
    setIsSidebarCollapsed(collapsed);
  }, []);

  useLayoutEffect(() => {
    const target = scrollRestoreRef.current;
    if (!target) return;

    const el = mainScrollRef.current;
    if (!el) {
      scrollRestoreRef.current = null;
      return;
    }

    const restore = () => {
      el.scrollTop = target.top;
      el.scrollLeft = target.left;
    };

    restore();
    const raf = requestAnimationFrame(restore);
    const timer = window.setTimeout(restore, 320);

    scrollRestoreRef.current = null;

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [isSidebarCollapsed]);

  const saveTextClip = async (content: string) => {
    if (!content || !content.trim()) return;
    try {
      const newClip = await storeText(content);
      setTexts(prev => {
        const key = content.trim();
        const withoutDupes = prev.filter(t => t.content.trim() !== key);
        return [newClip, ...withoutDupes];
      });
      setShowTextNewForm(false);
      setNewTextContent('');
      showToast('文本已保存');
    } catch (e) {
      console.error(e);
      showToast('文本保存失败');
    }
  };

  const handleTogglePinText = async (text: TextClip) => {
    try {
      const updated = await togglePinText(text.id);
      setTexts(prev => {
        const mapped = prev.map(t => t.id === text.id ? updated : t);
        const pinned = mapped.filter(t => t.isPinned);
        const unpinned = mapped.filter(t => !t.isPinned);
        return [...pinned, ...unpinned];
      });
    } catch (e) {
      console.error(e);
      showToast('系统操作失败');
    }
  };

  const deleteText = async (id: string, content?: string) => {
    try {
      // Add to smart cleanup history if content provided
      if (content) {
        addDeletedContentToCleanup(content).catch(() => {});
      }
      await removeText(id);
      setTexts(prev => prev.filter(t => t.id !== id));
      setSelectedTextIds(prev => {
        const updated = new Set(prev);
        updated.delete(id);
        return updated;
      });
      showToast('文本已删除');
    } catch (e) {
      console.error(e);
      showToast('删除失败');
    }
  };

  const getClipLength = (text: TextClip) => Array.from(text.content.trim()).length;

  const openTextCleanupDialog = () => {
    const clips = texts.filter(t => getClipLength(t) <= 5);
    if (clips.length === 0) {
      showToast('没有符合条件的文本剪贴');
      return;
    }

    setTextCleanupDialog({
      title: '清除 5 字内的文本板',
      clips,
      selectedIds: new Set(clips.map(clip => clip.id)),
    });
  };

  const confirmTextCleanup = async () => {
    if (!textCleanupDialog) return;
    const ids = Array.from(textCleanupDialog.selectedIds) as string[];
    if (ids.length === 0) {
      setTextCleanupDialog(null);
      showToast('没有选择要清空的文本');
      return;
    }

    try {
      // Add deleted content to cleanup history
      for (const clip of textCleanupDialog.clips) {
        if (textCleanupDialog.selectedIds.has(clip.id)) {
          addDeletedContentToCleanup(clip.content).catch(() => {});
        }
      }
      await Promise.all(ids.map(id => removeText(id)));
      setTexts(prev => prev.filter(text => !textCleanupDialog.selectedIds.has(text.id)));
      setSelectedTextIds(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });
      setTextCleanupDialog(null);
      showToast(`已清空 ${ids.length} 条文本剪贴`);
    } catch (e) {
      console.error(e);
      showToast('清空失败');
    }
  };

  // Smart Cleanup
  const openSmartCleanup = async () => {
    try {
      const config = await getSmartCleanupConfig();
      const matchedClips = await checkSmartCleanup();
      if (matchedClips.length === 0) {
        showToast('暂无需要智能清理的文本');
        return;
      }
      setSmartCleanupDialog({
        clips: matchedClips,
        selectedIds: new Set(matchedClips.map(c => c.id)),
        config,
      });
    } catch (e) {
      console.error(e);
      showToast('智能清理检查失败');
    }
  };

  const confirmSmartCleanup = async () => {
    if (!smartCleanupDialog) return;
    const ids = Array.from(smartCleanupDialog.selectedIds) as string[];
    if (ids.length === 0) {
      setSmartCleanupDialog(null);
      showToast('没有选择要清理的文本');
      return;
    }

    try {
      await Promise.all(ids.map(id => removeText(id)));
      setTexts(prev => prev.filter(text => !smartCleanupDialog.selectedIds.has(text.id)));
      setSelectedTextIds(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });
      setSmartCleanupDialog(null);
      showToast(`已智能清理 ${ids.length} 条文本`);
    } catch (e) {
      console.error(e);
      showToast('清理失败');
    }
  };

  const toggleSmartCleanupRule = async (ruleId: string) => {
    if (!smartCleanupDialog) return;
    const newConfig = { ...smartCleanupDialog.config };
    newConfig.rules = newConfig.rules.map(r => 
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r
    );
    try {
      await saveSmartCleanupConfig(newConfig);
      // Re-check
      const matchedClips = await checkSmartCleanup();
      setSmartCleanupDialog({
        clips: matchedClips,
        selectedIds: new Set(matchedClips.map(c => c.id)),
        config: newConfig,
      });
    } catch (e) {
      console.error(e);
    }
  };

  const excludeFromSmartCleanup = async (content: string) => {
    if (!smartCleanupDialog) return;
    const newConfig = { ...smartCleanupDialog.config };
    if (!newConfig.excluded_content.includes(content)) {
      newConfig.excluded_content.push(content);
    }
    // Also remove from selected
    const clipToRemove = smartCleanupDialog.clips.find(c => c.content.trim() === content);
    const newSelectedIds = new Set(smartCleanupDialog.selectedIds);
    if (clipToRemove) newSelectedIds.delete(clipToRemove.id);

    try {
      await saveSmartCleanupConfig(newConfig);
      const matchedClips = await checkSmartCleanup();
      setSmartCleanupDialog({
        clips: matchedClips,
        selectedIds: new Set(matchedClips.map(c => c.id)),
        config: newConfig,
      });
      showToast('已记住您的选择，下次不会再提示');
    } catch (e) {
      console.error(e);
    }
  };

  const uploadFiles = async (fileArray: FileList | File[]) => {
    const files = Array.from(fileArray).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;
    showToast('图片上传中...');
    
    const newImages: UploadedImage[] = [];
    for (const file of files) {
      try {
        const uploadedImg = await uploadImage(
          file,
          selectedGroupId && selectedGroupId !== 'all' ? selectedGroupId : undefined,
        );
        newImages.push(uploadedImg);
      } catch (err) {
        console.error(err);
      }
    }

    if (newImages.length === 0) {
      showToast('图片上传失败');
      return;
    }

    setImages(prev => {
      const updated = [...prev];
      let added = 0;
      let dupes = 0;

      for (const img of newImages) {
        const idx = updated.findIndex(existing => existing.id === img.id);
        if (idx !== -1) {
          dupes++;
          const [existing] = updated.splice(idx, 1);
          existing.createdAt = Date.now();

          if (selectedGroupId && selectedGroupId !== 'all') {
            existing.groupId = selectedGroupId;
          }
          updated.unshift(existing);
        } else {
          added++;
          updated.unshift({ ...img, createdAt: Date.now() });
        }
      }

      setTimeout(() => {
        if (added === 0 && dupes > 0) {
          showToast(`已将 ${dupes} 张重复图片置顶`);
        } else if (added > 0 && dupes > 0) {
          showToast(`成功保存 ${added} 张新图，${dupes} 张重复图片已置顶`);
        } else {
          showToast(files.length > 1 ? `成功导入 ${added} 张图片` : '图片成功保存到剪贴板');
        }
      }, 0);

      return updated;
    });
    
    const lastId = newImages[newImages.length - 1]?.id;
    if (lastId) setSelectedIds(new Set([lastId]));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files);
    }
    e.target.value = '';
  };

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const target = e.target;
    const isInInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }

    if (files.length > 0) {
      uploadFiles(files);
      setActiveTab('image');
      return;
    }

    if (isInInput) {
      return;
    }

    const textData = e.clipboardData.getData('text');
    if (textData && textData.trim()) {
      e.preventDefault();
      saveTextClip(textData);
      setActiveTab('text');
    }
  }, [selectedGroupId]);

  useEffect(() => {
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    
    const idsToDelete: string[] = Array.from(selectedIds);
    setImages(prev => prev.filter(img => !selectedIds.has(img.id)));
    setSelectedIds(new Set());
    
    for (const id of idsToDelete) {
      removeImage(id).catch(console.error);
    }
    showToast(`已删除 ${idsToDelete.length} 张图片。`);
  };

  const deleteSelectedTexts = async () => {
    if (selectedTextIds.size === 0) return;
    const idsToDelete: string[] = Array.from(selectedTextIds);
    
    // Save deleted content to smart cleanup
    for (const t of texts) {
      if (selectedTextIds.has(t.id)) {
        addDeletedContentToCleanup(t.content).catch(() => {});
      }
    }
    
    setTexts(prev => prev.filter(t => !selectedTextIds.has(t.id)));
    setSelectedTextIds(new Set());
    
    for (const id of idsToDelete) {
      removeText(id).catch(console.error);
    }
    showToast(`已删除 ${idsToDelete.length} 条文本`);
  };

  const copyToClipboard = async (image: UploadedImage) => {
    setCopiedId(image.id);
    showToast('图片已复制到剪贴板');
    setTimeout(() => setCopiedId(null), 850);

    try {
      await copyImageToClipboard(image.id);
    } catch (err) {
      console.error('clipboard write failed', err);
    }
  };

  const copyTextToClipboard = async (textClip: TextClip) => {
    setCopiedTextId(textClip.id);
    showToast('文本已复制到剪贴板');
    setTimeout(() => setCopiedTextId(null), 850);

    try {
      await writeTextToClipboard(textClip.content);
    } catch (err) {
      console.error(err);
    }
  };

  const copySelectedTexts = async () => {
    if (selectedTextIds.size === 0) return;
    const items = texts.filter(t => selectedTextIds.has(t.id));
    if (items.length === 0) return;
    
    const mergedText = items.map(t => t.content).join('\n---\n');
    try {
      await writeTextToClipboard(mergedText);
      showToast(`已合并复制选中的 ${items.length} 条文本`);
    } catch (err) {
      console.error(err);
      showToast('合并复制失败');
    }
  };

  const copyMultiple = async () => {
    if (selectedIds.size === 0) return;
    if (selectedIds.size === 1) {
      const img = images.find(i => selectedIds.has(i.id));
      if (img) copyToClipboard(img);
      return;
    }
    
    const firstId = Array.from(selectedIds)[0];
    const img = images.find(i => i.id === firstId);
    if (img) {
      await copyToClipboard(img);
      showToast('已为您合并复制首张选中图片');
    }
  };

  const handleToggleSelect = (image: UploadedImage) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(image.id)) newSet.delete(image.id);
    else newSet.add(image.id);
    setSelectedIds(newSet);
  };

  const handleToggleSelectText = (text: TextClip) => {
    const newSet = new Set(selectedTextIds);
    if (newSet.has(text.id)) newSet.delete(text.id);
    else newSet.add(text.id);
    setSelectedTextIds(newSet);
  };

  const handleImageClick = (e: React.MouseEvent, image: UploadedImage) => {
    const target = e.target as HTMLElement;
    if (target.closest('select, input, button')) return;

    if (selectedIds.size > 0) {
      handleToggleSelect(image);
      return;
    }
    copyToClipboard(image);
  };

  const handleTextClick = (e: React.MouseEvent, text: TextClip) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, select, input, svg')) return;
    const selectedText = window.getSelection()?.toString();
    if (target.closest('.text-card-content') && selectedText && selectedText.trim()) return;

    if (isTextSelectMode || selectedTextIds.size > 0) {
      handleToggleSelectText(text);
      return;
    }
    copyTextToClipboard(text);
  };

  const clearImageSelection = () => {
    setSelectedIds(new Set());
    setIsBatchMoveMenuOpen(false);
    setContextMenu(null);
  };

  const clearTextSelection = () => {
    setSelectedTextIds(new Set());
    setIsTextSelectMode(false);
  };

  const handleTextContextMenu = (e: React.MouseEvent, text: TextClip) => {
    e.preventDefault();
    const nextSelection = new Set(selectedTextIds);
    if (selectedTextIds.size > 0 && !nextSelection.has(text.id)) {
      nextSelection.add(text.id);
      setSelectedTextIds(nextSelection);
    }
    setTextContextMenu({ x: e.clientX, y: e.clientY, text });
  };

  const handleSaveEditText = async () => {
    if (!editingText || !editingTextContent.trim()) return;
    try {
      const updated = await updateText(editingText.id, editingTextContent);
      setTexts(prev => prev.map(t => t.id === editingText.id ? updated : t));
      setEditingText(null);
      showToast('文本剪贴修改成功');
    } catch (err) {
      console.error(err);
      showToast('保存修改失败');
    }
  };

  const exportTextAsFile = (text: TextClip, format: 'txt' | 'md' | 'html' | 'docx') => {
    let content = '';
    let mimeType = '';
    let fileExtension = '';
    const dateStr = new Date(text.createdAt).toLocaleDateString().replace(/\//g, '-');
    const fileName = `clip-${text.id.substring(0, 6)}-${dateStr}`;

    switch (format) {
      case 'txt':
        content = text.content;
        mimeType = 'text/plain;charset=utf-8';
        fileExtension = 'txt';
        break;
      case 'md':
        content = `# Text Clip (Copied on ${new Date(text.createdAt).toLocaleString()})\n\n${text.content}`;
        mimeType = 'text/markdown;charset=utf-8';
        fileExtension = 'md';
        break;
      case 'html':
        content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Clipping Details</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1a1a1a; max-width: 650px; margin: 0 auto; line-height: 1.6; }
    .meta { font-size: 12px; color: #888; border-bottom: 1px solid #eee; padding-bottom: 12px; margin-bottom: 24px; font-family: monospace; }
    .content { white-space: pre-wrap; font-size: 15px; background: #f9f9f9; padding: 20px; border-radius: 8px; border: 1px solid #eaeaea; font-family: monospace; }
  </style>
</head>
<body>
  <div class="meta">Saved at: ${new Date(text.createdAt).toLocaleString()}</div>
  <div class="content">${text.content.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')}</div>
</body>
</html>`;
        mimeType = 'text/html;charset=utf-8';
        fileExtension = 'html';
        break;
      case 'docx':
        content = `<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
  </w:WordDocument>
</xml>
<![endif]-->
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'>
<head>
  <title>Exported Doc</title>
  <style>
    p { font-family: "Calibri", "Arial", sans-serif; font-size: 11pt; line-height: 1.15; margin: 0 0 10pt; }
    .meta { font-size: 9pt; color: #7f7f7f; margin-bottom: 12pt; }
  </style>
</head>
<body>
  <div class="meta">Saved at: ${new Date(text.createdAt).toLocaleString()}</div>
  <div>${text.content.split('\n').map(line => `<p>${line.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')}</p>`).join('')}</div>
</body>
</html>`;
        mimeType = 'application/msword;charset=utf-8';
        fileExtension = 'docx';
        break;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}.${fileExtension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`成功导出为 ${format.toUpperCase()} 文件`);
  };

  const handleContextMenu = (e: React.MouseEvent, image: UploadedImage) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, image });
  };

  const toggleSelectAll = () => {
    const visibleIds = filteredImages.map(img => img.id);
    const allSelected = visibleIds.every(id => selectedIds.has(id));
    
    const newSet = new Set(selectedIds);
    if (allSelected) {
      visibleIds.forEach(id => newSet.delete(id));
    } else {
      visibleIds.forEach(id => newSet.add(id));
    }
    setSelectedIds(newSet);
  };

  const handleCreateGroup = async (name: string) => {
    if (!name.trim()) return;
    try {
      const newGroup = await createGroup(name.trim());
      setGroups(prev => [...prev, newGroup]);
      setSelectedGroupId(newGroup.id);
      showToast(`已创建"${newGroup.name}"分类`);
    } catch (e) {
      console.error(e);
      showToast('新增分类失败');
    }
  };

  const handleRenameGroup = async (id: string, name: string) => {
    if (!name.trim()) return;
    try {
      const updated = await renameGroup(id, name.trim());
      setGroups(prev => prev.map(g => g.id === id ? updated : g));
      setEditingGroupId(null);
      showToast('分类名称修改成功');
    } catch (e) {
      console.error(e);
      showToast('分类修改失败');
    }
  };

  const handleDeleteGroup = async (id: string) => {
    try {
      await deleteGroup(id);
      setGroups(prev => prev.filter(g => g.id !== id));
      setImages(prev => prev.map(img => img.groupId === id ? { ...img, groupId: 'default' } : img));
      if (selectedGroupId === id) {
        setSelectedGroupId('all');
      }
      showToast('分类已收回，组内图片已安全挪回默认分类');
    } catch (e) {
      console.error(e);
      showToast('删除分类失败');
    }
  };

  const handleRenameImage = async (id: string, newName: string) => {
    try {
      await renameImage(id, newName);
      setImages(prev => prev.map(img => img.id === id ? { ...img, name: newName } : img));
      showToast('修改名称成功');
    } catch (e) {
      console.error(e);
      showToast('重命名失败');
    }
  };

  const handleMoveImage = async (id: string, targetGroupId: string) => {
    try {
      await moveImages([id], targetGroupId);
      setImages(prev => prev.map(img => img.id === id ? { ...img, groupId: targetGroupId } : img));
      showToast('移动分类成功');
    } catch (e) {
      console.error(e);
      showToast('移动分类失败');
    }
  };

  const handleMoveMultipleImages = async (targetGroupId: string) => {
    if (selectedIds.size === 0) return;
    const ids: string[] = Array.from(selectedIds);
    try {
      await moveImages(ids, targetGroupId);
      setImages(prev => prev.map(img => ids.includes(img.id) ? { ...img, groupId: targetGroupId } : img));
      setSelectedIds(new Set());
      const destGroup = groups.find(g => g.id === targetGroupId) || { name: '默认分类' };
      showToast(`成功将 ${ids.length} 张图片移动至"${destGroup.name}"`);
    } catch (e) {
      console.error(e);
      showToast('批量移动失败');
    }
  };

  const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ x: number, y: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, select, .context-menu, [role="button"]')) {
      return;
    }
    if (target.closest('.image-card-item') || target.closest('.text-card-item')) {
      return;
    }

    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (activeTab === 'image') {
        setSelectedIds(new Set());
      } else {
        setSelectedTextIds(new Set());
      }
    }

    setDragStart({ x: e.clientX, y: e.clientY });
    setDragEnd({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!dragStart) return;

    const handleMouseMove = (e: MouseEvent) => {
      setDragEnd({ x: e.clientX, y: e.clientY });

      const x1 = Math.min(dragStart.x, e.clientX);
      const y1 = Math.min(dragStart.y, e.clientY);
      const x2 = Math.max(dragStart.x, e.clientX);
      const y2 = Math.max(dragStart.y, e.clientY);

      const selector = activeTab === 'image' ? '.image-card-item' : '.text-card-item';
      const items = document.querySelectorAll(selector);
      const newlySelected = new Set<string>();

      items.forEach(item => {
        const rect = item.getBoundingClientRect();
        const intersects = !(
          rect.right < x1 ||
          rect.left > x2 ||
          rect.bottom < y1 ||
          rect.top > y2
        );

        if (intersects) {
          const id = item.getAttribute('data-id');
          if (id) {
            newlySelected.add(id);
          }
        }
      });

      if (activeTab === 'image') {
        setSelectedIds(newlySelected);
      } else {
        setSelectedTextIds(newlySelected);
      }
    };

    const handleMouseUp = () => {
      setDragStart(null);
      setDragEnd(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragStart, activeTab]);

  const filteredImages = images.filter(img => {
    const matchesSearch = img.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGroup = selectedGroupId === 'all' || img.groupId === selectedGroupId;
    return matchesSearch && matchesGroup;
  });

  const visibleImages = useMemo(
    () =>
      filteredImages.map((img) => ({
        ...img,
        url: resolveImageUrl(img.url),
      })),
    [filteredImages],
  );

  // Sort and group texts
  const processedTexts = useMemo(() => {
    let sorted = [...texts].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return textSortMode === 'time-desc' 
        ? b.createdAt - a.createdAt 
        : a.createdAt - b.createdAt;
    });

    if (textGroupMode === 'none') {
      return { groups: [{ label: '全部', key: 'all', texts: sorted }], flat: sorted };
    }

    const gs = groupTexts(sorted, textGroupMode);
    return { groups: gs, flat: sorted };
  }, [texts, textSortMode, textGroupMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        if (contextMenu || textContextMenu || textCleanupDialog || smartCleanupDialog) {
          setContextMenu(null);
          setTextContextMenu(null);
          setTextCleanupDialog(null);
          setSmartCleanupDialog(null);
          return;
        }
        if (activeTab === 'image' && selectedIds.size > 0) {
          clearImageSelection();
          return;
        }
        if (activeTab === 'text' && (isTextSelectMode || selectedTextIds.size > 0)) {
          clearTextSelection();
        }
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (activeTab === 'image' && selectedIds.size > 0) {
          setContextMenu(null);
          deleteSelected();
        } else if (activeTab === 'text' && selectedTextIds.size > 0) {
          deleteSelectedTexts();
        }
      }
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        if (activeTab === 'image') {
          const visibleIds = filteredImages.map(img => img.id);
          setSelectedIds(new Set(visibleIds));
        } else if (activeTab === 'text') {
          setSelectedTextIds(new Set(texts.map(t => t.id)));
        }
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        if (activeTab === 'image' && selectedIds.size > 0) {
          e.preventDefault();
          copyMultiple();
        } else if (activeTab === 'text' && selectedTextIds.size > 0) {
          e.preventDefault();
          copySelectedTexts();
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'q') {
        e.preventDefault();
        quitApp();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        Promise.all([loadImages(), loadTexts()]).then(() => {
          showToast('已刷新');
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, selectedTextIds, images, texts, activeTab, selectedGroupId, copyMultiple, copySelectedTexts, filteredImages, isTextSelectMode, contextMenu, textContextMenu, textCleanupDialog, smartCleanupDialog]);

  useEffect(() => {
    if (!textContextMenu && !contextMenu) return;

    const closeFloatingMenus = () => {
      setTextContextMenu(null);
      setContextMenu(null);
    };

    window.addEventListener('scroll', closeFloatingMenus, true);
    window.addEventListener('resize', closeFloatingMenus);
    window.addEventListener('blur', closeFloatingMenus);

    return () => {
      window.removeEventListener('scroll', closeFloatingMenus, true);
      window.removeEventListener('resize', closeFloatingMenus);
      window.removeEventListener('blur', closeFloatingMenus);
    };
  }, [textContextMenu, contextMenu]);

  return (
    <div className="h-screen w-full bg-[#F2F2F2] text-[#1A1A1A] font-sans flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-16 bg-white border-b border-neutral-100 px-6 grid grid-cols-3 items-center z-25 shrink-0 select-none shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
        {/* Left: Logo */}
        <div className="flex items-center gap-3.5 justify-start">
          <div className="flex items-center gap-2">
            <div className="opencut-mark" aria-hidden="true">*</div>
            <div className="font-sans text-base font-bold tracking-tight text-neutral-900">OpenCut</div>
          </div>
          <div className="h-4 w-px bg-neutral-200"></div>
          <div className="text-[11px] font-sans font-medium text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-full flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
            <span>{activeTab === 'image' ? `图片 ${filteredImages.length} 张` : `文本 ${texts.length} 条`}</span>
          </div>
        </div>

        {/* Center: Tabs */}
        <div className="flex items-center justify-center gap-3.5 select-none font-sans">
          <button 
            id="tab-button-image"
            onClick={() => {
              setActiveTab('image');
              setSearchQuery('');
              setEditingText(null);
              setCopiedTextId(null);
            }}
            className={`transition-all duration-200 cursor-pointer ${
              activeTab === 'image' 
                ? 'text-neutral-900 font-bold text-sm'
                : 'text-neutral-400 hover:text-neutral-700 font-medium text-sm'
            }`}
          >
            图片
          </button>
          <span className="text-neutral-300 select-none text-sm">/</span>
          <button 
            id="tab-button-text"
            onClick={() => {
              setActiveTab('text');
              setSearchQuery('');
              setCopiedId(null);
              setContextMenu(null);
              setIsBatchMoveMenuOpen(false);
            }}
            className={`transition-all duration-200 cursor-pointer ${
              activeTab === 'text' 
                ? 'text-neutral-900 font-bold text-sm'
                : 'text-neutral-400 hover:text-neutral-700 font-medium text-sm'
            }`}
          >
            文本
          </button>
        </div>
        
        {/* Right: Actions */}
        <div className="flex items-center select-none font-sans justify-end">
          {activeTab === 'image' ? (
            <button
              id="action-btn-import"
              onClick={() => fileInputRef.current?.click()}
              className="h-9 px-4 rounded-full bg-[#191919] text-white hover:bg-black text-xs font-bold transition-all flex items-center gap-2 shadow-sm cursor-pointer active:scale-[0.97]"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>本地导入</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              {/* View button (unified sort + group) */}
              <div className="relative">
                <button
                  onClick={() => { setShowViewMenu(!showViewMenu); setShowCleanupMenu(false); }}
                  className="h-9 px-3 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>视图</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${showViewMenu ? 'rotate-180' : ''}`} />
                </button>
                {showViewMenu && (
                  <>
                    <div className="fixed inset-0 z-[70] cursor-default" onClick={() => setShowViewMenu(false)} />
                    <div className="absolute right-0 top-full mt-2 z-[90] w-44 rounded-xl border border-neutral-200 bg-white p-2 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.3)]">
                      <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-2 py-1.5">排序方式</div>
                      <button
                        onClick={() => { setTextSortMode('time-desc'); setShowViewMenu(false); }}
                        className={`w-full rounded-lg px-3 py-2 text-xs font-bold text-left transition-colors flex items-center justify-between ${
                          textSortMode === 'time-desc' ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-600 hover:bg-neutral-50'
                        }`}
                      >
                        最新优先
                        {textSortMode === 'time-desc' && <Check className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={() => { setTextSortMode('time-asc'); setShowViewMenu(false); }}
                        className={`w-full rounded-lg px-3 py-2 text-xs font-bold text-left transition-colors flex items-center justify-between ${
                          textSortMode === 'time-asc' ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-600 hover:bg-neutral-50'
                        }`}
                      >
                        最早优先
                        {textSortMode === 'time-asc' && <Check className="w-3 h-3" />}
                      </button>
                      <div className="h-px bg-neutral-100 my-1.5" />
                      <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-2 py-1.5">显示方式</div>
                      <button
                        onClick={() => { setTextGroupMode('none'); setShowViewMenu(false); }}
                        className={`w-full rounded-lg px-3 py-2 text-xs font-bold text-left transition-colors flex items-center justify-between ${
                          textGroupMode === 'none' ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-600 hover:bg-neutral-50'
                        }`}
                      >
                        不分组
                        {textGroupMode === 'none' && <Check className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={() => { setTextGroupMode('day'); setShowViewMenu(false); }}
                        className={`w-full rounded-lg px-3 py-2 text-xs font-bold text-left transition-colors flex items-center justify-between ${
                          textGroupMode === 'day' ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-600 hover:bg-neutral-50'
                        }`}
                      >
                        按天分组
                        {textGroupMode === 'day' && <Check className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={() => { setTextGroupMode('week'); setShowViewMenu(false); }}
                        className={`w-full rounded-lg px-3 py-2 text-xs font-bold text-left transition-colors flex items-center justify-between ${
                          textGroupMode === 'week' ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-600 hover:bg-neutral-50'
                        }`}
                      >
                        按周分组
                        {textGroupMode === 'week' && <Check className="w-3 h-3" />}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Action buttons + Cleanup dropdown */}
              <div className="flex items-center gap-1.5 rounded-lg bg-white/85 border border-neutral-200/80 shadow-[0_4px_12px_-8px_rgba(0,0,0,0.15)] p-1">
                <button
                  type="button"
                  title="新增备忘"
                  onClick={() => {
                    setShowTextNewForm(true);
                    setEditingText(null);
                  }}
                  className="w-8 h-8 rounded-md bg-[#191919] text-white flex items-center justify-center hover:bg-black transition-colors cursor-pointer border-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>

                <div className="relative">
                  <button
                    type="button"
                    title="更多操作"
                    onClick={() => { setShowCleanupMenu(!showCleanupMenu); setShowViewMenu(false); }}
                    className="w-8 h-8 rounded-md bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50 flex items-center justify-center transition-all cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                  {showCleanupMenu && (
                    <>
                      <div className="fixed inset-0 z-[70] cursor-default" onClick={() => setShowCleanupMenu(false)} />
                      <div className="absolute right-0 top-full mt-2 z-[90] w-44 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.3)]">
                        <button
                          onClick={() => { openSmartCleanup(); setShowCleanupMenu(false); }}
                          className="w-full rounded-lg px-3 py-2.5 text-xs font-bold text-left transition-colors text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 flex items-center gap-2.5"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-neutral-500" />
                          <span>智能清理</span>
                        </button>
                        <div className="h-px bg-neutral-100 mx-2" />
                        <button
                          onClick={() => { openTextCleanupDialog(); setShowCleanupMenu(false); }}
                          className="w-full rounded-lg px-3 py-2.5 text-xs font-bold text-left transition-colors text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 flex items-center gap-2.5"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-neutral-400" />
                          <span>清理5字内文本</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileSelect} />
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar - Image only */}
        {activeTab === 'image' && (
          <div
            className={`transition-[width,margin,opacity] duration-300 ease-in-out flex flex-col shrink-0 overflow-hidden ${
              isSidebarCollapsed
                ? 'w-0 ml-0 mt-4 mb-4 opacity-0 pointer-events-none'
                : 'w-60 ml-6 mt-4 mb-4 opacity-100'
            }`}
          >
            <div className="flex-1 bg-white border border-neutral-100/60 rounded-2xl flex flex-col shadow-[0_16px_40px_-6px_rgba(0,0,0,0.06),_0_2px_8px_rgba(0,0,0,0.01)] h-full overflow-hidden">
              <div className="h-11 px-4 border-b border-neutral-100/60 flex items-center justify-between bg-white/40">
                <span className="text-xs font-bold tracking-wider text-neutral-700">截图分类</span>
                <button 
                  onClick={() => setSidebarCollapsed(true)}
                  className="text-neutral-400 hover:text-neutral-800 p-1 hover:bg-neutral-100/60 rounded-lg transition-all flex items-center justify-center"
                  title="收起分类"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2.5 space-y-1 scrollbar-none">
                <button
                  onClick={() => setSelectedGroupId('all')}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${
                    selectedGroupId === 'all'
                      ? 'bg-[#191919] text-white shadow-sm'
                      : 'text-neutral-500 hover:bg-neutral-100/60 hover:text-neutral-800'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <ImageIcon className={`w-3.5 h-3.5 shrink-0 ${selectedGroupId === 'all' ? 'text-white/90' : 'text-neutral-400'}`} />
                    <span className="truncate">全部图片</span>
                  </div>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold ${
                    selectedGroupId === 'all' ? 'bg-white/10 text-white/90' : 'bg-neutral-150 text-neutral-500'
                  }`}>
                    {images.length}
                  </span>
                </button>

                <button
                  onClick={() => setSelectedGroupId('default')}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${
                    selectedGroupId === 'default'
                      ? 'bg-[#191919] text-white shadow-sm'
                      : 'text-neutral-500 hover:bg-neutral-100/60 hover:text-neutral-800'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Folder className={`w-3.5 h-3.5 shrink-0 ${selectedGroupId === 'default' ? 'text-white/90' : 'text-neutral-400'}`} />
                    <span className="truncate">默认分类</span>
                  </div>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold ${
                    selectedGroupId === 'default' ? 'bg-white/10 text-white/90' : 'bg-neutral-150 text-neutral-500'
                  }`}>
                    {images.filter(img => img.groupId === 'default' || !img.groupId).length}
                  </span>
                </button>

                {groups.filter(g => g.id !== 'default').map(g => {
                  const count = images.filter(img => img.groupId === g.id).length;
                  const isEditing = editingGroupId === g.id;
                  const isSelected = selectedGroupId === g.id;

                  return (
                    <div
                      key={g.id}
                      className={`relative group/sidebar flex items-center justify-between px-1.5 py-1 rounded-xl transition-all ${
                        isSelected
                          ? 'bg-[#191919] text-white shadow-sm'
                          : 'text-neutral-500 hover:bg-neutral-100/60 hover:text-neutral-800'
                      }`}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setActiveGroupMenuId(g.id);
                      }}
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          defaultValue={g.name}
                          autoFocus
                          onBlur={(e) => handleRenameGroup(g.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameGroup(g.id, e.currentTarget.value);
                            if (e.key === 'Escape') setEditingGroupId(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full text-xs font-semibold bg-white text-neutral-900 px-3 py-1.5 rounded-lg border border-neutral-250 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 transition-all"
                        />
                      ) : (
                        <>
                          <button
                            onClick={() => setSelectedGroupId(g.id)}
                            className="flex-1 text-left px-2 py-1.5 text-xs font-bold truncate flex items-center gap-2"
                          >
                            <Folder className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white/90' : 'text-neutral-400'}`} />
                            <span className="truncate">{g.name}</span>
                          </button>
                          
                          <div className="flex items-center gap-1.5 pr-1 shrink-0 relative">
                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold group-hover/sidebar:hidden ${
                              isSelected ? 'bg-white/10 text-white/90' : 'bg-neutral-150 text-neutral-500'
                            }`}>
                              {count}
                            </span>
                            <button
                              title="分类选项"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveGroupMenuId(activeGroupMenuId === g.id ? null : g.id);
                              }}
                              className={`hidden group-hover/sidebar:flex p-1 rounded-lg items-center justify-center transition-all shrink-0 ${
                                isSelected ? 'text-white/80 hover:text-white hover:bg-white/10' : 'text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100'
                              }`}
                            >
                              <Settings className="w-3.5 h-3.5" />
                            </button>

                            {activeGroupMenuId === g.id && (
                              <>
                                <div 
                                  className="fixed inset-0 z-40 cursor-default" 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveGroupMenuId(null);
                                  }} 
                                />
                                <div 
                                  className="absolute right-0 top-full mt-1 bg-white border border-neutral-100 shadow-xl rounded-xl py-1.5 z-50 w-28 text-xs font-sans text-neutral-850 flex flex-col font-semibold select-none anim-fade"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    onClick={() => {
                                      setActiveGroupMenuId(null);
                                      setEditingGroupId(g.id);
                                    }}
                                    className="w-full text-left px-3 py-1.5 hover:bg-neutral-50 flex items-center gap-1.5 transition-colors font-semibold text-neutral-700 hover:text-neutral-900"
                                  >
                                    <Edit2 className="w-3.5 h-3.5 text-neutral-400" />
                                    <span>重命名分类</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      setActiveGroupMenuId(null);
                                      if (confirm(`确定要删除分类"${g.name}"吗？\n删除后，该分类下的图片将移回"默认分类"，不会被真的删除。`)) {
                                        handleDeleteGroup(g.id);
                                      }
                                    }}
                                    className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-655 flex items-center gap-1.5 transition-colors font-semibold border-t border-neutral-100/60 mt-1 pt-1.5"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                    <span>删除分类</span>
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="p-3 border-t border-neutral-100/40 bg-white/30">
                {isCreatingGroup ? (
                   <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="分类名称..."
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCreateGroup(newGroupName);
                          setNewGroupName('');
                          setIsCreatingGroup(false);
                        }
                        if (e.key === 'Escape') {
                          setNewGroupName('');
                          setIsCreatingGroup(false);
                        }
                      }}
                      autoFocus
                      className="w-full bg-white border border-neutral-250 focus:border-neutral-350 rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#191919]/10 transition-all font-semibold"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => {
                          setNewGroupName('');
                          setIsCreatingGroup(false);
                        }}
                        className="text-xs text-neutral-500 hover:text-neutral-800 bg-neutral-100 px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => {
                          handleCreateGroup(newGroupName);
                          setNewGroupName('');
                          setIsCreatingGroup(false);
                        }}
                        className="text-xs text-white bg-[#191919] hover:bg-black px-2.5 py-1 rounded-lg font-bold transition-all shadow-sm cursor-pointer"
                      >
                        确定
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsCreatingGroup(true)}
                    className="w-full py-2.5 text-xs text-neutral-600 hover:text-neutral-950 bg-transparent hover:bg-neutral-50/85 border border-neutral-200 hover:border-neutral-300 rounded-xl transition-all font-bold flex items-center justify-center gap-1 shadow-none cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新建分类</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Main content */}
        <main 
          ref={mainScrollRef}
          onMouseDown={handleMouseDown}
          className="flex-1 relative p-6 overflow-hidden overflow-y-auto select-none bg-[#F7F7F7] [overflow-anchor:auto]"
        >
          {/* Drag selection overlay */}
          {dragStart && dragEnd && (
            <div
              style={{
                position: 'fixed',
                left: `${Math.min(dragStart.x, dragEnd.x)}px`,
                top: `${Math.min(dragStart.y, dragEnd.y)}px`,
                width: `${Math.abs(dragStart.x - dragEnd.x)}px`,
                height: `${Math.abs(dragStart.y - dragEnd.y)}px`,
                backgroundColor: 'rgba(25, 25, 25, 0.08)',
                border: '1.5px solid rgb(25, 25, 25)',
                borderRadius: '3px',
                pointerEvents: 'none',
                zIndex: 9999,
              }}
            />
          )}

          {/* Sidebar expand button */}
          <AnimatePresence>
            {activeTab === 'image' && isSidebarCollapsed && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setSidebarCollapsed(false)}
                className="sticky top-4 left-0 z-30 w-fit mb-3 bg-white/80 backdrop-blur-md hover:bg-white p-2.5 rounded-xl shadow-lg border border-neutral-200/50 text-neutral-600 hover:text-[#191919] transition-all flex items-center gap-1.5 font-bold focus:outline-none select-none cursor-pointer text-xs"
                title="展开分类"
              >
                <Folder className="w-3.5 h-3.5 text-neutral-500" />
                <span>展开分类</span>
              </motion.button>
            )}
          </AnimatePresence>

          {activeTab === 'image' ? (
            images.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[65vh] text-[#999999]">
                <p className="font-sans text-xs tracking-widest text-[#999999] mb-2 uppercase select-none">暂无图片</p>
                <p className="font-sans text-xs text-center line-clamp-2 select-none">你可以复制任意图片或截图，在此按 Ctrl+V 直接导入</p>
              </div>
            ) : filteredImages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[65vh] text-[#999999]">
                <p className="font-sans text-xs select-none">没有找到相关的图片记录</p>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 content-start">
                <AnimatePresence>
                  {visibleImages.map(img => (
                    <ImageCard
                      key={img.id}
                      image={img}
                      isSelected={selectedIds.has(img.id)}
                      isCopied={copiedId === img.id}
                      isSelectionMode={selectedIds.size > 0}
                      searchQuery={searchQuery}
                      onClick={(e) => handleImageClick(e, img)}
                      onToggleSelect={handleToggleSelect}
                      onContextMenu={handleContextMenu}
                      groups={groups}
                      onRenameImage={handleRenameImage}
                      onMoveImage={handleMoveImage}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )
          ) : (
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-y-auto">
                {texts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[50vh] text-[#999999]">
                    <p className="font-sans text-xs tracking-widest text-[#999999] mb-2 uppercase select-none">暂无文本记录</p>
                    <p className="font-sans text-xs select-none">你可以复制任意网页文字在此按 Ctrl+V 自动导入，或在上方输入手动保存</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {processedTexts.groups.map(group => (
                      <div key={group.key}>
                        {textGroupMode !== 'none' && group.texts.length > 0 && (
                          <button
                            onClick={() => toggleGroupCollapse(group.key)}
                            className="flex items-center gap-2 mb-3 w-fit"
                          >
                            <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${collapsedGroups.has(group.key) ? '-rotate-90' : ''}`} />
                            <span className="text-xs font-bold text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-full">
                              {group.label}
                            </span>
                            <span className="text-[10px] text-neutral-400 font-mono">
                              {group.texts.length} 条
                            </span>
                          </button>
                        )}
                        {group.texts.length > 0 && !collapsedGroups.has(group.key) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            <AnimatePresence>
                              {group.texts.map(text => (
                                <TextCard
                                  key={text.id}
                                  text={text}
                                  isSelected={selectedTextIds.has(text.id)}
                                  isCopied={copiedTextId === text.id}
                                  isSelectionMode={isTextSelectMode || selectedTextIds.size > 0}
                                  searchQuery=""
                                  onClick={(e) => handleTextClick(e, text)}
                                  onCopy={() => copyTextToClipboard(text)}
                                  onDelete={() => deleteText(text.id, text.content)}
                                  onTogglePin={() => handleTogglePinText(text)}
                                  onToggleSelect={handleToggleSelectText}
                                  onContextMenu={(e) => handleTextContextMenu(e, text)}
                                  onEdit={() => {
                                    setEditingText(text);
                                    setEditingTextContent(text.content);
                                  }}
                                />
                              ))}
                            </AnimatePresence>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Image selection toolbar */}
      <AnimatePresence>
        {activeTab === 'image' && selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-2rem)]"
          >
            <div className="flex items-center gap-1 px-2 py-1.5 bg-neutral-900/95 backdrop-blur-xl border border-neutral-700/80 shadow-2xl rounded-full whitespace-nowrap">
              <span className="px-3 text-xs font-semibold text-white shrink-0">
                已选 {selectedIds.size} 张
              </span>
              <div className="w-px h-5 bg-neutral-700 shrink-0" />
              <button
                onClick={toggleSelectAll}
                className="px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-full transition-colors cursor-pointer shrink-0"
              >
                {selectedIds.size === filteredImages.length ? '取消全选' : '全选'}
              </button>
              <button
                onClick={copyMultiple}
                className="px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-full transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Copy className="w-3.5 h-3.5" />
                复制
              </button>
              <div className="relative shrink-0">
                <button
                  onClick={() => setIsBatchMoveMenuOpen(!isBatchMoveMenuOpen)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors flex items-center gap-1.5 cursor-pointer ${
                    isBatchMoveMenuOpen
                      ? 'bg-neutral-800 text-white'
                      : 'text-neutral-300 hover:text-white hover:bg-neutral-800'
                  }`}
                >
                  <Folder className="w-3.5 h-3.5" />
                  移动
                  <ChevronDown className="w-3.5 h-3.5" style={{ transform: isBatchMoveMenuOpen ? 'rotate(180deg)' : 'none' }} />
                </button>
                {isBatchMoveMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40 cursor-default" onClick={() => setIsBatchMoveMenuOpen(false)} />
                    <div className="absolute bottom-full mb-2 left-0 bg-neutral-900 border border-neutral-700 shadow-2xl rounded-xl py-1 min-w-[150px] z-50 flex flex-col text-neutral-300">
                      <button
                        onClick={() => { handleMoveMultipleImages('default'); setIsBatchMoveMenuOpen(false); }}
                        className="w-full text-left px-3 py-2 hover:bg-neutral-800 hover:text-white text-xs font-semibold"
                      >
                        默认分类
                      </button>
                      {groups.filter(g => g.id !== 'default').map(group => (
                        <button
                          key={group.id}
                          onClick={() => { handleMoveMultipleImages(group.id); setIsBatchMoveMenuOpen(false); }}
                          className="w-full text-left px-3 py-2 hover:bg-neutral-800 hover:text-white text-xs font-semibold truncate"
                        >
                          {group.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={deleteSelected}
                className="px-3 py-1.5 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-950/50 rounded-full transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                删除
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Text selection toolbar */}
      <AnimatePresence>
        {activeTab === 'text' && (isTextSelectMode || selectedTextIds.size > 0) && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-2rem)]"
          >
            <div className="flex items-center gap-1 px-2 py-1.5 bg-neutral-900/95 backdrop-blur-xl border border-neutral-700/80 shadow-2xl rounded-full whitespace-nowrap">
              <span className="px-3 text-xs font-semibold text-white shrink-0">
                已选 {selectedTextIds.size} 条
              </span>
              <div className="w-px h-5 bg-neutral-700 shrink-0" />
              <button
                onClick={() => {
                  if (selectedTextIds.size === texts.length) {
                    setSelectedTextIds(new Set());
                  } else {
                    setSelectedTextIds(new Set(texts.map(t => t.id)));
                  }
                }}
                className="px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-full transition-colors cursor-pointer shrink-0"
              >
                {selectedTextIds.size === texts.length ? '取消全选' : '全选'}
              </button>
              <button
                onClick={deleteSelectedTexts}
                className="px-3 py-1.5 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-950/50 rounded-full transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                删除
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image context menu */}
      {contextMenu && (
        <ContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          isSelected={selectedIds.has(contextMenu.image.id)}
          onSelectToggle={() => {
            const newSet = new Set(selectedIds);
            if (newSet.has(contextMenu.image.id)) newSet.delete(contextMenu.image.id);
            else newSet.add(contextMenu.image.id);
            setSelectedIds(newSet);
          }}
          onOpen={() => openImagePath(contextMenu.image.url)}
          onDownload={() => {
            const a = document.createElement('a');
            a.href = resolveImageUrl(contextMenu.image.url);
            a.download = contextMenu.image.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showToast('开始下载图片');
          }}
          onDelete={() => {
            removeImage(contextMenu.image.id).then(() => {
              setImages(prev => prev.filter(img => img.id !== contextMenu.image.id));
              showToast('图片已删除');
            });
            const newSet = new Set(selectedIds);
            newSet.delete(contextMenu.image.id);
            setSelectedIds(newSet);
          }}
          onViewInfo={() => {
            const img = new Image();
            img.onload = () => {
              alert(`图片分辨率: ${img.width}x${img.height}px\n归属分类: ${groups.find(g => g.id === contextMenu.image.groupId)?.name || '默认分类'}\n保存时间: ${new Date(contextMenu.image.createdAt).toLocaleString()}`);
            };
            img.src = resolveImageUrl(contextMenu.image.url);
          }}
        />
      )}

      {/* Text context menu */}
      {textContextMenu && (
        <div
          style={{ top: `${textContextMenu.y}px`, left: `${textContextMenu.x}px` }}
          className="fixed z-50 bg-[#222222]/95 backdrop-blur-xl border border-neutral-800 shadow-2xl rounded-xl py-1.5 w-48 text-xs font-sans text-neutral-300 select-none animate-in fade-in zoom-in-95 duration-100"
          onContextMenu={(e) => e.preventDefault()}
        >
          <div 
            className="fixed inset-0 z-[-1] cursor-default" 
            onClick={() => setTextContextMenu(null)} 
            onContextMenu={(e) => {
              e.preventDefault();
              setTextContextMenu(null);
            }} 
          />
          
          <button
            onClick={() => {
              copyTextToClipboard(textContextMenu.text);
              setTextContextMenu(null);
            }}
            className="w-full px-3.5 py-2.5 hover:bg-neutral-800/80 hover:text-white cursor-pointer flex items-center gap-2 text-left bg-transparent border-0 font-bold transition-colors"
          >
            <Copy className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            <span>复制文本</span>
          </button>

          {selectedTextIds.size > 1 && selectedTextIds.has(textContextMenu.text.id) && (
            <button
              onClick={() => {
                copySelectedTexts();
                setTextContextMenu(null);
              }}
              className="w-full px-3.5 py-2.5 hover:bg-neutral-800/80 hover:text-white cursor-pointer flex items-center gap-2 text-left bg-transparent border-0 font-bold transition-colors"
            >
              <Copy className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
              <span>合并复制 {selectedTextIds.size} 条</span>
            </button>
          )}

          <button
            onClick={() => {
              setEditingText(textContextMenu.text);
              setEditingTextContent(textContextMenu.text.content);
              setTextContextMenu(null);
            }}
            className="w-full px-3.5 py-2.5 hover:bg-neutral-800/80 hover:text-white cursor-pointer flex items-center gap-2 text-left bg-transparent border-0 font-bold transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            <span>编辑内容</span>
          </button>

          <button
            onClick={() => {
              handleTogglePinText(textContextMenu.text);
              setTextContextMenu(null);
            }}
            className="w-full px-3.5 py-2.5 hover:bg-neutral-800/80 hover:text-white cursor-pointer flex items-center gap-2 text-left bg-transparent border-0 font-bold transition-colors"
          >
            <Pin className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            <span>{textContextMenu.text.isPinned ? '取消置顶' : '固定置顶'}</span>
          </button>

          <div className="h-px bg-neutral-800/60 my-1" />
          <div className="px-3.5 py-1 text-[9px] font-bold text-neutral-500 uppercase tracking-widest select-none">
            导出剪贴
          </div>

          <button
            onClick={() => {
              exportTextAsFile(textContextMenu.text, 'txt');
              setTextContextMenu(null);
            }}
            className="w-full px-3.5 py-2 hover:bg-neutral-800/80 hover:text-white cursor-pointer flex items-center gap-2 text-left bg-transparent border-0 font-bold transition-colors"
          >
            <span className="text-[10px] bg-neutral-800 text-neutral-400 font-sans font-extrabold px-1 rounded uppercase min-w-[32px] text-center">TXT</span>
            <span>导出为纯文件</span>
          </button>

          <button
            onClick={() => {
              exportTextAsFile(textContextMenu.text, 'md');
              setTextContextMenu(null);
            }}
            className="w-full px-3.5 py-2 hover:bg-neutral-800/80 hover:text-white cursor-pointer flex items-center gap-2 text-left bg-transparent border-0 font-bold transition-colors"
          >
            <span className="text-[10px] bg-sky-950 text-sky-400 font-sans font-extrabold px-1 rounded uppercase min-w-[32px] text-center">MD</span>
            <span>导出为 Markdown</span>
          </button>

          <button
            onClick={() => {
              exportTextAsFile(textContextMenu.text, 'html');
              setTextContextMenu(null);
            }}
            className="w-full px-3.5 py-2 hover:bg-neutral-800/80 hover:text-white cursor-pointer flex items-center gap-2 text-left bg-transparent border-0 font-bold transition-colors"
          >
            <span className="text-[10px] bg-emerald-950 text-emerald-400 font-sans font-extrabold px-1 rounded uppercase min-w-[32px] text-center">HTML</span>
            <span>导出为网页格式</span>
          </button>

          <button
            onClick={() => {
              exportTextAsFile(textContextMenu.text, 'docx');
              setTextContextMenu(null);
            }}
            className="w-full px-3.5 py-2 hover:bg-neutral-800/80 hover:text-white cursor-pointer flex items-center gap-2 text-left bg-transparent border-0 font-bold transition-colors"
          >
            <span className="text-[10px] bg-blue-950 text-blue-400 font-sans font-extrabold px-1 rounded uppercase min-w-[32px] text-center">DOCX</span>
            <span>导出为 Word 文档</span>
          </button>

          <div className="h-px bg-neutral-800/60 my-1" />

          <button
            onClick={() => {
              deleteText(textContextMenu.text.id, textContextMenu.text.content);
              setTextContextMenu(null);
            }}
            className="w-full px-3.5 py-2.5 hover:bg-red-950/40 text-red-450 hover:text-red-300 cursor-pointer flex items-center gap-2 text-left bg-transparent border-0 font-bold transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span>删除记录</span>
          </button>
        </div>
      )}

      {/* Text Cleanup Dialog */}
      <AnimatePresence>
        {textCleanupDialog && (
          <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 8 }}
              transition={{ type: 'spring', damping: 24, stiffness: 280 }}
              className="w-full max-w-xl max-h-[82vh] overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-neutral-900">{textCleanupDialog.title}</div>
                  <div className="mt-1 text-xs text-neutral-500">默认全选，取消勾选可保留对应剪贴。</div>
                </div>
                <span className="text-xs font-mono text-neutral-500 bg-neutral-100 rounded-full px-2 py-1">
                  {textCleanupDialog.selectedIds.size}/{textCleanupDialog.clips.length}
                </span>
              </div>

              <div className="px-5 py-3 border-b border-neutral-100 flex gap-2">
                <button
                  type="button"
                  onClick={() => setTextCleanupDialog(prev => prev && ({
                    ...prev,
                    selectedIds: new Set(prev.clips.map(clip => clip.id)),
                  }))}
                  className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-bold"
                >
                  全选
                </button>
                <button
                  type="button"
                  onClick={() => setTextCleanupDialog(prev => prev && ({ ...prev, selectedIds: new Set() }))}
                  className="px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold"
                >
                  全不选
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {textCleanupDialog.clips.map(clip => {
                  const checked = textCleanupDialog.selectedIds.has(clip.id);
                  return (
                    <label
                      key={clip.id}
                      className={`flex gap-3 rounded-xl border p-3 cursor-pointer transition-all ${
                        checked
                          ? 'border-neutral-900 bg-neutral-50'
                          : 'border-neutral-200 hover:border-neutral-300 bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setTextCleanupDialog(prev => {
                            if (!prev) return prev;
                            const next = new Set(prev.selectedIds);
                            if (next.has(clip.id)) next.delete(clip.id);
                            else next.add(clip.id);
                            return { ...prev, selectedIds: next };
                          });
                        }}
                        className="mt-0.5 h-4 w-4 accent-neutral-900 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-sm text-neutral-900 break-all whitespace-pre-wrap select-text">
                          {clip.content}
                        </div>
                        <div className="mt-1 text-[11px] text-neutral-400 font-mono">
                          {getClipLength(clip)} 字 / {new Date(clip.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="px-5 py-3 border-t border-neutral-100 bg-neutral-50 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setTextCleanupDialog(null)}
                  className="px-4 py-2 rounded-xl bg-white border border-neutral-200 text-xs font-bold text-neutral-600 hover:text-neutral-950"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={confirmTextCleanup}
                  className="px-5 py-2 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={textCleanupDialog.selectedIds.size === 0}
                >
                  确认清空
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Smart Cleanup Dialog */}
      <AnimatePresence>
        {smartCleanupDialog && (
          <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 8 }}
              transition={{ type: 'spring', damping: 24, stiffness: 280 }}
              className="w-full max-w-xl max-h-[85vh] overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-neutral-900">智能清理</div>
                  <div className="mt-1 text-xs text-neutral-500">检测到 {smartCleanupDialog.clips.length} 条可能无用的文本剪贴，默认全选，取消勾选可保留对应剪贴。</div>
                </div>
                <div className="flex flex-wrap gap-1 justify-end max-w-[50%]">
                  {smartCleanupDialog.config.rules.filter(r => r.enabled).slice(0, 3).map(rule => (
                    <span key={rule.id} className="text-[10px] font-bold text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">{rule.name}</span>
                  ))}
                  {smartCleanupDialog.config.rules.filter(r => r.enabled).length > 3 && (
                    <span className="text-[10px] font-bold text-neutral-400 px-1.5 py-0.5">+{smartCleanupDialog.config.rules.filter(r => r.enabled).length - 3}</span>
                  )}
                </div>
              </div>

              <div className="px-5 py-3 border-b border-neutral-100 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSmartCleanupDialog(prev => prev && ({
                    ...prev,
                    selectedIds: new Set(prev.clips.map(clip => clip.id)),
                  }))}
                  className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-bold"
                >
                  全选
                </button>
                <button
                  type="button"
                  onClick={() => setSmartCleanupDialog(prev => prev && ({ ...prev, selectedIds: new Set() }))}
                  className="px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold"
                >
                  全不选
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {smartCleanupDialog.clips.map(clip => {
                  const checked = smartCleanupDialog.selectedIds.has(clip.id);
                  return (
                    <label
                      key={clip.id}
                      className={`flex gap-3 rounded-xl border p-3 cursor-pointer transition-all ${
                        checked
                          ? 'border-neutral-900 bg-neutral-50'
                          : 'border-neutral-200 hover:border-neutral-300 bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSmartCleanupDialog(prev => {
                            if (!prev) return prev;
                            const next = new Set(prev.selectedIds);
                            if (next.has(clip.id)) next.delete(clip.id);
                            else next.add(clip.id);
                            return { ...prev, selectedIds: next };
                          });
                        }}
                        className="mt-0.5 h-4 w-4 accent-neutral-900 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-sm text-neutral-900 break-all whitespace-pre-wrap select-text">
                          {clip.content}
                        </div>
                        <div className="mt-1 text-[11px] text-neutral-400 font-mono">
                          {getClipLength(clip)} 字 / {new Date(clip.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => excludeFromSmartCleanup(clip.content.trim())}
                        className="shrink-0 p-1 rounded-lg text-neutral-300 hover:text-neutral-600 hover:bg-neutral-100 transition-all self-start"
                        title="不再提示此内容"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="15" y1="9" x2="9" y2="15" />
                          <line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                      </button>
                    </label>
                  );
                })}
              </div>

              <div className="px-5 py-3 border-t border-neutral-100 bg-neutral-50 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSmartCleanupDialog(null)}
                  className="px-4 py-2 rounded-xl bg-white border border-neutral-200 text-xs font-bold text-neutral-600 hover:text-neutral-950"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={confirmSmartCleanup}
                  className="px-5 py-2 rounded-xl bg-neutral-900 text-white text-xs font-bold hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={smartCleanupDialog.selectedIds.size === 0}
                >
                  确认清理 {smartCleanupDialog.selectedIds.size} 条
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New/Edit text form */}
      <AnimatePresence>
        {(showTextNewForm || editingText) && (
          <div className="fixed inset-x-0 bottom-0 z-[60] pointer-events-none">
            <motion.div
              initial={{ y: '105%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '105%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="pointer-events-auto mx-auto mb-4 w-[min(1120px,calc(100vw-32px))] max-h-[74vh] overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-[0_28px_90px_-32px_rgba(0,0,0,0.55)] flex flex-col text-[#1a1a1a] font-sans"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-white">
                <div>
                  <div className="text-sm font-bold text-neutral-900">
                    {editingText ? '编辑文本剪贴' : '临时备忘'}
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {editingText ? '修改后保存到当前剪贴记录。' : '适合临时记录，保存后进入文本剪贴板。'}
                  </div>
                </div>
                <span className="text-xs font-mono text-neutral-500 bg-neutral-100 rounded-full px-2.5 py-1">
                  {(editingText ? editingTextContent : newTextContent).length} 字符
                </span>
              </div>

              <div className="p-5 flex-1 overflow-y-auto bg-neutral-50/55">
                <textarea
                  className="w-full min-h-[260px] h-[42vh] max-h-[460px] p-5 bg-white border border-neutral-200 hover:border-neutral-300 focus:bg-white rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#191919]/5 focus:border-[#191919] text-sm font-mono text-[#222222] leading-relaxed resize-none shadow-inner transition-all"
                  value={editingText ? editingTextContent : newTextContent}
                  onChange={(e) => {
                    if (editingText) setEditingTextContent(e.target.value);
                    else setNewTextContent(e.target.value);
                  }}
                  placeholder={editingText ? '请输入剪贴内容...' : '写点临时备忘，保存后会进入文本剪贴板...'}
                  autoFocus
                />
              </div>

              <div className="px-6 py-4 border-t border-neutral-100 bg-white flex items-center justify-between gap-3">
                <div className="text-xs text-neutral-400 font-medium">
                  不会点击背景关闭，避免误丢内容。
                </div>
                <div className="flex items-center gap-2.5">
                <button
                  onClick={() => {
                    setEditingText(null);
                    setShowTextNewForm(false);
                  }}
                  className="px-4 py-2.5 text-xs font-bold text-neutral-600 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200/80 rounded-full transition-all cursor-pointer"
                >
                  收起
                </button>
                <button
                  onClick={() => {
                    if (editingText) handleSaveEditText();
                    else saveTextClip(newTextContent);
                  }}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-[#191919] hover:bg-black rounded-full transition-all shadow-md cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={editingText ? !editingTextContent.trim() : !newTextContent.trim()}
                >
                  {editingText ? '保存修改' : '保存备忘'}
                </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast.visible && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-[#1A1A1A] text-white px-4 py-2 border border-[#333333] shadow-lg rounded-lg text-xs font-medium tracking-wide z-50 pointer-events-none select-none flex items-center gap-2"
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="h-8 shrink-0 border-t border-neutral-200/70 bg-white/80 px-4 flex items-center justify-between font-mono text-[11px] text-neutral-500 z-10 select-none">
        <div className="flex items-center gap-2 font-sans font-bold text-neutral-700">
          <span className="opencut-mark opencut-mark-mini" aria-hidden="true">*</span>
          <span>OpenCut</span>
        </div>
        <div className="flex gap-4 pr-1">
          {activeTab === 'image' ? (
            <>
              <span>⌘/Ctrl+V 导入</span>
              <span>⌘/Ctrl+A 全选</span>
              <span>⌘/Ctrl+C 复制</span>
              <span>Delete 删除</span>
              <span>Esc 取消</span>
            </>
          ) : (
            <>
              <span>⌘/Ctrl+V 导入</span>
              <span>⌘/Ctrl+A 全选</span>
              <span>右键 合并复制</span>
              <span>Delete 删除</span>
              <span>Esc 取消</span>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}