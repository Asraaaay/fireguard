import React, { useEffect, useState, useRef } from "react";
import mqtt from "mqtt"; // install with: npm install mqtt
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// MQTT Settings
const MQTT_BROKER = "wss://broker.hivemq.com:8000/mqtt";
const TOPIC_DATA = "fireguard/data";
const TOPIC_LOGS = "fireguard/logs";
const TOPIC_OVERRIDE = "fireguard/override";

// Device credentials
const DEVICE_USERNAME = "InfernoX";
const DEVICE_PASSWORD = "asdf123";

export default function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(() => !!localStorage.getItem("fg_logged_in"));

  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("fg_dark") === "1");

  const [client, setClient] = useState(null);
  const [connected, setConnected] = useState(false);

  const [temp, setTemp] = useState(null);
  const [humidity, setHumidity] = useState(null);
  const [fireActive, setFireActive] = useState(false);

  const [logs, setLogs] = useState([]);
  const [overrideActive, setOverrideActive] = useState(false);

  // chart history
  const [tempHistory, setTempHistory] = useState([]);
  const [humidityHistory, setHumidityHistory] = useState([]);
  const [labels, setLabels] = useState([]);

  const tempChartRef = useRef(null);
  const humidityChartRef = useRef(null);
  const tempChartInstance = useRef(null);
  const humidityChartInstance = useRef(null);

  const themeBg = darkMode ? "bg-gray-900 text-gray-100" : "bg-gray-50 text-gray-900";
  const cardBg = darkMode ? "bg-gray-800" : "bg-white";

  useEffect(() => {
    if (!loggedIn) return;

    const clientId = `fireguard_web_${Math.random().toString(16).substr(2, 8)}`;
    const c = mqtt.connect(MQTT_BROKER, { clientId, keepalive: 60, reconnectPeriod: 3000 });

    c.on("connect", () => {
      setConnected(true);
      c.subscribe(TOPIC_DATA);
      c.subscribe(TOPIC_LOGS);
      c.publish(TOPIC_LOGS, "Web dashboard connected ✅");
    });

    c.on("reconnect", () => setConnected(false));

    c.on("error", (err) => {
      console.error("MQTT error", err);
      setConnected(false);
      c.end();
    });

    c.on("message", (topic, payload) => {
      const msg = payload.toString();
      if (topic === TOPIC_DATA) {
        try {
          const parsed = JSON.parse(msg);
          if (parsed.temp !== undefined) {
            setTemp(parsed.temp);
            updateChartData("temp", parsed.temp);
          }
          if (parsed.humidity !== undefined) {
            setHumidity(parsed.humidity);
            updateChartData("humidity", parsed.humidity);
          }
          if (parsed.fire !== undefined) setFireActive(Boolean(parsed.fire));
          pushLog({ text: "Sensor update", detail: msg, ts: Date.now(), type: parsed.fire ? "danger" : "info" });
        } catch (e) {}
      }
      if (topic === TOPIC_LOGS) {
        pushLog({
          text: msg,
          detail: msg,
          ts: Date.now(),
          type: msg.toLowerCase().includes("fire")
            ? msg.toLowerCase().includes("extingu")
              ? "success"
              : "danger"
            : "info",
        });
        if (msg.toLowerCase().includes("override enabled")) setOverrideActive(true);
        if (msg.toLowerCase().includes("override disabled")) setOverrideActive(false);
      }
    });

    setClient(c);
    return () => {
      if (c && c.connected) {
        c.publish(TOPIC_LOGS, "Web dashboard disconnected ⛔");
        c.end();
      }
      setClient(null);
      setConnected(false);
    };
  }, [loggedIn]);

  function updateChartData(type, value) {
    const ts = new Date().toLocaleTimeString();

    setLabels((prev) => {
      const next = [...prev, ts].slice(-20); // last 20 points
      return next;
    });

    if (type === "temp") {
      setTempHistory((prev) => [...prev, value].slice(-20));
    }
    if (type === "humidity") {
      setHumidityHistory((prev) => [...prev, value].slice(-20));
    }
  }

  useEffect(() => {
    if (tempChartRef.current) {
      if (tempChartInstance.current) tempChartInstance.current.destroy();
      tempChartInstance.current = new ChartJS(tempChartRef.current, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Temperature (°C)",
              data: tempHistory,
              borderColor: "red",
              backgroundColor: "rgba(255,0,0,0.2)",
              tension: 0.3,
            },
          ],
        },
        options: { responsive: true, plugins: { legend: { display: true } } },
      });
    }
  }, [labels, tempHistory]);

  useEffect(() => {
    if (humidityChartRef.current) {
      if (humidityChartInstance.current) humidityChartInstance.current.destroy();
      humidityChartInstance.current = new ChartJS(humidityChartRef.current, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Humidity (%)",
              data: humidityHistory,
              borderColor: "blue",
              backgroundColor: "rgba(0,0,255,0.2)",
              tension: 0.3,
            },
          ],
        },
        options: { responsive: true, plugins: { legend: { display: true } } },
      });
    }
  }, [labels, humidityHistory]);

  function pushLog(entry) {
    setLogs((s) => {
      const next = [{ id: Date.now() + Math.random(), ...entry }, ...s];
      return next.slice(0, 200);
    });
  }

  function handleLogin(e) {
    e.preventDefault();
    if (username === DEVICE_USERNAME && password === DEVICE_PASSWORD) {
      localStorage.setItem("fg_logged_in", "1");
      setLoggedIn(true);
      pushLog({ text: "User logged in", detail: `${username} logged in`, ts: Date.now(), type: "info" });
    } else {
      alert("Incorrect username or password");
    }
  }

  function handleLogout() {
    localStorage.removeItem("fg_logged_in");
    setLoggedIn(false);
    setUsername("");
    setPassword("");
    if (client && client.connected) {
      client.publish(TOPIC_LOGS, "Web user logged out");
      client.end();
    }
    setConnected(false);
  }

  function toggleOverride() {
    if (!client || !client.connected) {
      alert("Not connected to MQTT broker");
      return;
    }
    const next = !overrideActive;
    setOverrideActive(next);
    client.publish(TOPIC_OVERRIDE, next ? "ON" : "OFF");
    pushLog({
      text: `Override ${next ? "ENABLED" : "DISABLED"}`,
      detail: `Sent ${next ? "ON" : "OFF"}`,
      ts: Date.now(),
      type: next ? "warning" : "success",
    });
  }

  function fmt(ts) {
    const d = new Date(ts);
    return d.toLocaleString();
  }

  const SensorCard = ({ title, value, unit, danger }) => (
    <div className={`p-4 rounded-2xl shadow-sm ${cardBg} border ${darkMode ? "border-gray-700" : "border-gray-100"}`}>
      <div className="text-sm font-medium text-gray-400">{title}</div>
      <div className={`mt-2 text-2xl font-semibold ${danger ? "text-rose-400" : "text-teal-500"}`}>
        {value ?? "—"} {unit}
      </div>
    </div>
  );

  const Dashboard = (
    <div className={`min-h-screen p-6 ${themeBg}`}>
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-extrabold">FireGuard Dashboard</h1>
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-full border cursor-pointer"
              onClick={() => {
                setDarkMode(!darkMode);
                localStorage.setItem("fg_dark", !darkMode ? "1" : "0");
              }}
            >
              <span className="text-sm">{darkMode ? "Dark" : "Light"}</span>
              <div className={`w-8 h-5 rounded-full p-0.5 ${darkMode ? "bg-teal-500" : "bg-gray-300"}`}>
                <div
                  className={`w-4 h-4 rounded-full bg-white transform ${
                    darkMode ? "translate-x-3" : "translate-x-0"
                  } transition-all`}
                ></div>
              </div>
            </div>
            <button
              onClick={toggleOverride}
              className={`px-4 py-2 rounded-xl font-medium ${
                overrideActive ? "bg-rose-500 text-white" : "bg-blue-50 text-blue-700"
              }`}
            >
              {overrideActive ? "Override ON" : "Enable Override"}
            </button>
            <button onClick={handleLogout} className="px-3 py-2 bg-gray-200 rounded-lg">
              Logout
            </button>
          </div>
        </header>

        <main className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="md:col-span-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <SensorCard
                title="Temperature"
                value={temp !== null ? temp.toFixed(1) : null}
                unit="°C"
                danger={temp !== null && temp > 50}
              />
              <SensorCard
                title="Humidity"
                value={humidity !== null ? humidity.toFixed(1) : null}
                unit="%"
              />
              <SensorCard
                title="Fire"
                value={fireActive ? "DETECTED" : "Safe"}
                unit=""
                danger={fireActive}
              />
            </div>

            {/* Charts Section */}
            <div className={`p-4 mb-4 rounded-2xl ${cardBg} border ${darkMode ? "border-gray-700" : "border-gray-100"}`}>
              <h3 className="font-semibold mb-2">Temperature Trend</h3>
              <canvas ref={tempChartRef}></canvas>
            </div>
            <div className={`p-4 mb-4 rounded-2xl ${cardBg} border ${darkMode ? "border-gray-700" : "border-gray-100"}`}>
              <h3 className="font-semibold mb-2">Humidity Trend</h3>
              <canvas ref={humidityChartRef}></canvas>
            </div>

            <div
              className={`p-4 rounded-2xl ${cardBg} border ${darkMode ? "border-gray-700" : "border-gray-100"}`}
            >
              <h3 className="font-semibold mb-2">Live Logs</h3>
              <div className="overflow-auto max-h-64">
                <table className="w-full text-sm table-auto">
                  <thead>
                    <tr>
                      <th className="py-2">Time</th>
                      <th>Type</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-4 text-center text-gray-400">
                          No logs yet
                        </td>
                      </tr>
                    ) : (
                      logs.map((l) => (
                        <tr
                          key={l.id}
                          className={
                            l.type === "danger"
                              ? "bg-rose-50"
                              : l.type === "warning"
                              ? "bg-yellow-50"
                              : ""
                          }
                        >
                          <td className="py-2 w-40">{fmt(l.ts)}</td>
                          <td className="w-24 font-medium">{l.type?.toUpperCase()}</td>
                          <td>
                            {l.text}
                            <div className="text-xs text-gray-400">{l.detail}</div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <aside>
            <div
              className={`p-4 rounded-2xl ${cardBg} border ${darkMode ? "border-gray-700" : "border-gray-100"}`}
            >
              <h3 className="font-semibold mb-2">Controls</h3>
              <button
                onClick={toggleOverride}
                className={`w-full mt-2 py-2 rounded-lg font-medium ${
                  overrideActive ? "bg-rose-500 text-white" : "bg-blue-50 text-blue-700"
                }`}
              >
                {overrideActive ? "Disable Override" : "Enable Override"}
              </button>
              <div className="mt-4 text-sm">Temp: {temp !== null ? temp.toFixed(1) : "—"} °C</div>
              <div className="text-sm">Humidity: {humidity !== null ? humidity.toFixed(1) : "—"} %</div>
              <div
                className={`mt-2 inline-block px-3 py-1 rounded-full text-sm ${
                  fireActive ? "bg-rose-500 text-white" : "bg-green-100 text-green-700"
                }`}
              >
                {fireActive ? "FIRE!" : "All Clear"}
              </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );

  const LoginPage = (
    <div className={`min-h-screen flex items-center justify-center p-6 ${themeBg}`}>
      <div
        className={`w-full max-w-md p-8 rounded-2xl ${cardBg} border ${
          darkMode ? "border-gray-700" : "border-gray-100"
        }`}
      >
        <h2 className="text-2xl font-bold mb-2">FireGuard Login</h2>
        <p className="text-sm text-gray-400 mb-6">
          Enter the device credentials to access the dashboard.
        </p>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs text-gray-400">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full mt-1 p-2 rounded-lg border"
              placeholder="Username"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className="w-full mt-1 p-2 rounded-lg border"
              placeholder="Password"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );

  return loggedIn ? Dashboard : LoginPage;
}