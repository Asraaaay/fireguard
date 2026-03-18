#!/usr/bin/env python3
"""
FireGuard Demo Simulator
========================
Simulates an ESP32 fire-detection sensor node, publishing realistic
temperature, humidity, and fire-event data to the FireGuard web dashboard
via MQTT.

Usage:
    pip install paho-mqtt
    python demo_simulator.py

The script runs through several demo scenarios automatically:
  1. Normal monitoring  – steady ~28 °C, ~55 % RH
  2. Gradual heat rise  – temperature climbs toward the threshold
  3. Fire event         – fire flag ON, temperature spike
  4. Fire extinguished  – cooling back to normal
  5. Loop / exit

Press Ctrl+C at any time to stop.
"""

import json
import time
import random
import signal
import sys

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("❌  paho-mqtt is not installed.")
    print("   Install it with:  pip install paho-mqtt")
    sys.exit(1)

# ─── MQTT Configuration (must match the dashboard) ──────────────────────────
BROKER        = "broker.hivemq.com"
PORT          = 1883
TOPIC_DATA      = "fireguard/data"
TOPIC_LOGS      = "fireguard/logs"
TOPIC_HEARTBEAT = "fireguard/heartbeat"
TOPIC_THRESHOLD = "fireguard/threshold"

# ─── Timing ─────────────────────────────────────────────────────────────────
DATA_INTERVAL      = 2.0   # seconds between sensor readings
HEARTBEAT_INTERVAL = 3.0   # seconds between heartbeats


# ─── Helpers ────────────────────────────────────────────────────────────────
def clamp(val, lo, hi):
    return max(lo, min(hi, val))


def timestamp():
    return time.strftime("%H:%M:%S")


# ─── MQTT callbacks ────────────────────────────────────────────────────────
def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print(f"[{timestamp()}] ✅  Connected to MQTT broker ({BROKER})")
        client.subscribe("fireguard/threshold/set")
        client.subscribe("fireguard/override")
        client.publish(TOPIC_LOGS, "🔧 [Demo] ESP32 simulator connected")
        # Publish default threshold
        client.publish(TOPIC_THRESHOLD, json.dumps({"threshold": 50.0}))
    else:
        print(f"[{timestamp()}] ❌  Connection failed (rc={rc})")


def on_message(client, userdata, msg):
    topic = msg.topic
    payload = msg.payload.decode()
    if topic == "fireguard/threshold/set":
        try:
            new_threshold = float(payload)
            print(f"[{timestamp()}] 🎛️   Threshold set to {new_threshold}°C")
            client.publish(TOPIC_THRESHOLD, json.dumps({"threshold": new_threshold}))
        except ValueError:
            pass
    elif topic == "fireguard/override":
        print(f"[{timestamp()}] 🔘  Override command: {payload}")


def on_disconnect(client, userdata, flags, rc, properties=None):
    print(f"[{timestamp()}] ⚠️   Disconnected (rc={rc})")


# ─── Graceful shutdown ─────────────────────────────────────────────────────
running = True

def handle_exit(sig, frame):
    global running
    running = False
    print(f"\n[{timestamp()}] 🛑  Shutting down…")

signal.signal(signal.SIGINT, handle_exit)
signal.signal(signal.SIGTERM, handle_exit)


# ═══════════════════════════════════════════════════════════════════════════
#  DEMO SCENARIOS
# ═══════════════════════════════════════════════════════════════════════════
def scenario_normal(client, duration=20):
    """Normal monitoring – temp ~28 °C, humidity ~55 %."""
    print(f"\n{'='*60}")
    print(f"  📊  SCENARIO 1 — Normal Monitoring  ({duration}s)")
    print(f"{'='*60}")
    client.publish(TOPIC_LOGS, "📊 [Demo] Starting normal monitoring scenario")

    temp = 28.0
    humidity = 55.0
    end = time.time() + duration
    last_hb = 0

    while running and time.time() < end:
        temp = clamp(temp + random.uniform(-0.3, 0.3), 25, 32)
        humidity = clamp(humidity + random.uniform(-0.5, 0.5), 45, 65)

        payload = json.dumps({
            "temp": round(temp, 1),
            "humidity": round(humidity, 1),
            "fire": False,
        })
        client.publish(TOPIC_DATA, payload)
        print(f"[{timestamp()}]   🌡️  {temp:.1f}°C   💧 {humidity:.1f}%   🔥 No")

        now = time.time()
        if now - last_hb >= HEARTBEAT_INTERVAL:
            client.publish(TOPIC_HEARTBEAT, "alive")
            last_hb = now

        time.sleep(DATA_INTERVAL)


def scenario_heat_rise(client, duration=25):
    """Temperature gradually increases toward threshold."""
    print(f"\n{'='*60}")
    print(f"  🔺  SCENARIO 2 — Gradual Heat Rise  ({duration}s)")
    print(f"{'='*60}")
    client.publish(TOPIC_LOGS, "🔺 [Demo] Temperature rising — approaching threshold")

    temp = 32.0
    humidity = 50.0
    end = time.time() + duration
    last_hb = 0
    step = (50.0 - 32.0) / (duration / DATA_INTERVAL)

    while running and time.time() < end:
        temp = clamp(temp + step + random.uniform(-0.2, 0.2), 30, 52)
        humidity = clamp(humidity - 0.3 + random.uniform(-0.2, 0.2), 30, 55)

        payload = json.dumps({
            "temp": round(temp, 1),
            "humidity": round(humidity, 1),
            "fire": False,
        })
        client.publish(TOPIC_DATA, payload)
        indicator = "⚠️" if temp > 45 else "🌡️"
        print(f"[{timestamp()}]   {indicator}  {temp:.1f}°C   💧 {humidity:.1f}%   🔥 No")

        now = time.time()
        if now - last_hb >= HEARTBEAT_INTERVAL:
            client.publish(TOPIC_HEARTBEAT, "alive")
            last_hb = now

        time.sleep(DATA_INTERVAL)


