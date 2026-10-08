import { io } from "socket.io-client";

import type { RealtimeSocket, SocketFactory } from "./client";

export const socketIoFactory: SocketFactory = (url, options) =>
  io(url, { auth: options.auth, reconnectionDelayMax: options.reconnectionDelayMax, transports: ["websocket"] }) as unknown as RealtimeSocket;
