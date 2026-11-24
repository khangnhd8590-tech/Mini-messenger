'use client';
import { useEffect } from 'react';
import { bindSocket } from '@/store/chat';

export function useChatSocket() {
  useEffect(() => bindSocket(), []);
}
