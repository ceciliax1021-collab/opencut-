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
} from './lib/local';
import { 
  Copy, 
  Trash2, 
  DownloadCloud, 
  Image as ImageIcon, 
  Upload, 
  Pin, 
  Clipboard, 
  Folder, 
  Plus, 
  Edit2, 
  ChevronDown,
  ChevronLeft,
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { check as checkUpdate } from '@tauri-apps/plugin-updater';

type ActiveTab = 'image' | 'text' | 'memo';
type CleanupDialog = {
  candidates: TextClip[];
  label: string;
  selected: Set<string>;
  sortAsc: boolean;
} | null;

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
  const [mainViewportScroll, setMainViewportScroll] = useState({ top: 0, left: 0 });
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [activeGroupMenuId, setActiveGroupMenuId] = useState<string | null>(null);
  const [isBatchMoveMenuOpen, setIsBatchMoveMenuOpen] = useState(false);
  const [isTextCleanMenuOpen, setIsTextCleanMenuOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>('image');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);

  const [texts, setTexts] = useState<TextClip[]>([]);
  const [newTextContent, setNewTextContent] = useState('');
  const [selectedTextIds, setSelectedTextIds] = useState<Set<string>>(new Set());
  const [isTextSelectMode, setIsTextSelectMode] = useState(false);
  const [cleanupDialog, setCleanupDialog] = useState<CleanupDialog>(null);
  const [editingText, setEditingText] = useState<TextClip | null>(null);
  const [editingTextContent, setEditingTextContent] = useState('');
  const [textContextMenu, setTextContextMenu] = useState<{ x: number, y: number, text: TextClip } | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedTextId, setCopiedTextId] = useState<string | null>(null);
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; body: string; apply: () => Promise<void> } | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);

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

  const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return '未知错误';
  };

  const checkForUpdate = async (silent = false) => {
    if (isCheckingUpdate || isInstallingUpdate) return;

    setIsCheckingUpdate(true);
    try {
      const update = await checkUpdate();
      if (update) {
        setUpdateInfo({
          version: update.version,
          body: update.body || '',
          apply: async () => {
            await update.downloadAndInstall();
          },
        });
        if (!silent) showToast(`发现新版本 v${update.version}`);
      } else if (!silent) {
        setUpdateInfo(null);
        showToast('当前已是最新版本');
      }
    } catch (error) {
      console.error('update check failed', error);
      if (!silent) showToast(`检查更新失败：${getErrorMessage(error)}`);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const installUpdate = async () => {
    if (!updateInfo || isInstallingUpdate) return;

    setIsInstallingUpdate(true);
    try {
      await updateInfo.apply();
      setUpdateInfo(null);
      showToast('更新已安装，重启后生效');
    } catch (error) {
      console.error('update install failed', error);
      showToast(`更新失败：${getErrorMessage(error)}`);
    } finally {
      setIsInstallingUpdate(false);
    }
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

    const privacyAgreed = localStorage.getItem('opencut-privacy-agreed');
    if (!privacyAgreed) {
      setShowPrivacyNotice(true);
    }

    checkForUpdate(true);

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
      setMainViewportScroll({ top: target.top, left: target.left });
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
        const filtered = prev.filter(t => t.content !== content);
        return [newClip, ...filtered];
      });
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

  const deleteText = async (id: string) => {
    try {
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

  const getShortTextCleanupCandidates = () => (
    texts.filter(t => !t.isPinned && t.content.trim().length <= 5)
  );

  const getSmartTextCleanupCandidates = () => {
    const seen = new Set<string>();

    return texts.filter((text) => {
      const normalized = text.content.trim().replace(/\s+/g, ' ');
      if (!normalized) return !text.isPinned;

      if (text.isPinned) {
        seen.add(normalized);
        return false;
      }

      if (normalized.length <= 5) return true;
      if (seen.has(normalized)) return true;

      seen.add(normalized);
      return false;
    });
  };

  const openCleanupDialog = (label: string, candidates: TextClip[]) => {
    if (candidates.length === 0) {
      showToast('没有需要清理的文本');
      return;
    }
    setCleanupDialog({
      candidates,
      label,
      selected: new Set(candidates.map(t => t.id)),
      sortAsc: false,
    });
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

    if (!confirm(`确认删除选中的 ${idsToDelete.length} 条文本吗？\n此操作会删除本地记录，无法撤销。`)) {
      return;
    }

    setTexts(prev => prev.filter(t => !selectedTextIds.has(t.id)));
    setSelectedTextIds(new Set());
    setIsTextSelectMode(false);

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
    

    copyToClipboard(image);
  };

  const handleTextClick = (e: React.MouseEvent, text: TextClip) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, select, input, svg')) return;

    copyTextToClipboard(text);
  };

  const handleTextContextMenu = (e: React.MouseEvent, text: TextClip) => {
    e.preventDefault();
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
  <div class="content">${text.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
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
  <div>${text.content.split('\n').map(line => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`).join('')}</div>
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
      showToast(`已创建“${newGroup.name}”分类`);
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
      setActiveGroupMenuId(null);
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
      setActiveGroupMenuId(null);
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
      showToast(`成功将 ${ids.length} 张图片移动至“${destGroup.name}”`);
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

  const filteredTexts = texts.filter(t => t.content.toLowerCase().includes(searchQuery.toLowerCase()));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

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
  }, [selectedIds, selectedTextIds, images, texts, activeTab, selectedGroupId, copyMultiple, copySelectedTexts, filteredImages]);

  return (
    <div className="h-screen w-full bg-[#F2F2F2] text-[#1A1A1A] font-sans flex flex-col overflow-hidden">
      {}
      <header className="h-16 bg-white border-b border-neutral-100 px-6 grid grid-cols-3 items-center z-25 shrink-0 select-none shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
        {}
        <div className="flex items-center gap-3.5 justify-start">
          <div className="font-sans text-base font-black tracking-tight text-neutral-900">OpenCut</div>
          <div className="h-4 w-px bg-neutral-200"></div>
          <div className="text-[11px] font-sans font-medium text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-full flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
            <span>
              {activeTab === 'image' && `图片 ${filteredImages.length} 张`}
              {activeTab === 'text' && `文本 ${texts.length} 条`}
              {activeTab === 'memo' && '临时备忘录'}
            </span>
          </div>
        </div>

        {}
        <div className="flex items-center justify-center gap-3.5 select-none font-sans">
          <button 
            id="tab-button-image"
            onClick={() => {
              setActiveTab('image');
              setSearchQuery('');
              setIsSearchExpanded(false);
            }}
            className={`transition-all duration-200 cursor-pointer ${
              activeTab === 'image' 
                ? 'text-neutral-900 font-extrabold text-[15px]' 
                : 'text-neutral-400 hover:text-neutral-700 font-semibold text-[14px]'
            }`}
          >
            图片
          </button>
          <span className="text-neutral-300 font-light select-none">/</span>
          <button 
            id="tab-button-text"
            onClick={() => {
              setActiveTab('text');
              setSearchQuery('');
              setIsSearchExpanded(false);
            }}
            className={`transition-all duration-200 cursor-pointer ${
              activeTab === 'text' 
                ? 'text-neutral-900 font-extrabold text-[15px]' 
                : 'text-neutral-400 hover:text-neutral-700 font-semibold text-[14px]'
            }`}
          >
            文本
          </button>
          <span className="text-neutral-300 font-light select-none">/</span>
          <button
            id="tab-button-memo"
            onClick={() => {
              setActiveTab('memo');
              setSearchQuery('');
              setIsSearchExpanded(false);
            }}
            className={`transition-all duration-200 cursor-pointer ${
              activeTab === 'memo'
                ? 'text-neutral-900 font-extrabold text-[15px]'
                : 'text-neutral-400 hover:text-neutral-700 font-semibold text-[14px]'
            }`}
          >
            备忘录
          </button>
        </div>
        
        {}
        <div className="flex items-center select-none font-sans justify-end">
          {activeTab === 'image' ? (
            <div className="flex items-center animate-in fade-in duration-150">
              <button 
                id="action-btn-import"
                onClick={() => fileInputRef.current?.click()} 
                className="text-neutral-500 hover:text-neutral-900 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer bg-transparent border-0 p-0"
              >
                <Upload className="w-3.5 h-3.5 text-neutral-400" />
                <span>本地导入</span>
              </button>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileSelect} />
            </div>
          ) : activeTab === 'text' ? (
            <div className="flex items-center gap-4.5 animate-in fade-in duration-150">
              <button 
                id="action-btn-merge-copy"
                onClick={() => {
                  setIsTextSelectMode(!isTextSelectMode);
                  if (isTextSelectMode) {
                    setSelectedTextIds(new Set());
                  }
                }} 
                className={`${isTextSelectMode ? 'text-neutral-900' : 'text-neutral-500 hover:text-neutral-900'} text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer bg-transparent border-0 p-0`}
              >
                <Copy className="w-3.5 h-3.5 text-neutral-400" />
                <span>{isTextSelectMode ? '取消合并' : '合并复制'}</span>
              </button>

              <div className="h-4 w-px bg-neutral-200 select-none"></div>

              <div className="relative">
                <button
                  id="action-btn-clear"
                  onClick={() => setIsTextCleanMenuOpen(!isTextCleanMenuOpen)}
                  className="text-red-500 hover:text-red-655 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer bg-transparent border-0 p-0"
                  title="清理文本"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  <ChevronDown className="w-3.5 h-3.5 text-red-400 transition-transform duration-200" style={{ transform: isTextCleanMenuOpen ? 'rotate(180deg)' : 'none' }} />
                </button>

                {isTextCleanMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40 cursor-default"
                      onClick={() => setIsTextCleanMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-3 bg-white border border-neutral-200/80 shadow-[0_16px_40px_rgba(0,0,0,0.12)] rounded-2xl py-2 z-50 w-40 text-xs font-sans text-neutral-850 flex flex-col font-bold select-none anim-fade">
                      <button
                        onClick={() => {
                          setIsTextCleanMenuOpen(false);
                          openCleanupDialog('智能清理', getSmartTextCleanupCandidates());
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-neutral-50 transition-colors font-bold text-neutral-750 hover:text-neutral-950"
                      >
                        智能清理
                      </button>
                      <div className="h-px bg-neutral-100 mx-4" />
                      <button
                        onClick={() => {
                          setIsTextCleanMenuOpen(false);
                          openCleanupDialog('短文本清理', getShortTextCleanupCandidates());
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-neutral-50 transition-colors font-bold text-neutral-750 hover:text-neutral-950"
                      >
                        短文本清理
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs font-bold text-neutral-400 animate-in fade-in duration-150">
              快速记录
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {}
        {activeTab === 'image' && (
          <div
            className={`transition-[width,margin,opacity] duration-300 ease-in-out flex flex-col shrink-0 overflow-hidden ${
              isSidebarCollapsed
                ? 'w-0 ml-0 mt-4 mb-4 opacity-0 pointer-events-none'
                : 'w-60 ml-6 mt-4 mb-4 opacity-100'
            }`}
          >
            {}
            <div className="flex-1 bg-white border border-neutral-100/60 rounded-2xl flex flex-col shadow-[0_16px_40px_-6px_rgba(0,0,0,0.06),_0_2px_8px_rgba(0,0,0,0.01)] h-full overflow-hidden">
              {}
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

              {}
              <div className="flex-1 overflow-y-auto p-2.5 space-y-1 scrollbar-none">
                {}
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

                {}
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

                {}
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
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>

                            {}
                            {activeGroupMenuId === g.id && (
                              <>
                                {}
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
                                      if (confirm(`确定要删除分类“${g.name}”吗？\n删除后，该分类下的图片将移回“默认分类”，不会被真的删除。`)) {
                                        handleDeleteGroup(g.id);
                                      } else {
                                        setActiveGroupMenuId(null);
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

              {}
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

        {}
        <main 
          ref={mainScrollRef}
          onScroll={(e) => {
            setMainViewportScroll({
              top: e.currentTarget.scrollTop,
              left: e.currentTarget.scrollLeft,
            });
          }}
          onMouseDown={handleMouseDown}
          className="flex-1 relative p-6 overflow-hidden overflow-y-auto select-none bg-[#F7F7F7] [overflow-anchor:auto]"
        >
          {}
          {activeTab !== 'memo' && (
          <div className="absolute top-4 right-6 z-45 select-text">
            <div 
              className={`flex items-center bg-white border border-neutral-200/80 shadow-[0_4px_16px_rgba(0,0,0,0.04)] transition-all duration-350 rounded-full h-10 ${
                isSearchExpanded ? 'w-64 px-3.5' : 'w-10 justify-center cursor-pointer hover:bg-neutral-50/80'
              }`}
              onClick={() => {
                if (!isSearchExpanded) setIsSearchExpanded(true);
              }}
            >
              <Search className="w-4 h-4 text-neutral-500 shrink-0 select-none cursor-pointer" />
              {isSearchExpanded && (
                <input
                  type="text"
                  placeholder={activeTab === 'image' ? "搜索图片名称..." : "搜索文本记录..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                  className="bg-transparent border-0 text-xs w-full pl-2 focus:outline-none placeholder-neutral-400 text-neutral-800 font-medium h-full"
                  onBlur={() => {
                    if (!searchQuery) {
                      setIsSearchExpanded(false);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setIsSearchExpanded(false);
                      setSearchQuery('');
                    }
                  }}
                />
              )}
              {isSearchExpanded && searchQuery && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSearchQuery('');
                  }}
                  className="text-neutral-400 hover:text-neutral-600 text-[10px] bg-neutral-100 hover:bg-neutral-200 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ml-1 cursor-pointer border-0"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
          )}

          {}
          <AnimatePresence>
            {activeTab === 'image' && isSidebarCollapsed && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  top: mainViewportScroll.top + 16,
                  left: mainViewportScroll.left + 16,
                }}
                onClick={() => setSidebarCollapsed(false)}
                className="absolute bg-white/80 backdrop-blur-md hover:bg-white p-2.5 rounded-xl shadow-lg border border-neutral-200/50 text-neutral-600 hover:text-[#191919] z-30 transition-all flex items-center gap-1.5 font-bold focus:outline-none select-none cursor-pointer text-xs"
                title="展开分类"
              >
                <Folder className="w-3.5 h-3.5 text-neutral-500" />
                <span>展开分类</span>
              </motion.button>
            )}
          </AnimatePresence>
          {}
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
          ) : activeTab === 'text' ? (
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-y-auto min-h-0">
                {texts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[50vh] text-[#999999]">
                    <p className="font-sans text-xs tracking-widest text-[#999999] mb-2 uppercase select-none">暂无文本记录</p>
                    <p className="font-sans text-xs select-none">你可以复制任意网页文字在此按 Ctrl+V 自动导入，或在上方输入手动保存</p>
                  </div>
                ) : filteredTexts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[50vh] text-[#999999]">
                    <p className="font-sans text-xs select-none">没有找到匹配的文本记录</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 content-start">
                    <AnimatePresence>
                      {filteredTexts.map(text => (
                        <TextCard
                          key={text.id}
                          text={text}
                          isSelected={selectedTextIds.has(text.id)}
                          isCopied={copiedTextId === text.id}
                          isSelectionMode={isTextSelectMode || selectedTextIds.size > 0}
                          onClick={(e) => handleTextClick(e, text)}
                          onCopy={() => copyTextToClipboard(text)}
                          onDelete={() => deleteText(text.id)}
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
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newTextContent.trim()) {
                    saveTextClip(newTextContent);
                    setNewTextContent('');
                  }
                }}
                className="w-full max-w-3xl bg-white border border-neutral-100/60 rounded-2xl shadow-[0_16px_40px_-6px_rgba(0,0,0,0.06),_0_2px_8px_rgba(0,0,0,0.01)] p-5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-neutral-800">临时备忘录</span>
                  <span className="text-[10px] text-neutral-400 font-mono select-none">Cmd+Enter 快捷保存</span>
                </div>
                <textarea
                  placeholder="在此输入临时备忘录内容..."
                  value={newTextContent}
                  onChange={(e) => setNewTextContent(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      if (newTextContent.trim()) {
                        saveTextClip(newTextContent);
                        setNewTextContent('');
                      }
                    }
                  }}
                  className="w-full bg-white border border-[#D1D1D1] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#191919]/15 focus:border-[#191919] transition-all shadow-sm resize-y min-h-[360px] font-sans leading-relaxed"
                  rows={14}
                  autoFocus
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setNewTextContent('')}
                    className="text-xs text-neutral-500 hover:text-neutral-800 bg-neutral-100 hover:bg-neutral-200/80 px-4 py-2 rounded-lg font-bold transition-all cursor-pointer"
                  >
                    清空输入
                  </button>
                  <button
                    type="submit"
                    className="bg-[#1A1A1A] hover:bg-black text-white text-xs font-bold px-5 py-2 rounded-lg transition-all shadow-sm cursor-pointer active:scale-95"
                  >
                    保存到剪贴板
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>

      {}
      <AnimatePresence>
        {activeTab === 'image' && selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-12 left-1/2 -translate-x-1/2 bg-[#191919]/95 backdrop-blur-xl border border-neutral-800/80 shadow-[0_24px_50px_rgba(0,0,0,0.3)] rounded-2xl p-2 flex items-center gap-2 z-40 select-none font-sans text-xs"
          >
            <span className="pl-3.5 pr-2.5 text-xs font-bold text-white tracking-wide font-sans">
              已选中 {selectedIds.size} 张图片
            </span>
            <div className="w-px h-4 bg-neutral-800 mx-1.5" />
            
            <button
              onClick={toggleSelectAll}
              className="px-3.5 py-2 text-xs font-bold text-neutral-400 hover:text-white hover:bg-neutral-800/80 rounded-xl transition-all cursor-pointer"
            >
              {selectedIds.size === filteredImages.length ? '取消全选' : '全选分类'}
            </button>
            <button
              onClick={copyMultiple}
              className="px-3.5 py-2 text-xs font-bold text-neutral-300 hover:text-white hover:bg-neutral-800/80 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 text-neutral-450" />
              <span>一键复制</span>
            </button>

            {}
            <div className="relative">
              <button
                onClick={() => setIsBatchMoveMenuOpen(!isBatchMoveMenuOpen)}
                className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                  isBatchMoveMenuOpen 
                    ? 'bg-neutral-800 text-white' 
                    : 'text-neutral-300 hover:text-white hover:bg-neutral-800/80'
                }`}
              >
                <Folder className="w-3.5 h-3.5 text-neutral-450" />
                <span>移至分类</span>
                <ChevronDown className="w-3.5 h-3.5 text-neutral-450 transition-transform duration-200" style={{ transform: isBatchMoveMenuOpen ? 'rotate(180deg)' : 'none' }} />
              </button>

              {isBatchMoveMenuOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40 cursor-default" 
                    onClick={() => setIsBatchMoveMenuOpen(false)} 
                  />
                  <div className="absolute bottom-full mb-3 left-0 bg-[#222222]/95 backdrop-blur-xl border border-neutral-800/80 shadow-[0_12px_32px_rgba(0,0,0,0.4)] rounded-xl py-1.5 min-w-[170px] z-50 flex flex-col font-sans text-neutral-300 select-none">
                    <div className="px-3.5 py-2 text-[10px] font-bold text-neutral-500 border-b border-neutral-800/60 tracking-wider">
                      选择目标分类
                    </div>
                    
                    {}
                    <button
                      onClick={() => {
                        handleMoveMultipleImages('default');
                        setIsBatchMoveMenuOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-neutral-800/60 hover:text-white flex items-center gap-2 transition-colors font-bold"
                    >
                      <Folder className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <span>默认分类</span>
                    </button>

                    {}
                    {groups.filter(g => g.id !== 'default').map(group => (
                      <button
                        key={group.id}
                        onClick={() => {
                          handleMoveMultipleImages(group.id);
                          setIsBatchMoveMenuOpen(false);
                        }}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-neutral-800/60 hover:text-white flex items-center gap-2 transition-colors font-bold truncate"
                      >
                        <Folder className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                        <span className="truncate">{group.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <button
              onClick={deleteSelected}
              className="px-3.5 py-2 text-xs font-bold text-red-400 hover:text-red-350 hover:bg-red-950/40 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>删除选中</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {}
      <AnimatePresence>
        {activeTab === 'text' && (isTextSelectMode || selectedTextIds.size > 0) && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-12 left-1/2 -translate-x-1/2 bg-[#191919]/95 backdrop-blur-xl border border-neutral-800/80 shadow-[0_24px_50px_rgba(0,0,0,0.3)] rounded-2xl p-2 flex items-center gap-1.5 z-40 select-none font-sans text-xs"
          >
            <span className="pl-3.5 pr-2.5 text-xs font-bold text-white tracking-wide font-sans">
              已选中 {selectedTextIds.size} 条文本
            </span>
            <div className="w-px h-4 bg-neutral-800 mx-1.5" />
            <button
              onClick={() => {
                if (selectedTextIds.size === texts.length) {
                  setSelectedTextIds(new Set());
                } else {
                  setSelectedTextIds(new Set(texts.map(t => t.id)));
                }
              }}
              className="px-3.5 py-2 text-xs font-bold text-neutral-400 hover:text-white hover:bg-neutral-800/80 rounded-xl transition-all cursor-pointer"
            >
              {selectedTextIds.size === texts.length ? '取消全选' : '全选所有'}
            </button>
            <button
              onClick={() => {
                copySelectedTexts();
                setIsTextSelectMode(false);
                setSelectedTextIds(new Set());
              }}
              className="px-3.5 py-2 text-xs font-bold text-neutral-300 hover:text-white hover:bg-neutral-800/80 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 text-neutral-450" />
              <span>合并复制</span>
            </button>
            <button
              onClick={deleteSelectedTexts}
              className="px-3.5 py-2 text-xs font-bold text-red-400 hover:text-red-350 hover:bg-red-950/40 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>删除选中</span>
            </button>
            <div className="w-px h-4 bg-neutral-800 mx-1.5" />
            <button
              onClick={() => {
                setIsTextSelectMode(false);
                setSelectedTextIds(new Set());
              }}
              className="px-3.5 py-2 text-xs font-bold text-neutral-400 hover:text-white hover:bg-neutral-800/80 rounded-xl transition-all cursor-pointer"
            >
              退出
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {}
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

      {}
      {textContextMenu && (
        <div
          style={{ top: `${textContextMenu.y}px`, left: `${textContextMenu.x}px` }}
          className="fixed z-50 bg-[#222222]/95 backdrop-blur-xl border border-neutral-800 shadow-2xl rounded-xl py-1.5 w-48 text-xs font-sans text-neutral-300 select-none animate-in fade-in zoom-in-95 duration-100"
          onContextMenu={(e) => e.preventDefault()}
        >
          {}
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
              deleteText(textContextMenu.text.id);
              setTextContextMenu(null);
            }}
            className="w-full px-3.5 py-2.5 hover:bg-red-950/40 text-red-450 hover:text-red-300 cursor-pointer flex items-center gap-2 text-left bg-transparent border-0 font-bold transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span>删除记录</span>
          </button>
        </div>
      )}

      {}
      <AnimatePresence>
        {cleanupDialog && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.93 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.93 }}
              transition={{ type: 'spring', damping: 25, stiffness: 280 }}
              className="bg-white border border-neutral-200/80 shadow-2xl rounded-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[80vh] text-[#1A1A1A] font-sans"
              onClick={(e) => e.stopPropagation()}
            >
              {}
              <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 shrink-0">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-bold text-neutral-900">{cleanupDialog.label}</h2>
                  <span className="text-[10px] font-mono text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-md font-bold">
                    {cleanupDialog.candidates.length} 条候选
                  </span>
                </div>
                <button
                  onClick={() => setCleanupDialog(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 transition-all cursor-pointer"
                >
                  <span className="text-base leading-none">✕</span>
                </button>
              </div>

              {}
              <div className="flex items-center justify-between px-6 py-2.5 border-b border-neutral-100/60 bg-neutral-50/30 shrink-0">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      const allSelected = cleanupDialog.selected.size === cleanupDialog.candidates.length;
                      const newSelected = new Set(cleanupDialog.selected);
                      if (allSelected) {
                        newSelected.clear();
                      } else {
                        cleanupDialog.candidates.forEach(t => newSelected.add(t.id));
                      }
                      setCleanupDialog({ ...cleanupDialog, selected: newSelected });
                    }}
                    className="text-xs font-bold text-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer bg-transparent border-0 px-2 py-1"
                  >
                    {cleanupDialog.selected.size === cleanupDialog.candidates.length ? '取消全选' : '全选全部'}
                  </button>
                  <span className="text-[10px] font-mono text-neutral-400">
                    已选 <strong className="text-neutral-700">{cleanupDialog.selected.size}</strong> 条
                  </span>
                </div>
                <button
                  onClick={() => setCleanupDialog({ ...cleanupDialog, sortAsc: !cleanupDialog.sortAsc })}
                  className="text-xs font-bold text-neutral-500 hover:text-neutral-900 transition-all cursor-pointer bg-transparent border-0 px-2 py-1 flex items-center gap-1"
                >
                  <span className="text-neutral-400 text-[10px]">{cleanupDialog.sortAsc ? '↑ 最早优先' : '↓ 最新优先'}</span>
                </button>
              </div>

              {}
              <div className="flex-1 overflow-y-auto px-0 py-0">
                <div className="divide-y divide-neutral-100/80">
                  {(cleanupDialog.sortAsc
                    ? [...cleanupDialog.candidates].reverse()
                    : cleanupDialog.candidates
                  ).map((text) => {
                    const isSelected = cleanupDialog.selected.has(text.id);
                    return (
                      <label
                        key={text.id}
                        className={`flex items-center gap-3 px-6 py-3 cursor-pointer transition-colors hover:bg-neutral-50 ${
                          isSelected ? 'bg-red-50/30' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            const newSelected = new Set(cleanupDialog.selected);
                            if (newSelected.has(text.id)) {
                              newSelected.delete(text.id);
                            } else {
                              newSelected.add(text.id);
                            }
                            setCleanupDialog({ ...cleanupDialog, selected: newSelected });
                          }}
                          className="w-4 h-4 rounded border-neutral-300 text-[#191919] focus:ring-[#191919]/20 accent-neutral-900 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-neutral-800 truncate font-medium leading-relaxed">
                            {text.content}
                          </p>
                          <p className="text-[10px] text-neutral-400 font-mono mt-0.5">
                            {new Date(text.createdAt).toLocaleString()} · {text.content.length} 字符
                          </p>
                        </div>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold shrink-0 ${
                          text.content.trim().length <= 5
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-neutral-100 text-neutral-500'
                        }`}>
                          {text.content.trim().length <= 5 ? '短文本' : '重复'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {}
              <div className="px-6 py-4 border-t border-neutral-100 bg-neutral-50/50 flex items-center justify-between shrink-0">
                <button
                  onClick={() => setCleanupDialog(null)}
                  className="px-4 py-2 text-xs font-bold text-neutral-500 hover:text-neutral-900 bg-white hover:bg-neutral-100 border border-neutral-200 rounded-xl transition-all cursor-pointer"
                >
                  取消
                </button>
                <button
                  onClick={async () => {
                    const idsToDelete = Array.from(cleanupDialog.selected);
                    if (idsToDelete.length === 0) {
                      showToast('请至少选择一条文本');
                      return;
                    }
                    setTexts(prev => prev.filter(t => !cleanupDialog.selected.has(t.id)));
                    setCleanupDialog(null);
                    for (const id of idsToDelete) {
                      removeText(id).catch(console.error);
                    }
                    showToast(`已清理 ${idsToDelete.length} 条文本`);
                  }}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#191919] hover:bg-black rounded-xl transition-all shadow-sm cursor-pointer active:scale-95 flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  确认删除 ({cleanupDialog.selected.size})
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {}
      <AnimatePresence>
        {editingText && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.93 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.93 }}
              transition={{ type: 'spring', damping: 25, stiffness: 280 }}
              className="bg-white border border-neutral-200/80 shadow-2xl rounded-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] text-[#1a1a1a] font-sans"
              onClick={(e) => e.stopPropagation()}
            >
              {}
              <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
                <span className="text-sm font-bold text-neutral-800">编辑文本剪贴内容</span>
                <span className="text-xs font-mono text-neutral-400 capitalize bg-neutral-105 px-2 py-0.5 rounded-md">
                  {editingTextContent.length} 个字符
                </span>
              </div>

              {}
              <div className="p-5 flex-1 overflow-y-auto">
                <textarea
                  className="w-full min-h-[220px] max-h-[380px] p-4 bg-neutral-50 border border-neutral-250 hover:border-neutral-350 focus:bg-white rounded-xl focus:outline-none focus:ring-4 focus:ring-[#191919]/5 focus:border-[#191919] text-xs font-mono text-[#222222] leading-relaxed resize-y shadow-inner transition-all-300"
                  value={editingTextContent}
                  onChange={(e) => setEditingTextContent(e.target.value)}
                  placeholder="请输入剪贴内容..."
                  autoFocus
                />
              </div>

              {}
              <div className="px-5 py-3 border-t border-neutral-100 bg-neutral-50/50 flex items-center justify-end gap-2.5">
                <button
                  onClick={() => setEditingText(null)}
                  className="px-4 py-2 text-xs font-bold text-neutral-600 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200/80 rounded-xl transition-all cursor-pointer"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveEditText}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#191919] hover:bg-black rounded-xl transition-all shadow-md cursor-pointer active:scale-95"
                >
                  保存修改
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {}
      <AnimatePresence>
        {showPrivacyNotice && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.93 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.93 }}
              transition={{ type: 'spring', damping: 25, stiffness: 280 }}
              className="bg-white border border-neutral-200/80 shadow-2xl rounded-2xl w-full max-w-md overflow-hidden font-sans text-[#1A1A1A]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 pt-6 pb-2">
                <h2 className="text-base font-bold text-neutral-900 mb-1">欢迎使用 OpenCut</h2>
                <p className="text-xs text-neutral-500 font-medium">本地剪贴板管理工具</p>
              </div>

              <div className="px-6 py-4 space-y-3 text-xs text-neutral-700 leading-relaxed">
                <div className="bg-amber-50 border border-amber-200/60 rounded-xl px-4 py-3">
                  <p className="font-bold text-amber-800 text-xs mb-1">关于隐私</p>
                  <p className="text-amber-700 text-[11px]">
                    OpenCut 会在后台监控你的系统剪贴板（每 500ms），自动保存复制的图片和文本内容。
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="font-bold text-neutral-800 text-xs">数据存储说明：</p>
                  <ul className="space-y-1.5 text-neutral-600">
                    <li className="flex gap-2">
                      <span className="text-emerald-600 shrink-0">✓</span>
                      <span>所有数据保存在本地，<strong className="text-neutral-800">不会上传到任何服务器</strong></span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-emerald-600 shrink-0">✓</span>
                      <span>无网络请求、无分析统计、无崩溃上报</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-emerald-600 shrink-0">✓</span>
                      <span>纯离线工具，断网也可正常使用</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-neutral-300 shrink-0">⚙</span>
                      <span>数据路径：<code className="text-[10px] bg-neutral-100 px-1 py-0.5 rounded font-mono">~/Library/Application Support/com.opencut.desktop/clips/</code></span>
                    </li>
                  </ul>
                </div>

                <p className="text-[11px] text-neutral-400 italic">
                  敏感信息（如密码、验证码）复制后会自动保存，建议定期使用「智能清理」功能清除不需要的记录。
                </p>
              </div>

              <div className="px-6 py-4 border-t border-neutral-100 bg-neutral-50/50 flex justify-end">
                <button
                  onClick={() => {
                    setShowPrivacyNotice(false);
                    localStorage.setItem('opencut-privacy-agreed', 'true');
                  }}
                  className="bg-[#191919] hover:bg-black text-white text-xs font-bold px-6 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer active:scale-95"
                >
                  我知道了，开始使用
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {}
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

      {}
      <footer className="h-8 shrink-0 border-t border-[#D1D1D1] bg-[#F9F9F9] px-4 flex items-center justify-between font-mono text-xs text-[#666666] tracking-widest z-10 select-none">
        <div className="flex items-center gap-2">
          <span>OpenCut</span>
          <span className="text-[#AAAAAA] tracking-normal font-mono text-[10px]">v0.1.0</span>
          {isCheckingUpdate && (
            <span className="text-[#AAAAAA] tracking-normal text-[10px]">检查中...</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isInstallingUpdate && (
            <span className="text-amber-600 text-[10px] tracking-normal">正在安装更新...</span>
          )}
          {updateInfo && !isInstallingUpdate && (
            <button
              onClick={installUpdate}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all cursor-pointer tracking-normal flex items-center gap-1 shadow-sm"
            >
              <DownloadCloud className="w-3 h-3" />
              更新至 v{updateInfo.version}
            </button>
          )}
          {!updateInfo && !isInstallingUpdate && (
            <button
              onClick={() => checkForUpdate(false)}
              disabled={isCheckingUpdate}
              className="text-[#777777] hover:text-[#1A1A1A] text-[10px] font-bold transition-all cursor-pointer tracking-normal disabled:cursor-default disabled:opacity-50"
            >
              检查更新
            </button>
          )}
          <div className="flex gap-6 pr-1">
          {activeTab === 'image' ? (
            <>
              <span>[选择] 勾选圆圈多选</span>
              <span>[复制] 单击卡片图片复制</span>
              <span>[命名] 双击标题重命名</span>
              <span>[右键] 更多操作菜单</span>
              <span>[粘贴] Ctrl+V 快捷导入</span>
              <span>[框选] 鼠标拖拽批量选中</span>
            </>
          ) : activeTab === 'text' ? (
            <>
              <span>[选择] 勾选圆圈多选</span>
              <span>[复制] 单击内容快速复制</span>
              <span>[粘贴] Ctrl+V 快捷导入文本</span>
              <span>[删除] Delete 键删除选中</span>
              <span>[框选] 鼠标拖拽批量选中</span>
            </>
          ) : (
            <>
              <span>[保存] Cmd+Enter 快捷保存</span>
              <span>[记录] 保存后进入文本列表</span>
            </>
          )}
        </div>
        </div> {/* end right-side container */}
      </footer>
    </div>
  );
}
