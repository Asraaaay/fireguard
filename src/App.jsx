import React, { useEffect, useState, useRef } from "react";
import mqtt from "mqtt";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";   
import { Line } from "react-chartjs-2";
import { Sun, Moon, Download, Pause, Play, AlertTriangle, Flame, Thermometer, Droplets, Shield, Wifi, WifiOff, Cpu, Settings, Save } from "lucide-react";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAEPPOMcTw9LVlv-ym317Atlw4J7OAwe40",
  authDomain: "fireguard-ab271.firebaseapp.com",
  projectId: "fireguard-ab271",
  storageBucket: "fireguard-ab271.firebasestorage.app",
  messagingSenderId: "616558140009",
  appId: "1:616558140009:web:f6a849bebdfd73014820f8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Register Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// MQTT Configuration
const MQTT_BROKER = "wss://broker.hivemq.com:8884/mqtt";
const TOPIC_DATA = "fireguard/data";
const TOPIC_LOGS = "fireguard/logs";
const TOPIC_OVERRIDE = "fireguard/override";
const TOPIC_HEARTBEAT = "fireguard/heartbeat";
const TOPIC_THRESHOLD = "fireguard/threshold"; // For receiving threshold status
const TOPIC_THRESHOLD_SET = "fireguard/threshold/set"; // For sending threshold commands

