import { Server, type Socket } from 'socket.io';

const PORT = Number(process.env.PORT ?? 3001);

interface SignalingMessage {
  to: string;
  kind: string;
  payload: unknown;
}

type Role = 'producer' | 'consumer';

interface HandshakeAuth {
  peerId: string;
  role: Role;
}

const io = new Server(PORT, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

io.on('connection', (socket: Socket) => {
  const { peerId, role } = socket.handshake.auth as HandshakeAuth;
  if (!peerId || !role) {
    console.warn(`[${socket.id}] rejected (missing role or peerId)`);
    socket.disconnect(true);
    return;
  }

  socket.join(peerId);
  socket.join(role);

  console.log(`[${peerId}] ${role} connected.`);

  if (role === 'consumer') {
    // notify all producers about this new consumer
    io.to('producer').emit('consumer-connected', peerId);
  }

  socket.on('list-consumers', (callback: (ids: string[]) => void) => {
    const consumerSocketIds = io.sockets.adapter.rooms.get('consumer');
    if (!consumerSocketIds) {
      callback([]);
      return;
    }

    const consumerIds: string[] = [];
    for (const sid of consumerSocketIds) {
      const s = io.sockets.sockets.get(sid);
      if (s) {
        consumerIds.push((s.handshake.auth as HandshakeAuth).peerId);
      }
    }
    callback(consumerIds);
  });

  socket.on('message', ({ to, kind, payload }: SignalingMessage) => {
    if (!to || !kind) {
      return;
    }

    io.to(to).emit('message', {
      from: peerId,
      kind,
      payload,
    });
  });

  socket.on('disconnect', (reason: string) => {
    console.log(`[${peerId}] ${role} disconnected (${reason})`);
    if (role === 'consumer') {
      io.to('producer').emit('consumer-disconnected', peerId);
    } else if (role === 'producer') {
      io.to('consumer').emit('producer-disconnected', peerId);
    }
  });
});

console.log(`signaling server listening on :${PORT}`);
