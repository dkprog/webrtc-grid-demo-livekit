FROM ubuntu:24.04

RUN apt-get update && \
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-plugins-ugly \
    gstreamer1.0-libav \
    gstreamer1.0-nice \
    gstreamer1.0-tools \
    python3 \
    python3-pip \
    python3-gi \
    gir1.2-gstreamer-1.0 \
    gir1.2-gst-plugins-bad-1.0 && \
  apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /src

COPY src/ /src/

ENTRYPOINT ["python3", "main.py"]
