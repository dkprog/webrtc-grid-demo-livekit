import os
import requests

LIVEKIT_TOKEN_ENDPOINT_URL = os.getenv(
    "LIVEKIT_TOKEN_ENDPOINT_URL",
    "https://cloud-api.livekit.io/api/v2/sandbox/connection-details",
)
LIVEKIT_TOKEN_SERVER_ID = os.environ["LIVEKIT_TOKEN_SERVER_ID"]
ROOM_NAME = "webrtc-grid-demo"


def fetch_token() -> str:
    resp = requests.post(
        LIVEKIT_TOKEN_ENDPOINT_URL,
        headers={"X-Sandbox-ID": LIVEKIT_TOKEN_SERVER_ID},
        json={
            "room_name": ROOM_NAME,
        },
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["participant_token"]


if __name__ == "__main__":
    token = fetch_token()
    print(token)
