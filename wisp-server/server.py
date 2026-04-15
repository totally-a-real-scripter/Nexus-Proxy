"""
Nexus Proxy — Wisp Server
A lightweight WebSocket-to-TCP tunnel following the Wisp protocol spec.
https://github.com/MercuryWorkshop/wisp-server-python

Wisp allows the browser (via Epoxy Transport) to open raw TCP/UDP streams
tunneled over a single WebSocket connection, enabling the proxy to reach
any TCP service (HTTP, HTTPS, raw sockets) without server-side per-request
HTTP overhead.

Architecture:
  Browser ──WS──▶ Wisp Server ──TCP──▶ Target Host
"""

import asyncio
import logging
import os
import struct
import socket
from typing import Optional

import websockets
from websockets.server import WebSocketServerProtocol

# ─── Configuration ─────────────────────────────────────────────────────────────
HOST        = os.environ.get("WISP_HOST", "0.0.0.0")
PORT        = int(os.environ.get("WISP_PORT", "7000"))
LOG_LEVEL   = os.environ.get("LOG_LEVEL", "INFO").upper()
MAX_PAYLOAD = int(os.environ.get("WISP_MAX_PAYLOAD", str(10 * 1024 * 1024)))  # 10MB

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("wisp")

# ─── Wisp Protocol Constants ───────────────────────────────────────────────────
# Packet types per spec: https://github.com/MercuryWorkshop/wisp-protocol
PACKET_CONNECT   = 0x01
PACKET_DATA      = 0x02
PACKET_CONTINUE  = 0x03
PACKET_CLOSE     = 0x04

STREAM_TYPE_TCP  = 0x01
STREAM_TYPE_UDP  = 0x02

CLOSE_OK             = 0x01
CLOSE_NETWORK_ERROR  = 0x02
CLOSE_INVALID        = 0x41

HEADER_SIZE = 5  # type (1) + stream_id (4)

def build_packet(ptype: int, stream_id: int, payload: bytes = b"") -> bytes:
    return struct.pack("<BI", ptype, stream_id) + payload

def parse_header(data: bytes) -> tuple[int, int, bytes]:
    if len(data) < HEADER_SIZE:
        raise ValueError("Packet too short")
    ptype, stream_id = struct.unpack_from("<BI", data)
    return ptype, stream_id, data[HEADER_SIZE:]


class WispStream:
    """Manages a single tunneled TCP stream."""

    def __init__(self, stream_id: int, ws: WebSocketServerProtocol,
                 host: str, port: int):
        self.stream_id = stream_id
        self.ws        = ws
        self.host      = host
        self.port      = port
        self.reader: Optional[asyncio.StreamReader]  = None
        self.writer: Optional[asyncio.StreamWriter]  = None
        self.closed    = False
        self.send_buffer_remaining = 128  # flow control

    async def connect(self) -> bool:
        try:
            self.reader, self.writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port), timeout=15
            )
            log.debug("Stream %d connected to %s:%d", self.stream_id, self.host, self.port)
            return True
        except Exception as exc:
            log.warning("Stream %d connect failed: %s", self.stream_id, exc)
            return False

    async def relay_to_client(self):
        """Read from TCP socket, forward to WebSocket client."""
        try:
            while not self.closed:
                chunk = await asyncio.wait_for(self.reader.read(65536), timeout=60)
                if not chunk:
                    break
                await self.ws.send(build_packet(PACKET_DATA, self.stream_id, chunk))
                # Replenish flow-control window
                await self.ws.send(
                    build_packet(PACKET_CONTINUE, self.stream_id,
                                 struct.pack("<I", 128))
                )
        except (asyncio.TimeoutError, asyncio.CancelledError):
            pass
        except Exception as exc:
            log.debug("Stream %d relay error: %s", self.stream_id, exc)
        finally:
            await self.close(CLOSE_NETWORK_ERROR)

    async def send_data(self, data: bytes):
        if self.writer and not self.closed:
            self.writer.write(data)
            await self.writer.drain()

    async def close(self, reason: int = CLOSE_OK):
        if self.closed:
            return
        self.closed = True
        try:
            await self.ws.send(
                build_packet(PACKET_CLOSE, self.stream_id, struct.pack("<B", reason))
            )
        except Exception:
            pass
        if self.writer:
            try:
                self.writer.close()
                await self.writer.wait_closed()
            except Exception:
                pass
        log.debug("Stream %d closed (reason=%d)", self.stream_id, reason)


async def handle_connection(ws: WebSocketServerProtocol):
    """Handle one WebSocket connection (= one Wisp session)."""
    remote = ws.remote_address
    log.info("New Wisp session from %s:%s", *remote)

    streams: dict[int, WispStream] = {}
    relay_tasks: dict[int, asyncio.Task] = {}

    # Send initial CONTINUE for stream 0 (session-level flow control)
    await ws.send(build_packet(PACKET_CONTINUE, 0, struct.pack("<I", 128)))

    try:
        async for message in ws:
            if isinstance(message, str):
                continue  # Wisp is binary-only
            if len(message) < HEADER_SIZE:
                continue

            try:
                ptype, stream_id, payload = parse_header(message)
            except ValueError:
                continue

            # ── CONNECT ──────────────────────────────────────────────────────
            if ptype == PACKET_CONNECT:
                if len(payload) < 3:
                    continue
                stream_type = payload[0]
                port        = struct.unpack_from("<H", payload, 1)[0]
                host        = payload[3:].decode("utf-8", errors="replace").rstrip("\x00")

                if stream_type != STREAM_TYPE_TCP:
                    # UDP not supported in this implementation
                    await ws.send(
                        build_packet(PACKET_CLOSE, stream_id,
                                     struct.pack("<B", CLOSE_INVALID))
                    )
                    continue

                stream = WispStream(stream_id, ws, host, port)
                if await stream.connect():
                    streams[stream_id] = stream
                    task = asyncio.create_task(stream.relay_to_client())
                    relay_tasks[stream_id] = task
                else:
                    await ws.send(
                        build_packet(PACKET_CLOSE, stream_id,
                                     struct.pack("<B", CLOSE_NETWORK_ERROR))
                    )

            # ── DATA ─────────────────────────────────────────────────────────
            elif ptype == PACKET_DATA:
                if stream_id in streams:
                    await streams[stream_id].send_data(payload)

            # ── CLOSE ────────────────────────────────────────────────────────
            elif ptype == PACKET_CLOSE:
                if stream_id in streams:
                    task = relay_tasks.pop(stream_id, None)
                    if task:
                        task.cancel()
                    await streams.pop(stream_id).close(CLOSE_OK)

    except websockets.exceptions.ConnectionClosed:
        log.info("Session from %s:%s closed", *remote)
    except Exception as exc:
        log.error("Session error: %s", exc)
    finally:
        # Clean up all open streams
        for task in relay_tasks.values():
            task.cancel()
        for stream in streams.values():
            await stream.close(CLOSE_NETWORK_ERROR)
        log.info("Session from %s:%s cleaned up", *remote)


async def main():
    log.info("Wisp server starting on %s:%d", HOST, PORT)
    async with websockets.serve(
        handle_connection,
        HOST,
        PORT,
        max_size=MAX_PAYLOAD,
        ping_interval=20,
        ping_timeout=20,
        compression=None,  # Disable per-message compression for performance
    ):
        log.info("Wisp server ready ✓")
        await asyncio.Future()  # Run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Wisp server stopped")
