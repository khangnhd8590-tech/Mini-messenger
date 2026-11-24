import { io } from 'socket.io-client';
import { API, getToken } from './api';

let socket = null;

export function connectSocket() {
  if (!socket) {
    socket = io(API, {
      auth: (cb) => cb({ token: getToken() }),   // token đọc lại mỗi lần (re)connect
      transports: ['websocket'],
      // Tự động kết nối lại khi đứt mạng hoặc server restart
      reconnection: true,
      reconnectionDelay: 500,        // thử lại sau 0.5s ...
      reconnectionDelayMax: 5000,    // ... tăng dần, tối đa 5s
      randomizationFactor: 0.3,
      reconnectionAttempts: 50,      // ~4 phút; hết thì hiện nút "Kết nối lại"
      timeout: 8000,                 // thời gian chờ mỗi lần bắt tay
    });
  }
  return socket;
}
export const getSocket = () => socket;
export function disconnectSocket() {
  if (socket) socket.disconnect();
  socket = null;
}
