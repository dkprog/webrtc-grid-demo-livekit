# ruff: noqa: E402

import gi  # type: ignore
import asyncio
import threading
import logging
import os
import signal
from livekit_token import fetch_token
from livekit import rtc

gi.require_version("Gst", "1.0")  # noqa

from gi.repository import Gst, GLib  # type: ignore

FRAME_WIDTH, FRAME_HEIGHT = 320, 240
LIVEKIT_URL = os.environ["LIVEKIT_URL"]
PATTERN = os.getenv("PATTERN", "ball")


log = logging.getLogger(__name__)
lk_loop = asyncio.new_event_loop()


class ProducerPipeline:
    pipeline: Gst.Pipeline
    src: Gst.Element
    caps_src: Gst.Element
    sink: Gst.Element

    def __init__(self, loop: GLib.MainLoop, video_source: rtc.VideoSource):
        self.loop = loop
        self.video_source = video_source

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
        caps = Gst.Caps.from_string(
            f"video/x-raw,format=RGBA,width={FRAME_WIDTH},height={FRAME_HEIGHT},framerate=30/1"
        )
        self.caps_src.set_property("caps", caps)
        self.pipeline.add(self.caps_src)

        self.sink = Gst.ElementFactory.make("appsink", "sink")
        self.sink.set_property("emit-signals", True)
        self.sink.set_property("sync", False)
        self.sink.set_property("drop", True)
        self.sink.set_property("max-buffers", 2)
        self.pipeline.add(self.sink)

    def link_elements(self) -> None:
        self.src.link(self.caps_src)
        self.caps_src.link(self.sink)
        self.sink.connect("new-sample", self.on_new_sample)

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

    def on_new_sample(self, sink: Gst.Element):
        sample = sink.emit("pull-sample")
        if not sample:
            return Gst.FlowReturn.ERROR
        buf = sample.get_buffer()
        ok, mapinfo = buf.map(Gst.MapFlags.READ)
        if ok:
            frame = rtc.VideoFrame(
                width=FRAME_WIDTH,
                height=FRAME_HEIGHT,
                type=rtc.VideoBufferType.RGBA,
                data=bytes(mapinfo.data),
            )
            self.video_source.capture_frame(frame)
            buf.unmap(mapinfo)
        return Gst.FlowReturn.OK

    def stop(self) -> None:
        log.info("Stopping Producer Pipeline...")

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


async def livekit_main(video_source: rtc.VideoSource):
    token = fetch_token()
    room = rtc.Room()
    await room.connect(LIVEKIT_URL, token)
    log.info(f"LiveKit connected: {room.name}")

    track = rtc.LocalVideoTrack.create_video_track("gst-video", video_source)
    await room.local_participant.publish_track(
        track,
        rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_CAMERA),
    )
    log.info("LiveKit track published")

    await asyncio.Event().wait()


def start_livekit(video_source: rtc.VideoSource):
    asyncio.set_event_loop(lk_loop)
    lk_loop.run_until_complete(livekit_main(video_source))


if __name__ == "__main__":
    Gst.init(None)

    logging.basicConfig(
        level=logging.INFO,
        format=f"[gst-producer] [pattern={PATTERN}] [%(levelname)s] %(message)s",
    )

    video_source = rtc.VideoSource(width=FRAME_WIDTH, height=FRAME_HEIGHT)

    livekit_thread = threading.Thread(
        target=start_livekit, args=(video_source,), daemon=True
    )
    livekit_thread.start()

    loop = GLib.MainLoop()
    producer_pipeline = ProducerPipeline(loop=loop, video_source=video_source)
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
