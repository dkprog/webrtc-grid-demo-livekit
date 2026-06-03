# ruff: noqa: E402

import gi  # type: ignore
import logging
import os
import signal
import secrets
from enum import Enum
from typing import Any

gi.require_version("Gst", "1.0")  # noqa

from gi.repository import Gst, GLib  # type: ignore

PATTERN = os.getenv("PATTERN", "ball")

log = logging.getLogger(__name__)


class ProducerPipeline:
    pipeline: Gst.Pipeline
    src: Gst.Element
    caps_src: Gst.Element
    videoconvert: Gst.Element
    queue: Gst.Element
    vp8enc: Gst.Element
    rtppay: Gst.Element
    caps_rtp: Gst.Element
    sink: Gst.Element

    def __init__(self, loop: GLib.MainLoop):
        self.loop = loop

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

        self.sink = Gst.ElementFactory.make("fakesink", "sink")
        self.sink.set_property("sync", False)
        self.sink.set_property("async", False)
        self.pipeline.add(self.sink)

    def link_elements(self) -> None:
        self.src.link(self.caps_src)
        self.caps_src.link(self.videoconvert)
        self.videoconvert.link(self.queue)
        self.queue.link(self.vp8enc)
        self.vp8enc.link(self.rtppay)
        self.rtppay.link(self.caps_rtp)
        self.caps_rtp.link(self.sink)

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


if __name__ == "__main__":
    Gst.init(None)

    peer_id = "foobar"

    logging.basicConfig(
        level=logging.INFO,
        format=f"[gst-producer] [producer={peer_id}] [%(levelname)s] %(message)s",
    )

    loop = GLib.MainLoop()
    producer_pipeline = ProducerPipeline(loop=loop)
    producer_pipeline.create()
    producer_pipeline.observe_events()
    producer_pipeline.play()

    def handle_exit(sig, frame):
        sig_name = signal.Signals(sig).name
        log.info(f"Received {sig_name}. leaving...")
        producer_pipeline.stop()
        loop.quit()

    signal.signal(signal.SIGTERM, handle_exit)
    signal.signal(signal.SIGINT, handle_exit)

    loop.run()

    log.info("Goodbye.")
