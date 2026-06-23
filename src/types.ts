export interface Group {
  id: string;
  name: string;
  createdAt: number;
}

export interface UploadedImage {
  id: string;
  url: string;
  name: string;
  createdAt: number;
  groupId: string;
}

export interface TextClip {
  id: string;
  content: string;
  createdAt: number;
  isPinned?: boolean;
}

