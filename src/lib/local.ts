import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Group, TextClip, UploadedImage } from '../types';

export interface ImagesResponse {
  groups: Group[];
  images: UploadedImage[];
}

export function resolveImageUrl(path: string): string {
  if (!path) return path;
  if (path.startsWith('asset://') || path.startsWith('data:')) {
    return path;
  }
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return '';
  }
  return convertFileSrc(path);
}

async function fileToBytes(file: File): Promise<number[]> {
  return Array.from(new Uint8Array(await file.arrayBuffer()));
}

export async function getImages(): Promise<ImagesResponse> {
  return invoke<ImagesResponse>('get_images');
}

export async function uploadImage(
  file: File,
  groupId?: string,
): Promise<UploadedImage> {
  return invoke<UploadedImage>('upload_image', {
    bytes: await fileToBytes(file),
    originalName: file.name || null,
    groupId: groupId && groupId !== 'all' ? groupId : null,
  });
}

export async function deleteImage(id: string): Promise<void> {
  await invoke('delete_image', { id });
}

export async function renameImage(id: string, name: string): Promise<void> {
  await invoke('rename_image', { id, name });
}

export async function moveImages(ids: string[], groupId: string): Promise<void> {
  await invoke('move_images', { ids, groupId });
}

export async function createGroup(name: string): Promise<Group> {
  return invoke<Group>('create_group', { name });
}

export async function renameGroup(id: string, name: string): Promise<Group> {
  return invoke<Group>('rename_group', { id, name });
}

export async function deleteGroup(id: string): Promise<void> {
  await invoke('delete_group', { id });
}

export async function getTexts(): Promise<TextClip[]> {
  return invoke<TextClip[]>('get_texts');
}

export async function saveText(content: string): Promise<TextClip> {
  return invoke<TextClip>('save_text', { content });
}

export async function togglePinText(id: string): Promise<TextClip> {
  return invoke<TextClip>('toggle_pin_text', { id });
}

export async function deleteText(id: string): Promise<void> {
  await invoke('delete_text', { id });
}

export async function updateText(id: string, content: string): Promise<TextClip> {
  return invoke<TextClip>('update_text', { id, content });
}

export async function clearUnpinnedTexts(): Promise<void> {
  await invoke('clear_unpinned_texts');
}

export async function copyImageToClipboard(id: string): Promise<void> {
  await invoke('copy_image_to_clipboard', { id });
}

export async function copyTextToClipboard(content: string): Promise<void> {
  await invoke('copy_text_to_clipboard', { content });
}

export async function openImagePath(path: string): Promise<void> {
  await invoke('open_local_image', { path });
}

export function onClipUpdated(callback: (kind: 'image' | 'text') => void): Promise<UnlistenFn> {
  return listen<string>('clip-updated', (event) => {
    if (event.payload === 'image' || event.payload === 'text') {
      callback(event.payload);
    }
  });
}
