# ruff: noqa: E402

import gi  # type: ignore
import logging
import os
import socketio  # type: ignore[import-not-found]
import signal
import secrets
from enum import Enum
from typing import Any

gi.require_version("Gst", "1.0")  # noqa
gi.require_version("GstWebRTC", "1.0")  # noqa

from gi.repository import Gst, GLib, GstWebRTC, GstSdp  # type: ignore


SIGNALING_URL = os.getenv("SIGNALING_URL", "http://localhost:3001")
STUN_SERVER = os.getenv("STUN_SERVER", "stun://stun.l.google.com:19302")
PATTERN = os.getenv("PATTERN", "ball")

log = logging.getLogger(__name__)
sio = socketio.Client(reconnection=True, handle_sigint=False, logger=True)


class ConsumerStatus(Enum):
    LOADING = "loading"
    CONNECTED = "connected"
    ERROR = "error"


class ConsumerPipeline:
    consumer_id: str
    pipeline: Gst.Pipeline
    tee: Gst.Element
    queue: Gst.Element
    webrtcbin: Gst.Element
    tee_src_pad: Gst.Pad | None
    status: ConsumerStatus

    class PrefixedLogger(logging.LoggerAdapter):
        def process(self, msg, kwargs):
            return f"[consumer={self.extra['cid']}] {msg}", kwargs

    def __init__(self, consumer_id: str, pipeline: Gst.Element, tee: Gst.Element):
        self.consumer_id = consumer_id
        self.pipeline = pipeline
        self.tee = tee
        self.status = ConsumerStatus.LOADING
        self.tee_src_pad = None
        self.log = self.PrefixedLogger(log, {"cid": consumer_id})

    def create(self) -> None:
        self.create_elements()
        self.link_elements()

    def create_elements(self) -> None:
        self.queue = Gst.ElementFactory.make("queue", f"queue_{self.consumer_id}")
        self.queue.set_property("leaky", 2)
        self.queue.set_property("max-size-buffers", 0)
        self.queue.set_property("max-size-bytes", 0)
        self.queue.set_property("max-size-time", 500_000_000)
        self.pipeline.add(self.queue)

        self.webrtcbin = Gst.ElementFactory.make(
            "webrtcbin", f"webrtcbin_{self.consumer_id}"
        )
        self.webrtcbin.set_property("bundle-policy", "max-bundle")
        self.webrtcbin.set_property("stun-server", STUN_SERVER)
        self.pipeline.add(self.webrtcbin)

    def link_elements(self) -> None:
        self.tee_src_pad = self.tee.request_pad_simple("src_%u")
        if not self.tee_src_pad:
            self.log.error("Failed to request pad from tee")
            self.status = ConsumerStatus.ERROR
            return

        queue_sink_pad = self.queue.get_static_pad("sink")
        result = self.tee_src_pad.link(queue_sink_pad)
        if result != Gst.PadLinkReturn.OK:
            self.log.error(f"Failed to link tee to queue: {result}")
            self.status = ConsumerStatus.ERROR
            return

        if not self.queue.link(self.webrtcbin):
            self.log.error("Failed to link queue to webrtcbin")
            self.status = ConsumerStatus.ERROR
            return

        self.webrtcbin.connect(
            "on-negotiation-needed", self.on_webrtcbin_negotiation_needed
        )
        self.webrtcbin.connect("on-ice-candidate", self.on_webrtc_ice_candidate)
        self.webrtcbin.connect(
            "notify::ice-connection-state",
            self.on_webrtcbin_ice_connection_state_changed,
        )
        self.webrtcbin.connect(
            "notify::ice-gathering-state", self.on_webrtcbin_ice_gathering_state_changed
        )
        self.webrtcbin.connect(
            "notify::signaling-state", self.on_webrtcbin_signaling_state
        )
        self.webrtcbin.connect(
            "notify::connection-state", self.on_webrtcbin_connection_state_changed
        )

        self.queue.sync_state_with_parent()
        self.webrtcbin.sync_state_with_parent()

    def on_webrtcbin_negotiation_needed(self, element: Gst.Element) -> None:
        self.log.info("WebRTC: negotiation needed")

        promise = Gst.Promise.new_with_change_func(self.on_offer_created, None)
        self.webrtcbin.emit("create-offer", None, promise)

    def on_webrtc_ice_candidate(
        self, element: Gst.Element, mline_index: int, candidate: str
    ) -> None:
        self.log.info(f"WebRTC local ICE candidate: {candidate}")

        sio.emit(
            "message",
            {
                "to": self.consumer_id,
                "kind": "ice-candidate",
                "payload": {"sdpMLineIndex": mline_index, "candidate": candidate},
            },
        )

    def on_webrtcbin_ice_connection_state_changed(self, element: Gst.Element, pspec):
        state = element.get_property("ice-connection-state")
        if state.value_nick in ("failed", "closed"):
            self.log.error(f"WebRTC ICE terminal state: {state.value_nick}")
            self.status = ConsumerStatus.ERROR
            return
        self.log.info(f"WebRTC ICE connection state: {state.value_nick}")

    def on_webrtcbin_ice_gathering_state_changed(self, element: Gst.Element, pspec):
        state = element.get_property("ice-gathering-state")
        self.log.info(f"WebRTC ICE gathering state: {state.value_nick}")

    def on_webrtcbin_signaling_state(self, element: Gst.Element, pspec):
        state = element.get_property("signaling-state")
        if state.value_nick == "closed":
            self.log.error("WebRTC signaling closed")
            self.status = ConsumerStatus.ERROR
            return
        self.log.info(f"WebRTC signaling state: {state.value_nick}")

    def on_webrtcbin_connection_state_changed(self, element: Gst.Element, pspec):
        state = element.get_property("connection-state")
        if state.value_nick in ("failed", "closed"):
            self.log.error(f"WebRTC peer connection terminal state: {state.value_nick}")
            self.status = ConsumerStatus.ERROR
            return
        if state.value_nick == "connected":
            self.status = ConsumerStatus.CONNECTED
            Gst.debug_bin_to_dot_file(
                self.pipeline,
                Gst.DebugGraphDetails.ALL,
                f"pipeline.{self.consumer_id}.connected",
            )
        self.log.info(f"WebRTC peer connection state: {state.value_nick}")

    def on_offer_created(self, promise: Gst.Promise, user_data: Any) -> None:
        reply = promise.get_reply()
        offer = reply.get_value("offer")
        offer = GstWebRTC.WebRTCSessionDescription.new(offer.type, offer.sdp)
        self.webrtcbin.emit("set-local-description", offer, None)
        sdp_text = offer.sdp.as_text()
        self.log.info(f"WebRTC offer created, {sdp_text}")
        payload = {"type": "offer", "sdp": sdp_text}
        sio.emit(
            "message", {"to": self.consumer_id, "kind": "offer", "payload": payload}
        )

    def add_ice_candidate(self, mline_index: int, candidate: str) -> None:
        self.log.info(f"Adding remote ICE candidate: {candidate}")
        self.webrtcbin.emit("add-ice-candidate", mline_index, candidate)

    def add_answer(self, sdp_text: str) -> None:
        self.log.info(f"Setting remote answer: {sdp_text}")
        res, sdp = GstSdp.SDPMessage.new_from_text(sdp_text)
        if res != GstSdp.SDPResult.OK:
            self.log.error(f"Failed to parse SDP answer: {res}")
            return
        answer = GstWebRTC.WebRTCSessionDescription.new(
            GstWebRTC.WebRTCSDPType.ANSWER, sdp
        )
        promise = Gst.Promise.new()
        self.webrtcbin.emit("set-remote-description", answer, promise)
        promise.interrupt()

    def destroy(self) -> None:
        if self.tee_src_pad is not None:
            queue_sink_pad = self.queue.get_static_pad("sink")
            self.tee_src_pad.unlink(queue_sink_pad)
            self.tee.release_request_pad(self.tee_src_pad)
            self.tee_src_pad = None

        self.webrtcbin.set_state(Gst.State.NULL)
        self.queue.set_state(Gst.State.NULL)
        self.pipeline.remove(self.webrtcbin)
        self.pipeline.remove(self.queue)
        self.log.info("Consumer pipeline destroyed")


