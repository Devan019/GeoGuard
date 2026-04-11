"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { disconnectSocket, getSocket } from "@/lib/socket-client";

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const clientId = useMemo(() => Math.random().toString(36).substring(2, 15), []);

  // 1. Translated from socket.emit() -> socket.send()
  const sendMessage = useCallback(
    (eventName, payload) => {
      // Native WebSockets use readyState to check connection
      if (!socket || socket.readyState !== window.WebSocket.OPEN || !eventName) {
        return;
      }

      // Native WebSockets can only send strings, so we stringify a custom object
      const messageString = JSON.stringify({ event: eventName, data: payload });
      socket.send(messageString);
    },
    [socket]
  );

  // 2. Translated from socket.on() -> socket.addEventListener()
  const receiveMessage = useCallback(
    (eventName, handler) => {
      if (!socket || !eventName || typeof handler !== "function") {
        return () => {};
      }

      // Native sockets receive ALL messages here. We must parse it and filter by eventName.
      const messageListener = (event) => {
        try {
          const parsedMessage = JSON.parse(event.data);
          // If the message matches the event name we are listening for, trigger the handler
          if (parsedMessage.event === eventName) {
            handler(parsedMessage.data);
          }
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };

      socket.addEventListener("message", messageListener);

      // Cleanup function
      return () => {
        socket.removeEventListener("message", messageListener);
      };
    },
    [socket]
  );

  useEffect(() => {
    const socketInstance = getSocket(clientId);
    setSocket(socketInstance);

    // Initial check in case it connects instantly
    setIsConnected(socketInstance.readyState === window.WebSocket.OPEN);

    // 3. Translated connection events
    const handleConnect = () => {
      console.log("🟢 Socket Connected!", clientId);
      setIsConnected(true);
    };

    const handleDisconnect = () => {
      console.log("🔴 Socket Disconnected!", clientId);
      setIsConnected(false);
    };

    // Native WebSockets use 'open' and 'close' instead of 'connect' and 'disconnect'
    socketInstance.addEventListener("open", handleConnect);
    socketInstance.addEventListener("close", handleDisconnect);

    return () => {
      socketInstance.removeEventListener("open", handleConnect);
      socketInstance.removeEventListener("close", handleDisconnect);
      disconnectSocket();
    };
  }, [clientId]);

  const value = useMemo(
    () => ({
      socket,
      isConnected,
      sendMessage,
      receiveMessage,
    }),
    [socket, isConnected, sendMessage, receiveMessage]
  );

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);

  if (!context) {
    throw new Error("useSocket must be used inside SocketProvider");
  }

  return context;
}