def scenario_fire(client, duration=15):
    """Fire detected! Temperature spikes, fire flag ON."""
    print(f"\n{'='*60}")
    print(f"  🔥  SCENARIO 3 — FIRE DETECTED!  ({duration}s)")
    print(f"{'='*60}")
    client.publish(TOPIC_LOGS, "🔥🔥🔥 [Demo] FIRE DETECTED! Immediate action required!")

    temp = 55.0
    humidity = 25.0
    end = time.time() + duration
    last_hb = 0

    while running and time.time() < end:
        temp = clamp(temp + random.uniform(0.5, 2.0), 50, 80)
        humidity = clamp(humidity - random.uniform(0.3, 1.0), 10, 30)

        payload = json.dumps({
            "temp": round(temp, 1),
            "humidity": round(humidity, 1),
            "fire": True,
        })
        client.publish(TOPIC_DATA, payload)
        print(f"[{timestamp()}]   🔥 {temp:.1f}°C   💧 {humidity:.1f}%   🔥 YES ‼️")

        now = time.time()
        if now - last_hb >= HEARTBEAT_INTERVAL:
            client.publish(TOPIC_HEARTBEAT, "alive")
            last_hb = now

        time.sleep(DATA_INTERVAL)


def scenario_cooldown(client, duration=20):
    """Fire extinguished – temperature drops back to normal."""
    print(f"\n{'='*60}")
    print(f"  ❄️  SCENARIO 4 — Cooling Down  ({duration}s)")
    print(f"{'='*60}")
    client.publish(TOPIC_LOGS, "✅ [Demo] Fire extinguished. System cooling down.")

    temp = 55.0
    humidity = 25.0
    end = time.time() + duration
    last_hb = 0
    step = (55.0 - 28.0) / (duration / DATA_INTERVAL)

    while running and time.time() < end:
        temp = clamp(temp - step + random.uniform(-0.3, 0.3), 26, 60)
        humidity = clamp(humidity + 0.8 + random.uniform(-0.2, 0.2), 20, 60)

        fire = temp > 50
        payload = json.dumps({
            "temp": round(temp, 1),
            "humidity": round(humidity, 1),
            "fire": fire,
        })
        client.publish(TOPIC_DATA, payload)
        print(f"[{timestamp()}]   ❄️  {temp:.1f}°C   💧 {humidity:.1f}%   🔥 {'Yes' if fire else 'No'}")

        now = time.time()
        if now - last_hb >= HEARTBEAT_INTERVAL:
            client.publish(TOPIC_HEARTBEAT, "alive")
            last_hb = now

        time.sleep(DATA_INTERVAL)


# ═══════════════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════════════
def main():
    print(r"""
    ╔═══════════════════════════════════════════════════╗
    ║         🔥  FireGuard Demo Simulator  🔥          ║
    ║                                                   ║
    ║  Simulates ESP32 sensor data for the dashboard.   ║
    ║  Open the dashboard in your browser to watch!     ║
    ║                                                   ║
    ║  Press Ctrl+C to stop.                            ║
    ╚═══════════════════════════════════════════════════╝
    """)

    # Connect to MQTT
    client = mqtt.Client(
        client_id=f"fireguard_demo_{random.randint(1000,9999)}",
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
    )
    client.on_connect    = on_connect
    client.on_message    = on_message
    client.on_disconnect = on_disconnect

    # Retry connection with graceful error handling
    max_retries = 10
    for attempt in range(1, max_retries + 1):
        if not running:
            return
        try:
            print(f"[{timestamp()}] 🔌  Connecting to {BROKER}:{PORT} … (attempt {attempt}/{max_retries})")
            client.connect(BROKER, PORT, keepalive=60)
            client.loop_start()
            print(f"[{timestamp()}] ✅  TCP connection established, waiting for MQTT handshake…")
            time.sleep(2)
            break
        except (OSError, ConnectionRefusedError, TimeoutError) as e:
            print(f"[{timestamp()}] ❌  Connection failed: {e}")
            if attempt < max_retries:
                wait = 5
                print(f"[{timestamp()}] ⏳  Retrying in {wait}s… (check your internet connection)")
                for _ in range(wait * 10):
                    if not running:
                        return
                    time.sleep(0.1)
            else:
                print(f"[{timestamp()}] 💀  Could not connect after {max_retries} attempts.")
                print(f"             Please check your internet connection and try again.")
                return

    # ── Run demo scenarios in a loop ──
    cycle = 0
    while running:
        cycle += 1
        print(f"\n{'━'*60}")
        print(f"  🔄  Demo Cycle {cycle}")
        print(f"{'━'*60}")
        client.publish(TOPIC_LOGS, f"🔄 [Demo] Starting demo cycle {cycle}")

        if running:
            scenario_normal(client, duration=20)
        if running:
            scenario_heat_rise(client, duration=25)
        if running:
            scenario_fire(client, duration=15)
        if running:
            scenario_cooldown(client, duration=20)

        if running:
            print(f"\n[{timestamp()}] ⏳  Pausing 5s before next cycle…")
            for _ in range(50):
                if not running:
                    break
                time.sleep(0.1)

    # ── Cleanup ──
    client.publish(TOPIC_LOGS, "❌ [Demo] Simulator stopped")
    time.sleep(0.5)
    client.loop_stop()
    client.disconnect()
    print(f"[{timestamp()}] 👋  Done. Goodbye!")


if __name__ == "__main__":
    main()