class WebRtcPipeline:
    pipeline: Gst.Pipeline
    src: Gst.Element
    caps_src: Gst.Element
    videoconvert: Gst.Element
    queue: Gst.Element
    vp8enc: Gst.Element
    rtppay: Gst.Element
    caps_rtp: Gst.Element
    tee: Gst.Element
    sentinel: Gst.Element
    consumers: dict[str, "ConsumerPipeline"]

    def __init__(self, loop: GLib.MainLoop):
        self.loop = loop
        self.consumers = dict()

    def create(self) -> None:
        self.pipeline = Gst.Pipeline.new(__package__)
        self.create_elements()
        self.link_elements()

    def create_elements(self) -> None:
        self.src = Gst.ElementFactory.make("videotestsrc", "src")
        self.src.set_property("pattern", PATTERN)
        self.src.set_property("is-live", True)
        self.pipeline.add(self.src)

        self.caps_src = Gst.ElementFactory.make("capsfilter", "caps_src")
        caps = Gst.Caps.from_string("video/x-raw,width=320,height=240,framerate=30/1")
        self.caps_src.set_property("caps", caps)
        self.pipeline.add(self.caps_src)

        self.videoconvert = Gst.ElementFactory.make("videoconvert", "videoconvert")
        self.pipeline.add(self.videoconvert)

        self.queue = Gst.ElementFactory.make("queue", "queue")
        self.pipeline.add(self.queue)

        self.vp8enc = Gst.ElementFactory.make("vp8enc", "vp8enc")
        self.vp8enc.set_property("deadline", 1)
        self.vp8enc.set_property("cpu-used", 4)
        self.vp8enc.set_property("error-resilient", 1)
        self.vp8enc.set_property("keyframe-max-dist", 30)
        self.vp8enc.set_property("target-bitrate", 1000000)
        self.pipeline.add(self.vp8enc)

        self.rtppay = Gst.ElementFactory.make("rtpvp8pay", "rtppay")
        self.rtppay.set_property("pt", 96)
        self.pipeline.add(self.rtppay)

        self.caps_rtp = Gst.ElementFactory.make("capsfilter", "caps_rtp")
        caps = Gst.Caps.from_string(
            "application/x-rtp,media=video,encoding-name=VP8,payload=96,clock-rate=90000"
        )
        self.caps_rtp.set_property("caps", caps)
        self.pipeline.add(self.caps_rtp)

        self.tee = Gst.ElementFactory.make("tee", "tee")
        self.pipeline.add(self.tee)

        self.sentinel = Gst.ElementFactory.make("fakesink", "sentinel")
        self.sentinel.set_property("sync", False)
        self.sentinel.set_property("async", False)
        self.pipeline.add(self.sentinel)

    def link_elements(self) -> None:
        self.src.link(self.caps_src)
        self.caps_src.link(self.videoconvert)
        self.videoconvert.link(self.queue)
        self.queue.link(self.vp8enc)
        self.vp8enc.link(self.rtppay)
        self.rtppay.link(self.caps_rtp)
        self.caps_rtp.link(self.tee)
        self.tee.link(self.sentinel)

    def play(self) -> None:
        self.pipeline.set_state(Gst.State.PLAYING)
        log.info("Pipeline is now playing...")

    def observe_events(self) -> None:
        bus = self.pipeline.get_bus()
        bus.add_signal_watch()
        bus.connect("message", self.on_bus_message, self.pipeline)

    def on_bus_message(
        self, bus: Gst.Bus, message: Gst.Message, pipeline: Gst.Pipeline
    ) -> None:
        if message.src != self.pipeline:
            return

        if message.type == Gst.MessageType.STATE_CHANGED:
            old, new, pending = message.parse_state_changed()
            if old != new:
                log.info(
                    f"Pipeline state {old.value_nick.upper()} => {new.value_nick.upper()}"
                )
            # when GST_DEBUG_DUMP_DOT_DIR is set, create pipeline dot file
            Gst.debug_bin_to_dot_file(
                self.pipeline, Gst.DebugGraphDetails.ALL, f"pipeline.{new.value_nick}"
            )
        elif message.type == Gst.MessageType.ERROR:
            err, dbg = message.parse_error()
            log.error("Error: %s %s", err, dbg)
            self.loop.quit()

    def stop(self) -> None:
        log.info("Stopping WebRTC Pipeline...")

        self.pipeline.set_state(Gst.State.NULL)

        # Drain any pending messages
        bus = self.pipeline.get_bus()
        while True:
            msg = bus.pop()
            if not msg:
                break
            if msg.type == Gst.MessageType.ERROR:
                err, dbg = msg.parse_error()
                log.error("Error on shutdown: %s %s", err, dbg)

    def add_consumer(self, consumer_id: str) -> None:
        existing = self.consumers.get(consumer_id)

        if existing is not None:
            if existing.status == ConsumerStatus.ERROR:
                log.info(f"Replacing errored consumer {consumer_id}")
                self.drop_consumer(consumer_id)
            else:
                log.debug(f"Consumer {consumer_id} already exists, ignoring")
                return

        consumer = ConsumerPipeline(
            consumer_id=consumer_id,
            pipeline=self.pipeline,
            tee=self.tee,
        )
        consumer.create()
        self.consumers[consumer_id] = consumer
        log.info(f"Added consumer {consumer_id}")

    def drop_consumer(self, consumer_id: str) -> None:
        consumer = self.consumers.pop(consumer_id, None)
        if consumer is None:
            log.debug(f"Consumer {consumer_id} not found, nothing to drop")
            return

        consumer.destroy()
        log.info(f"Dropped consumer {consumer_id}")

    def add_ice_candidate(
        self, consumer_id: str, mline_index: int, candidate: str
    ) -> None:
        consumer = self.consumers.get(consumer_id)
        if consumer is None:
            log.warning(f"ICE candidate for unknown consumer {consumer_id}")
            return
        consumer.add_ice_candidate(mline_index, candidate)

    def add_answer(self, consumer_id: str, sdp_text: str) -> None:
        consumer = self.consumers.get(consumer_id)
        if consumer is None:
            log.warning(f"Answer for unknown consumer {consumer_id}")
            return
        consumer.add_answer(sdp_text)


