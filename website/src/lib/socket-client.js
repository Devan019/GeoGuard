"use client";

let socket;

export function getSocket(clientId) {
  // 1. If it already exists, return it
  if (socket) {
    return socket;
  }

  // 2. IMPORTANT: If no clientId is provided, don't try to connect
  if (!clientId) {
    console.error("Cannot connect socket without a clientId!");
    return null;
  }

  // 3. Connect using the passed-in ID
  const wsUrl = process.env.NEXT_PUBLIC_SOCKET_URL  || "ws://127.0.0.1:8000/ws/ai-detections";
  socket = new window.WebSocket(`${wsUrl}/${clientId}`);

  return socket;
}

export function disconnectSocket() {
  if (!socket) {
    return;
  }

  socket.close();
  socket = undefined; 
}