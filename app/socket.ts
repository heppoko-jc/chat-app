// app/socket.ts
import { io, Socket } from 'socket.io-client';

// 環境変数が無ければローカルをフォールバック
const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || 'ws://localhost:3001';

// クライアントを初期化
const socket: Socket = io(SOCKET_URL, {
  transports: ['websocket'],
  withCredentials: true, // 既存どおり（不要なら外してOK）
});

let currentUserId: string | null = null;

/**
 * ログイン後や初期化時に呼ぶ。
 * 接続済みなら即 "setUserId" を送信し、再接続時も自動で再送する。
 */
export function setSocketUserId(uid: string | null) {
  currentUserId = uid;
  if (uid) {
    socket.emit('setUserId', uid);
  }
}

// 再接続時にもユーザールームに復帰
socket.on('connect', () => {
  if (currentUserId) {
    socket.emit('setUserId', currentUserId);
  }
});

export { socket };
export default socket;