def generate_peer_id() -> str:
    return secrets.token_hex(4)


if __name__ == "__main__":
    Gst.init(None)

    peer_id = generate_peer_id()

    logging.basicConfig(
        level=logging.INFO,
        format=f"[gst-producer] [producer={peer_id}] [%(levelname)s] %(message)s",
    )

    loop = GLib.MainLoop()
    webrtc_pipeline = WebRtcPipeline(loop=loop)
    webrtc_pipeline.create()
    webrtc_pipeline.observe_events()
    webrtc_pipeline.play()

    def handle_exit(sig, frame):
        sig_name = signal.Signals(sig).name
        log.info(f"Received {sig_name}. leaving...")
        webrtc_pipeline.stop()
        loop.quit()

    signal.signal(signal.SIGTERM, handle_exit)
    signal.signal(signal.SIGINT, handle_exit)

    @sio.event
    def connect():
        log.info("Websocket: connected")

    @sio.event
    def connect_error(data):
        log.info(f"Websocket: connect_error {data}")
        loop.quit()

    @sio.event
    def disconnect():
        log.info("Websocket: disconnect")
        loop.quit()

    @sio.on("message")
    def on_message(message):
        sender = message.get("from")
        kind = message.get("kind")
        payload = message.get("payload")

        if kind == "answer":
            sdp_text = payload.get("sdp") if isinstance(payload, dict) else payload
            GLib.idle_add(webrtc_pipeline.add_answer, sender, sdp_text)
        elif kind == "ice-candidate":
            GLib.idle_add(
                webrtc_pipeline.add_ice_candidate,
                sender,
                payload["sdpMLineIndex"],
                payload["candidate"],
            )

    @sio.on("consumer-connected")
    def on_consumer_connected(consumer_id):
        log.info(f"Websocket: consumer {consumer_id} connected")
        GLib.idle_add(webrtc_pipeline.add_consumer, consumer_id)

    @sio.on("consumer-disconnected")
    def on_consumer_disconnected(consumer_id):
        log.info(f"Websocket: consumer {consumer_id} disconnected")
        GLib.idle_add(webrtc_pipeline.drop_consumer, consumer_id)

    def on_consumers(consumer_ids):
        log.info(f"Websocket: existing consumers: {consumer_ids}")
        for cid in consumer_ids:
            GLib.idle_add(webrtc_pipeline.add_consumer, cid)

    sio.connect(
        SIGNALING_URL,
        transports=["websocket"],
        auth={"peerId": peer_id, "role": "producer"},
    )

    sio.emit("list-consumers", callback=on_consumers)

    loop.run()

    sio.disconnect()

    log.info("Goodbye.")