// ESP32 timeout (consider device disconnected after 10 seconds without heartbeat)
const ESP32_TIMEOUT = 10000;

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("fg_dark") === "1");
  const [client, setClient] = useState(null);
  const [connected, setConnected] = useState(false);
  const [esp32Connected, setEsp32Connected] = useState(false);
  const [temp, setTemp] = useState(null);
  const [humidity, setHumidity] = useState(null);
  const [fireActive, setFireActive] = useState(false);
  const [logs, setLogs] = useState([]);
  const [overrideActive, setOverrideActive] = useState(false);
  const [tempHistory, setTempHistory] = useState([]);
  const [humidityHistory, setHumidityHistory] = useState([]);
  const [logsPaused, setLogsPaused] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState(50.0); // Default threshold
  const [tempThreshold, setTempThreshold] = useState(50.0); // Temporary threshold for editing
  const [isEditingThreshold, setIsEditingThreshold] = useState(false);
  const [thresholdLoading, setThresholdLoading] = useState(false);
  
  const logsContainerRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);
  const esp32TimeoutRef = useRef(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const darkModeButtonRef = useRef(null);

  // Audio refs for alarms
  const audioRef = useRef(null);
  const highTempAudioRef = useRef(null);
  const [currentAlarm, setCurrentAlarm] = useState(null); // 'fire', 'high-temp', or null
  const userInteractedRef = useRef(false);

  const themeBg = darkMode ? "bg-gray-900 text-gray-100" : "bg-gray-50 text-gray-900";
  const cardBg = darkMode ? "bg-gray-800" : "bg-white";

  // Calculate threshold progress (how close temperature is to threshold)
  const calculateThresholdProgress = () => {
    if (temp === null || threshold === null) return 0;
    
    // Calculate percentage from 30°C to threshold
    const minTemp = 30;
    const maxTemp = threshold;
    
    if (temp <= minTemp) return 0;
    if (temp >= maxTemp) return 100;
    
    return ((temp - minTemp) / (maxTemp - minTemp)) * 100;
  };

  // Get color based on threshold progress
  const getProgressColor = (progress) => {
    if (progress < 60) return "bg-green-500";
    if (progress < 85) return "bg-yellow-500";
    return "bg-red-500";
  };

  // Get text color based on threshold progress
  const getProgressTextColor = (progress) => {
    if (progress < 60) return "text-green-600";
    if (progress < 85) return "text-yellow-600";
    return "text-red-600";
  };

  // Get status text based on threshold progress
  const getProgressStatus = (progress) => {
    if (progress === 0) return "Normal";
    if (progress < 60) return "Safe";
    if (progress < 85) return "Warning";
    return "Critical";
  };

  const progress = calculateThresholdProgress();
  const progressColor = getProgressColor(progress);
  const progressTextColor = getProgressTextColor(progress);
  const progressStatus = getProgressStatus(progress);

  // Check auth state on component mount
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setLoggedIn(true);
        pushLog({
          text: "User logged in",
          detail: `${user.email} logged in`,
          ts: Date.now(),
          type: "info",
        });
      } else {
        setLoggedIn(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Initialize audio on component mount
  useEffect(() => {
    // Create Audio instances
    audioRef.current = new Audio("alarm.mp3");
    audioRef.current.loop = true;
    
    highTempAudioRef.current = new Audio("alarm2.mp3");
    highTempAudioRef.current.loop = true;

    // Preload and attempt to play/pause to unlock audio
    const unlockAudio = async () => {
      try {
        // Create a silent audio context to unlock Web Audio API
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const audioContext = new AudioContext();
        
        // Create a silent gain node
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0;
        gainNode.connect(audioContext.destination);
        
        // Resume the audio context (this often unlocks audio)
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
        
        console.log("Audio context unlocked");
      } catch (error) {
        console.warn("Audio context unlock failed:", error);
      }

      // Also try to play/pause the actual audio files silently
      try {
        await audioRef.current.play();
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        
        await highTempAudioRef.current.play();
        highTempAudioRef.current.pause();
        highTempAudioRef.current.currentTime = 0;
        
        console.log("Audio files preloaded and ready");
        userInteractedRef.current = true;
      } catch (error) {
        console.warn("Audio preload failed:", error);
      }
    };

    // Mark user interaction on any user action
    const handleUserInteraction = () => {
      userInteractedRef.current = true;
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
    };

    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('keydown', handleUserInteraction);
    document.addEventListener('touchstart', handleUserInteraction);

    unlockAudio();

    return () => {
      // Cleanup
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (highTempAudioRef.current) {
        highTempAudioRef.current.pause();
        highTempAudioRef.current = null;
      }
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
    };
  }, []);

  // Scroll to top of logs when new logs arrive (since new logs are added to top)
  useEffect(() => {
    if (!logsPaused && logsContainerRef.current && shouldAutoScrollRef.current) {
      logsContainerRef.current.scrollTop = 0;
    }
  }, [logs, logsPaused]);

  // Handle scroll events to determine if we should auto-scroll
  useEffect(() => {
    const logsContainer = logsContainerRef.current;
    if (!logsContainer) return;

    const handleScroll = () => {
      // If user scrolls away from top, disable auto-scroll
      if (logsContainer.scrollTop > 50) {
        shouldAutoScrollRef.current = false;
      } else {
        // If user scrolls back to top, re-enable auto-scroll
        shouldAutoScrollRef.current = true;
      }
    };

    logsContainer.addEventListener('scroll', handleScroll);
    return () => logsContainer.removeEventListener('scroll', handleScroll);
  }, []);

  // Reset ESP32 connection status when disconnected from MQTT
  useEffect(() => {
    if (!connected) {
      setEsp32Connected(false);
      if (esp32TimeoutRef.current) {
        clearTimeout(esp32TimeoutRef.current);
        esp32TimeoutRef.current = null;
      }
    }
  }, [connected]);

  useEffect(() => {
    if (!loggedIn) return;

    const clientId = `fireguard_web_${Math.random().toString(16).substr(2, 8)}`;

    const c = mqtt.connect(MQTT_BROKER, {
      clientId,
      reconnectPeriod: 3000,
      connectTimeout: 4000,
      clean: true,
    });

    c.on("connect", () => {
      setConnected(true);
      c.subscribe([TOPIC_DATA, TOPIC_LOGS, TOPIC_HEARTBEAT, TOPIC_THRESHOLD], (err) => {
        if (!err) c.publish(TOPIC_LOGS, "🌐 Web dashboard connected");
      });
    });

    c.on("reconnect", () => setConnected(false));
    c.on("error", (err) => {
      console.error("MQTT error:", err);
      setConnected(false);
      c.end();
    });

    c.on("message", (topic, payload) => {
      if (logsPaused) return;
      
      const msg = payload.toString();

      if (topic === TOPIC_DATA) {
        try {
          const parsed = JSON.parse(msg);
          if (parsed.temp !== undefined && parsed.temp !== null) {
            setTemp(parsed.temp);
            setTempHistory((prev) => {
              const next = [...prev.slice(-19), { ts: Date.now(), v: parsed.temp }];
              return next;
            });
          }
          if (parsed.humidity !== undefined && parsed.humidity !== null) {
            setHumidity(parsed.humidity);
            setHumidityHistory((prev) => {
              const next = [...prev.slice(-19), { ts: Date.now(), v: parsed.humidity }];
              return next;
            });
          }
          if (parsed.fire !== undefined) setFireActive(Boolean(parsed.fire));
          // Note: We don't set threshold from data topic anymore - only from threshold topic

          pushLog({
            text: "Sensor update",
            detail: msg,
            ts: Date.now(),
            type: parsed.fire ? "danger" : "info",
          });
        } catch (e) {
          console.warn("Bad JSON from MQTT:", msg);
        }
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

      if (topic === TOPIC_HEARTBEAT) {
        // ESP32 is sending a heartbeat, so it's connected
        setEsp32Connected(true);
        
        // Clear any existing timeout
        if (esp32TimeoutRef.current) {
          clearTimeout(esp32TimeoutRef.current);
        }
        
        // Set a new timeout to mark ESP32 as disconnected if no further heartbeats
        esp32TimeoutRef.current = setTimeout(() => {
          setEsp32Connected(false);
          pushLog({
            text: "ESP32 disconnected",
            detail: "No heartbeat received from ESP32",
            ts: Date.now(),
            type: "warning",
          });
        }, ESP32_TIMEOUT);
      }

      if (topic === TOPIC_THRESHOLD) {
        try {
          const parsed = JSON.parse(msg);
          if (parsed.threshold !== undefined) {
            setThreshold(parsed.threshold);
            setTempThreshold(parsed.threshold);
            setThresholdLoading(false);
            pushLog({
              text: `Threshold updated to ${parsed.threshold}°C`,
              detail: `Temperature threshold confirmed`,
              ts: Date.now(),
              type: "success",
            });
          }
        } catch (e) {
          // Handle simple numeric threshold messages
          const newThreshold = parseFloat(msg);
          if (!isNaN(newThreshold) && newThreshold >= 30 && newThreshold <= 80) {
            setThreshold(newThreshold);
            setTempThreshold(newThreshold);
            setThresholdLoading(false);
            pushLog({
              text: `Threshold updated to ${newThreshold}°C`,
              detail: `Temperature threshold confirmed`,
              ts: Date.now(),
              type: "success",
            });
          }
        }
      }
    });

    setClient(c);

    return () => {
      if (c && c.connected) {
        c.publish(TOPIC_LOGS, "❌ Web dashboard disconnected");
        c.end();
      }
      setClient(null);
      setConnected(false);
      
      if (esp32TimeoutRef.current) {
        clearTimeout(esp32TimeoutRef.current);
        esp32TimeoutRef.current = null;
      }
    };
  }, [loggedIn, logsPaused]);

  function pushLog(entry) {
    setLogs((s) => {
      const next = [{ id: Date.now() + Math.random(), ...entry }, ...s];
      return next.slice(0, 200);
    });
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError("");
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      // Login successful - onAuthStateChanged will handle the state update
    } catch (error) {
      console.error("Login error:", error);
      setLoginError(getFirebaseErrorMessage(error.code));
    } finally {
      setLoading(false);
    }
  }

  function getFirebaseErrorMessage(errorCode) {
    switch (errorCode) {
      case 'auth/invalid-email':
        return 'Invalid email address format.';
      case 'auth/user-disabled':
        return 'This account has been disabled.';
      case 'auth/user-not-found':
        return 'No account found with this email.';
      case 'auth/wrong-password':
        return 'Incorrect password.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later.';
      default:
        return 'Login failed. Please try again.';
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth);
      if (client && client.connected) {
        client.publish(TOPIC_LOGS, "🔒 Web user logged out");
        client.end();
      }
      setConnected(false);
      setEmail("");
      setPassword("");
      // Stop any playing audio on logout
      stopAllAlarms();
    } catch (error) {
      console.error("Logout error:", error);
    }
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

  function updateThreshold() {
    if (!client || !client.connected) {
      alert("Not connected to MQTT broker");
      return;
    }

    const newThreshold = parseFloat(tempThreshold);
    if (isNaN(newThreshold) || newThreshold < 30 || newThreshold > 80) {
      alert("Please enter a valid threshold between 30°C and 80°C");
      return;
    }

    setThresholdLoading(true);
    // Publish to the SET topic (not the status topic)
    client.publish(TOPIC_THRESHOLD_SET, newThreshold.toString());
    pushLog({
      text: `Setting threshold to ${newThreshold}°C`,
      detail: `Sending threshold update to ESP32`,
      ts: Date.now(),
      type: "info",
    });
    
    setIsEditingThreshold(false);
  }

  function startEditingThreshold() {
    setTempThreshold(threshold);
    setIsEditingThreshold(true);
  }

  function cancelEditingThreshold() {
    setTempThreshold(threshold);
    setIsEditingThreshold(false);
  }

  function downloadLogs() {
    const csvContent = logs.map(log => 
      `"${new Date(log.ts).toLocaleString()}","${log.type}","${log.text.replace(/"/g, '""')}"`
    ).join('\n');
    
    const blob = new Blob([`"Time","Type","Message"\n${csvContent}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fireguard-logs-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Audio control functions
  const stopAllAlarms = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (highTempAudioRef.current) {
      highTempAudioRef.current.pause();
      highTempAudioRef.current.currentTime = 0;
    }
    setCurrentAlarm(null);
  };

  const playFireAlarm = async () => {
    if (currentAlarm === 'fire') return;
    
    stopAllAlarms();
    setCurrentAlarm('fire');
    
    try {
      await audioRef.current.play();
      console.log("Fire alarm started");
    } catch (error) {
      console.warn("Failed to play fire alarm:", error);
      // Retry after user interaction
      if (!userInteractedRef.current) {
        console.log("Waiting for user interaction to play alarm...");
      }
      setCurrentAlarm(null);
    }
  };

  const playHighTempAlarm = async () => {
    if (currentAlarm === 'high-temp') return;
    
    stopAllAlarms();
    setCurrentAlarm('high-temp');
    
    try {
      await highTempAudioRef.current.play();
      console.log("High temperature alarm started");
    } catch (error) {
      console.warn("Failed to play high temperature alarm:", error);
      // Retry after user interaction
      if (!userInteractedRef.current) {
        console.log("Waiting for user interaction to play alarm...");
      }
      setCurrentAlarm(null);
    }
  };

  // Handle alarm conditions
  useEffect(() => {
    if (!esp32Connected) {
      stopAllAlarms();
      return;
    }

    // Priority: Fire detection > High temperature
    if (fireActive) {
      playFireAlarm();
    } else if (temp !== null && temp > 50) {
      playHighTempAlarm();
    } else {
      stopAllAlarms();
    }
  }, [fireActive, temp, esp32Connected]);

  function fmt(ts) {
    const d = new Date(ts);
    return d.toLocaleString();
  }

  const handleDarkModeToggle = () => {
    if (isTransitioning) return;
    
    setIsTransitioning(true);
    const newDarkMode = !darkMode;
    
    // Change theme immediately for smooth transition
    setDarkMode(newDarkMode);
    localStorage.setItem("fg_dark", newDarkMode ? "1" : "0");
    
    // Reset transition state after transition completes
    setTimeout(() => {
      setIsTransitioning(false);
    }, 500);
  };

  // UI Components
  const SensorCard = ({ title, value, unit, danger, warning, icon }) => (
    <div
      className={`p-6 rounded-2xl shadow-md ${cardBg} border ${
        darkMode ? "border-gray-700" : "border-gray-200"
      } flex flex-col transition-all duration-500 ease-in-out ${
        danger ? "ring-2 ring-red-500" : warning ? "ring-2 ring-yellow-500" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className={`text-sm font-medium transition-colors duration-500 ${
          darkMode ? "text-gray-400" : "text-gray-500"
        }`}>
          {title}
        </div>
        <div className={`p-2 rounded-full transition-colors duration-500 ${
          danger ? "bg-red-100 text-red-600" : 
          warning ? "bg-yellow-100 text-yellow-600" : 
          "bg-blue-100 text-blue-600"
        }`}>
          {icon}
        </div>
      </div>
      <div
        className={`mt-2 text-3xl font-bold transition-colors duration-500 ${
          danger 
            ? "text-red-600" 
            : warning
              ? "text-yellow-600"
              : darkMode 
                ? "text-gray-100" 
                : "text-gray-800"
        }`}
      >
        {value !== null && value !== undefined ? (
          <>
            {typeof value === "number" ? value.toFixed(1) : value} {unit}
          </>
        ) : (
          <>— {unit}</>
        )}
      </div>
      {danger && (
        <div className="mt-2 text-sm font-medium text-red-600 flex items-center transition-colors duration-500">
          <AlertTriangle size={16} className ="mr-1" /> Warning
        </div>
      )}
      {warning && !danger && (
        <div className="mt-2 text-sm font-medium text-yellow-600 flex items-center transition-colors duration-500">
          <AlertTriangle size={16} className="mr-1" /> Elevated
        </div>
      )}
    </div>
  );

  const StatusCard = ({ isSafe }) => (
    <div
      className={`p-6 rounded-2xl shadow-md transition-all duration-500 ${
        isSafe
          ? "bg-gradient-to-r from-green-500 to-emerald-500"
          : "bg-gradient-to-r from-red-500 to-orange-500"
      } text-white`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="text-xl font-bold">System Status</div>
        <div className="p-2 bg-white bg-opacity-20 rounded-full">
          {isSafe ? <Shield size={24} /> : <Flame size={24} />}
        </div>
      </div>
      <div className="text-2xl font-extrabold mb-2">
        {isSafe ? "ALL CLEAR" : "FIRE DETECTED!"}
      </div>
      <div className="text-sm opacity-90">
        {isSafe
          ? "No fire detected. All systems normal."
          : "Fire detected! Take immediate action."}
      </div>
    </div>
  );

  const ConnectionStatus = ({ connected, device, deviceName }) => (
    <div className="flex items-center">
      <div
        className={`w-3 h-3 rounded-full mr-2 transition-colors duration-500 ${
          connected ? "bg-green-500" : "bg-red-500"
        }`}
      ></div>
      <span className="text-sm transition-colors duration-500">
        {device ? `${deviceName}: ${connected ? "Connected" : "Disconnected"}` : connected ? "Connected" : "Disconnected"}
      </span>
    </div>
  );

  // MQTT Connection Banner component
  const MQTTConnectionBanner = ({ connected }) => {
    if (connected) return null;
    
    return (
      <div className="w-full bg-red-500 text-white p-3 flex items-center justify-center transition-colors duration-500">
        <div className="flex items-center max-w-7xl w-full">
          <WifiOff size={20} className="mr-2" />
          <span className="font-medium">Disconnected from MQTT broker. Attempting to reconnect...</span>
        </div>
      </div>
    );
  };

  // ESP32 Connection Banner component
  const ESP32ConnectionBanner = ({ connected }) => {
    if (connected) return null;
    
    return (
      <div className="w-full bg-orange-500 text-white p-3 flex items-center justify-center transition-colors duration-500">
        <div className="flex items-center max-w-7xl w-full">
          <Cpu size={20} className="mr-2" />
          <span className="font-medium">ESP32 device disconnected. Check device power and network connection.</span>
        </div>
      </div>
    );
  };

  const Dashboard = (
    <div className={`min-h-screen transition-all duration-500 ease-in-out ${themeBg}`}>
      <MQTTConnectionBanner connected={connected} />
      <ESP32ConnectionBanner connected={esp32Connected} />
      
      <div className="p-4 md:p-6">
        <div className="max-w-7xl mx-auto">
          <header className="flex flex-col md:flex-row items-center justify-between mb-6 md:mb-8 p-4 rounded-2xl bg-white bg-opacity-5 gap-4 transition-all duration-500">
            <div className="flex items-center">
              <div className="p-3 bg-red-500 rounded-xl mr-3 transition-colors duration-500">
                <Flame size={24} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold transition-colors duration-500">FireGuard Dashboard</h1>
                <div className="flex flex-col space-y-1 mt-1">
                  <ConnectionStatus connected={connected} />
                  <ConnectionStatus connected={esp32Connected} device={true} deviceName="ESP32" />
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 md:gap-3">
              <button
                ref={darkModeButtonRef}
                className="flex items-center justify-center w-10 h-10 rounded-full border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-500 relative overflow-hidden"
                onClick={handleDarkModeToggle}
                aria-label="Toggle dark mode"
                disabled={isTransitioning}
              >
                {darkMode ? <Moon size={18} /> : <Sun size={18} />}
                {isTransitioning && (
                  <div className="absolute inset-0 bg-current opacity-20 animate-pulse rounded-full"></div>
                )}
              </button>
              <button
                onClick={toggleOverride}
                className={`px-3 py-2 md:px-4 md:py-2 rounded-xl font-medium flex items-center text-sm md:text-base transition-all duration-500 ${
                  overrideActive
                    ? "bg-red-100 text-red-700 border border-red-300"
                    : "bg-blue-100 text-blue-700 border border-blue-300"
                }`}
              >
                <Shield size={18} className="mr-2" />
                {overrideActive ? "Override ON" : "Override"}
              </button>
              <button
                onClick={handleLogout}
                className="px-3 py-2 md:px-4 md:py-2 bg-gray-400 dark:bg-gray-700 rounded-xl font-medium text-sm md:text-base transition-colors duration-500"
              >
                Logout
              </button>
            </div>
          </header>

          <main className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-6">
            <div className="lg:col-span-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 mb-6">
                <SensorCard
                  title="Temperature"
                  value={temp}
                  unit="°C"
                  danger={temp !== null && temp > threshold}
                  warning={temp !== null && temp > (threshold - 5) && temp <= threshold}
                  icon={<Thermometer size={20} />}
                />
                <SensorCard
                  title="Humidity"
                  value={humidity}
                  unit="%"
                  icon={<Droplets size={20} />}
                />
                <StatusCard isSafe={!fireActive} />
              </div>

              <div
                className={`p-4 md:p-5 rounded-2xl border mb-6 transition-all duration-500 ease-in-out ${cardBg} ${
                  darkMode ? "border-gray-700" : "border-gray-200"
                }`}
              >
                <h3 className="font-bold text-lg mb-4 flex items-center transition-colors duration-500">
                  <Thermometer size={20} className="mr-2" />
                  Temperature & Humidity Trends
                </h3>
                <div className="h-64 md:h-80">
                  <Line
                    data={{
                      labels:
                        tempHistory.length > 0
                          ? tempHistory.map((item) =>
                              new Date(item.ts).toLocaleTimeString()
                            )
                          : humidityHistory.length > 0
                          ? humidityHistory.map((item) =>
                              new Date(item.ts).toLocaleTimeString()
                            )
                          : [],
                      datasets: [
                        {
                          label: "Temperature (°C)",
                          data: tempHistory.map((item) => item.v),
                          borderColor: "rgb(239, 68, 68)",
                          backgroundColor: "rgba(239, 68, 68, 0.1)",
                          borderWidth: 2,
                          pointRadius: 3,
                          pointHoverRadius: 6,
                          fill: true,
                          tension: 0.4,
                          yAxisID: "y",
                        },
                        {
                          label: "Humidity (%)",
                          data: humidityHistory.map((item) => item.v),
                          borderColor: "rgb(59, 130, 246)",
                          backgroundColor: "rgba(59, 130, 246, 0.1)",
                          borderWidth: 2,
                          pointRadius: 3,
                          pointHoverRadius: 6,
                          fill: true,
                          tension: 0.4,
                          yAxisID: "y1",
                        },
                        {
                          label: "Fire Threshold",
                          data: tempHistory.map(() => threshold),
                          borderColor: "rgb(234, 179, 8)",
                          backgroundColor: "rgba(234, 179, 8, 0.1)",
                          borderWidth: 2,
                          borderDash: [5, 5],
                          pointRadius: 0,
                          fill: false,
                          tension: 0,
                          yAxisID: "y",
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      interaction: {
                        mode: "index",
                        intersect: false,
                      },
                      plugins: {
                        legend: {
                          position: "top",
                          labels: {
                            color: darkMode ? "#e5e7eb" : "#4b5563",
                            usePointStyle: true,
                          },
                        },
                        tooltip: {
                          mode: "index",
                          intersect: false,
                          backgroundColor: darkMode ? "#374151" : "#f9fafb",
                          titleColor: darkMode ? "#f3f4f6" : "#111827",
                          bodyColor: darkMode ? "#d1d5db" : "#374151",
                          borderColor: darkMode ? "#4b5563" : "#e5e7eb",
                        },
                      },
                      scales: {
                        x: {
                          grid: {
                            color: darkMode ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)",
                          },
                          ticks: {
                            color: darkMode ? "#9ca3af" : "#6b7280",
                            maxRotation: 25,
                          },
                        },
                        y: {
                          type: "linear",
                          display: true,
                          position: "left",
                          title: {
                            display: true,
                            text: "Temperature (°C)",
                            color: darkMode ? "#9ca3af" : "hsla(220, 99%, 31%, 1.00)",
                          },
                          grid: {
                            color: darkMode ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)",
                          },
                          ticks: {
                            color: darkMode ? "#9ca3af" : "#6b7280",
                          },
                        },
                        y1: {
                          type: "linear",
                          display: true,
                          position: "right",
                          title: {
                            display: true,
                            text: "Humidity (%)",
                            color: darkMode ? "#9ca3af" : "#6b7280",
                          },
                          grid: {
                            drawOnChartArea: false,
                          },
                          ticks: {
                            color: darkMode ? "#9ca3af" : "#6b7280",
                          },
                        },
                      },
                    }}
                  />
                </div>
              </div>

              <div
                className={`p-4 md:p-5 rounded-2xl border transition-all duration-500 ease-in-out ${cardBg} ${
                  darkMode ? "border-gray-700" : "border-gray-200"
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-2">
                  <h3 className="font-bold text-lg flex items-center transition-colors duration-500">
                    <Download size={20} className="mr-2" />
                    Live Logs
                  </h3>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        setLogsPaused(!logsPaused);
                        if (logsPaused) {
                          shouldAutoScrollRef.current = true;
                        }
                      }}
                      className={`px-3 py-1 rounded-lg text-sm flex items-center transition-colors duration-500 ${
                        logsPaused
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {logsPaused ? (
                        <>
                          <Play size={16} className="mr-1" /> Resume
                        </>
                      ) : (
                        <>
                          <Pause size={16} className="mr-1" /> Pause
                        </>
                      )}
                    </button>
                    <button
                      onClick={downloadLogs}
                      className="px-3 py-1 rounded-lg bg-green-100 text-green-700 text-sm flex items-center transition-colors duration-500"
                    >
                      <Download size={16} className="mr-1" /> Export
                    </button>
                  </div>
                </div>
                <div 
                  ref={logsContainerRef}
                  className="overflow-auto max-h-96 rounded-lg"
                >
                  <table className="w-full text-sm">
                    <thead className={`sticky top-0 transition-colors duration-500 ${
                      darkMode ? "bg-gray-700" : "bg-gray-100"
                    }`}>
                      <tr>
                        <th className="py-3 px-2 md:px-4 text-left transition-colors duration-500">Time</th>
                        <th className="py-3 px-2 md:px-4 text-left transition-colors duration-500">Type</th>
                        <th className="py-3 px-2 md:px-4 text-left transition-colors duration-500">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="py-8 text-center text-gray-400 transition-colors duration-500"
                          >
                            No logs yet. Waiting for data...
                          </td>
                        </tr>
                      ) : (
                        logs.map((l) => (
                          <tr
                            key={l.id}
                            className={`border-b transition-all duration-500 ${
                              darkMode ? "border-gray-700" : "border-gray-100"
                            } ${
                              l.type === "danger"
                                ? "bg-red-50 text-red-800 dark:bg-red-900 dark:bg-opacity-20 dark:text-red-300"
                                : l.type === "warning"
                                ? "bg-yellow-50 text-yellow-800 dark:bg-yellow-900 dark:bg-opacity-20 dark:text-yellow-300"
                                : l.type === "success"
                                ? "bg-green-50 text-green-800 dark:bg-green-900 dark:bg-opacity-20 dark:text-green-300"
                                : darkMode 
                                  ? "hover:bg-gray-700" 
                                  : "hover:bg-gray-50"
                            }`}
                          >
                            <td className="py-3 px-2 md:px-4 w-32 md:w-40 text-xs md:text-sm transition-colors duration-500">
                              {new Date(l.ts).toLocaleTimeString()}
                            </td>
                            <td className="py-3 px-2 md:px-4 w-20 md:w-24">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors duration-500 ${
                                l.type === "danger"
                                  ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
                                  : l.type === "warning"
                                  ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
                                  : l.type === "success"
                                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                                  : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
                              }`}>
                                {l.type?.toUpperCase()}
                              </span>
                            </td>
                            <td className="py-3 px-2 md:px-4 transition-colors duration-500">
                              <div className="font-medium text-xs md:text-sm">{l.text}</div>
                              {l.detail && l.detail !== l.text && (
                                <div className="text-xs opacity-75 mt-1">
                                  {l.detail}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <aside className="space-y-4 md:space-y-6">
              <div
                className={`p-4 md:p-5 rounded-2xl border transition-all duration-500 ease-in-out ${cardBg} ${
                  darkMode ? "border-gray-700" : "border-gray-200"
                }`}
              >
                <h3 className="font-bold text-lg mb-4 flex items-center transition-colors duration-500">
                  <Shield size={20} className="mr-2" />
                  System Controls
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium transition-colors duration-500">Override System</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={overrideActive}
                        onChange={toggleOverride}
                      />
                      <div className={`w-11 h-6 rounded-full peer transition-colors duration-500 ${
                        overrideActive 
                          ? "bg-red-500" 
                          : "bg-gray-200 dark:bg-gray-700"
                      } peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all`}></div>
                    </label>
                  </div>
                  
                  {/* Threshold Control Section */}
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700 transition-colors duration-500">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium transition-colors duration-500">Fire Threshold</h4>
                      <button
                        onClick={startEditingThreshold}
                        className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-500"
                        title="Edit threshold"
                      >
                        <Settings size={16} />
                      </button>
                    </div>
                    
                    {isEditingThreshold ? (
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            min="30"
                            max="80"
                            step="0.1"
                            value={tempThreshold}
                            onChange={(e) => setTempThreshold(e.target.value)}
                            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 transition-colors duration-500"
                            placeholder="Enter threshold"
                          />
                          <span className="text-sm font-medium transition-colors duration-500">°C</span>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={updateThreshold}
                            disabled={thresholdLoading}
                            className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium flex items-center justify-center transition-colors duration-500"
                          >
                            {thresholdLoading ? (
                              <>
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                                Saving...
                              </>
                            ) : (
                              <>
                                <Save size={16} className="mr-1" />
                                Save
                              </>
                            )}
                          </button>
                          <button
                            onClick={cancelEditingThreshold}
                            className="px-3 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors duration-500"
                          >
                            Cancel
                          </button>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 transition-colors duration-500">
                          Valid range: 30°C - 80°C
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className={`text-sm transition-colors duration-500 ${
                            darkMode ? "text-gray-400" : "text-gray-500"
                          }`}>
                            Current Threshold:
                          </span>
                          <span className={`font-bold text-lg transition-colors duration-500 ${
                            temp !== null && temp > threshold 
                              ? "text-red-600" 
                              : temp !== null && temp > (threshold - 5)
                                ? "text-yellow-600"
                                : "text-green-600"
                          }`}>
                            {threshold.toFixed(1)}°C
                          </span>
                        </div>
                        
                        {/* Dynamic Threshold Progress Bar */}
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className={`text-sm font-medium transition-colors duration-500 ${progressTextColor}`}>
                              Temperature Progress: {progressStatus}
                            </span>
                            <span className={`text-sm font-bold transition-colors duration-500 ${progressTextColor}`}>
                              {progress.toFixed(0)}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 transition-colors duration-500">
                            <div 
                              className={`h-3 rounded-full transition-all duration-500 ${progressColor}`}
                              style={{ width: `${Math.min(progress, 100)}%` }}
                            ></div>
                          </div>
                          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 transition-colors duration-500">
                            <span>30°C</span>
                            <span className="font-medium">{threshold.toFixed(1)}°C</span>
                          </div>
                        </div>

                        {/* Current Temperature Indicator */}
                        {temp !== null && (
                          <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg transition-colors duration-500">
                            <div className="flex justify-between items-center text-sm">
                              <span className="transition-colors duration-500">Current Temp:</span>
                              <span className={`font-bold transition-colors duration-500 ${
                                temp > threshold 
                                  ? "text-red-600" 
                                  : temp > (threshold - 5)
                                    ? "text-yellow-600"
                                    : "text-green-600"
                              }`}>
                                {temp.toFixed(1)}°C
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 mt-1 transition-colors duration-500">
                              <span>Distance to threshold:</span>
                              <span className="font-medium">
                                {(threshold - temp).toFixed(1)}°C
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700 transition-colors duration-500">
                    <h4 className="font-medium mb-2 transition-colors duration-500">Current Readings</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className={`text-sm transition-colors duration-500 ${
                          darkMode ? "text-gray-400" : "text-gray-500"
                        }`}>
                          Temperature:
                        </span>
                        <span className={`font-medium transition-colors duration-500 ${
                          temp !== null && temp > threshold 
                            ? "text-red-600" 
                            : temp !== null && temp > (threshold - 5) 
                              ? "text-yellow-600" 
                              : ""
                        }`}>
                          {temp !== null ? `${temp.toFixed(1)} °C` : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className={`text-sm transition-colors duration-500 ${
                          darkMode ? "text-gray-400" : "text-gray-500"
                        }`}>
                          Humidity:
                        </span>
                        <span className="font-medium transition-colors duration-500">
                          {humidity !== null ? `${humidity.toFixed(1)} %` : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className={`text-sm transition-colors duration-500 ${
                          darkMode ? "text-gray-400" : "text-gray-500"
                        }`}>
                          Fire Status:
                        </span>
                        <span className={`font-medium transition-colors duration-500 ${
                          fireActive ? "text-red-600" : "text-green-600"
                        }`}>
                          {fireActive ? "DETECTED" : "Normal"}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700 transition-colors duration-500">
                    <h4 className="font-medium mb-2 transition-colors duration-500">Connection Status</h4>
                    <div className="space-y-2">
                      <div className="flex items-center">
                        <div className={`w-3 h-3 rounded-full mr-2 transition-colors duration-500 ${
                          connected ? "bg-green-500 animate-pulse" : "bg-red-500"
                        }`}></div>
                        <span className="transition-colors duration-500">MQTT: {connected ? "Connected" : "Disconnected"}</span>
                      </div>
                      <div className="flex items-center">
                        <div className={`w-3 h-3 rounded-full mr-2 transition-colors duration-500 ${
                          esp32Connected ? "bg-green-500 animate-pulse" : "bg-red-500"
                        }`}></div>
                        <span className="transition-colors duration-500">ESP32: {esp32Connected ? "Connected" : "Disconnected"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                className={`p-4 md:p-5 rounded-2xl border transition-all duration-500 ease-in-out ${cardBg} ${
                  darkMode ? "border-gray-700" : "border-gray-200"
                }`}
              >
                <h3 className="font-bold text-lg mb-4 transition-colors duration-500">System Information</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className={`transition-colors duration-500 ${
                      darkMode ? "text-gray-400" : "text-gray-500"
                    }`}>
                      Last Update:
                    </span>
                    <span className="transition-colors duration-500">
                      {tempHistory.length ? new Date(tempHistory[tempHistory.length-1].ts).toLocaleTimeString() : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className={`transition-colors duration-500 ${
                      darkMode ? "text-gray-400" : "text-gray-500"
                    }`}>
                      Fire Threshold:
                    </span>
                    <span className="transition-colors duration-500">{threshold.toFixed(1)}°C</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={`transition-colors duration-500 ${
                      darkMode ? "text-gray-400" : "text-gray-500"
                    }`}>
                      Threshold Progress:
                    </span>
                    <span className={`font-medium transition-colors duration-500 ${progressTextColor}`}>
                      {progress.toFixed(0)}% ({progressStatus})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className={`transition-colors duration-500 ${
                      darkMode ? "text-gray-400" : "text-gray-500"
                    }`}>
                      Log Count:
                    </span>
                    <span className="transition-colors duration-500">{logs.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={`transition-colors duration-500 ${
                      darkMode ? "text-gray-400" : "text-gray-500"
                    }`}>
                      Data Points:
                    </span>
                    <span className="transition-colors duration-500">{tempHistory.length + humidityHistory.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={`transition-colors duration-500 ${
                      darkMode ? "text-gray-400" : "text-gray-500"
                    }`}>
                      UI Theme:
                    </span>
                    <span className="transition-colors duration-500">{darkMode ? "Dark" : "Light"}</span>
                  </div>
                  {currentAlarm && (
                    <div className="flex justify-between">
                      <span className={`transition-colors duration-500 ${
                        darkMode ? "text-gray-400" : "text-gray-500"
                      }`}>
                        Active Alarm:
                      </span>
                      <span className={`font-medium transition-colors duration-500 ${
                        currentAlarm === 'fire' ? "text-red-600" : "text-orange-600"
                      }`}>
                        {currentAlarm === 'fire' ? 'Fire Alert' : 'High Temp'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </main>
        </div>
      </div>
    </div>
  );

  const LoginPage = (
    <div className={`min-h-screen flex items-center justify-center p-4 md:p-6 transition-all duration-500 ease-in-out ${themeBg}`}>
      <div
        className={`w-full max-w-md p-6 md:p-8 rounded-2xl shadow-lg border transition-all duration-500 ease-in-out ${cardBg} ${
          darkMode ? "border-gray-700" : "border-gray-200"
        }`}
      >
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-3 bg-red-100 text-red-600 rounded-full mb-4 transition-colors duration-500">
            <Flame size={30} />
          </div>
          <h2 className="text-2xl font-bold transition-colors duration-500">FireGuard Login</h2>
          <p className="text-sm text-gray-500 mt-2 transition-colors duration-500">
            Enter your credentials to access the dashboard
          </p>
        </div>
        
        {loginError && (
          <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg text-sm transition-colors duration-500">
            {loginError}
          </div>
        )}
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 transition-colors duration-500">
              Email
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-gray-700 transition-colors duration-500"
              placeholder="Enter your email"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 transition-colors duration-500">
              Password
            </label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-gray-700 transition-colors duration-500"
              placeholder="Enter your password"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg font-medium transition-colors duration-500 flex items-center justify-center"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>
      </div>
    </div>
  );

  // Show loading spinner while checking auth state
  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center transition-all duration-500 ease-in-out ${themeBg}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-lg transition-colors duration-500">Loading...</p>
        </div>
      </div>
    );
  }

  return loggedIn ? Dashboard : LoginPage;
}