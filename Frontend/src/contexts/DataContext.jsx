import { createContext, useContext, useState, useEffect } from "react";
import { API_ENDPOINTS, WEBSOCKET_URL } from "../config/config.js";
import axios from "axios";

// Create an axios instance
const api = axios.create({
  timeout: 10000, // 10 seconds timeout
  headers: {
    "Content-Type": "application/json",
  },
});

// Add request interceptor to attach auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add rate limiting - create a queue system for requests
const requestQueue = [];
let processingQueue = false;

const processQueue = async () => {
  if (processingQueue || requestQueue.length === 0) return;

  processingQueue = true;
  const nextRequest = requestQueue.shift();

  try {
    const response = await nextRequest.execute();
    nextRequest.resolve(response);
  } catch (error) {
    nextRequest.reject(error);
  } finally {
    processingQueue = false;
    // Add a delay before processing the next request to avoid rate limiting
    setTimeout(() => {
      processQueue();
    }, 500); // 500ms between requests
  }
};

// Function to add request to queue
const enqueueRequest = (requestFn) => {
  return new Promise((resolve, reject) => {
    requestQueue.push({
      execute: requestFn,
      resolve,
      reject,
    });

    if (!processingQueue) {
      processQueue();
    }
  });
};

const DataContext = createContext(undefined);

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error("useData must be used within a DataProvider");
  }
  return context;
};

export const DataProvider = ({ children }) => {
  const [chargers, setChargers] = useState([]);
  const [stations, setStations] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [walletHistory, setWalletHistory] = useState([]);
  const [rfidCards, setRfidCards] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState({
    chargers: false,
    stations: false,
    hosts: false,
    customers: false,
    transactions: false,
    walletHistory: false,
    rfidCards: false,
    notifications: false,
    logs: false,
  });
  const [error, setError] = useState({
    chargers: null,
    stations: null,
    hosts: null,
    customers: null,
    transactions: null,
    walletHistory: null,
    rfidCards: null,
    notifications: null,
    logs: null,
  });
  const [wsConnected, setWsConnected] = useState(false);
  const [wsReconnectAttempts, setWsReconnectAttempts] = useState(0);
  const [wsConnecting, setWsConnecting] = useState(false);

  // Initialize data
  useEffect(() => {
    // Check if user is authenticated before making API calls
    const token = localStorage.getItem("token");
    const isAuthenticated = !!token;

    if (isAuthenticated) {
      // Fetch all data when component mounts and user is authenticated
      refreshData();

      // Connect to websocket server for real-time updates
      setupWebSocket();
    } else {
      // If not authenticated, initialize with empty data
      console.log("User not authenticated. Initializing with empty data.");
      setChargers([]);
      setStations([]);
      setHosts([]);
      setCustomers([]);
      setTransactions([]);
      setWalletHistory([]);
      setRfidCards([]);
      setNotifications([]);
      setLogs([]);
    }

    return () => {
      // Cleanup websocket connection and intervals when component unmounts
      cleanupWebSocket();
    };
  }, []);

  // Cleanup WebSocket connection and intervals
  const cleanupWebSocket = () => {
    console.log("🧹 Cleaning up WebSocket connection...");
    
    // Clear all intervals
    if (window.pingInterval) {
      clearInterval(window.pingInterval);
      window.pingInterval = null;
      console.log("Cleared ping interval");
    }
    
    if (window.statusUpdateInterval) {
      clearInterval(window.statusUpdateInterval);
      window.statusUpdateInterval = null;
      console.log("Cleared status update interval");
    }
    
    // Close WebSocket connection
    if (window.socket) {
      if (window.socket.readyState === WebSocket.OPEN || window.socket.readyState === WebSocket.CONNECTING) {
        console.log("Closing WebSocket connection...");
        window.socket.close(1000, 'Component unmounting');
      }
      window.socket = null;
    }
    
    // Reset connection state
    setWsConnected(false);
    setWsConnecting(false);
    setWsReconnectAttempts(0);
  };

  // Setup WebSocket connection
  const setupWebSocket = () => {
    const token = localStorage.getItem("token");
    if (!token) {
      console.log("No authentication token found for WebSocket connection");
      return;
    }

    // Prevent multiple connection attempts
    if (wsConnecting) {
      console.log("WebSocket connection already in progress...");
      return;
    }

    setWsConnecting(true);

    try {
      // Close existing connection if any
      if (window.socket) {
        if (window.socket.readyState === WebSocket.OPEN || window.socket.readyState === WebSocket.CONNECTING) {
          console.log("Closing existing WebSocket connection...");
          window.socket.close(1000, 'Establishing new connection');
        }
        
        // Clear any existing intervals
        if (window.pingInterval) {
          clearInterval(window.pingInterval);
          window.pingInterval = null;
        }
        if (window.statusUpdateInterval) {
          clearInterval(window.statusUpdateInterval);
          window.statusUpdateInterval = null;
        }
      }

      // Add authentication token to WebSocket URL as query parameter
      const wsUrl = `${WEBSOCKET_URL}/ocpp/ui-client?token=${encodeURIComponent(token)}`;

      console.log("Connecting to WebSocket server at:", wsUrl.replace(token, '***TOKEN***'));
      window.socket = new WebSocket(wsUrl);

      // Set connection timeout
      const connectionTimeout = setTimeout(() => {
        if (window.socket && window.socket.readyState === WebSocket.CONNECTING) {
          console.error("WebSocket connection timeout");
          window.socket.close(1006, 'Connection timeout');
        }
      }, 10000); // 10 second timeout

      window.socket.onopen = () => {
        console.log("✅ WebSocket connection established");
        clearTimeout(connectionTimeout);
        setWsConnected(true);
        setWsConnecting(false);
        setWsReconnectAttempts(0);

        // Send authentication check
        window.socket.send(JSON.stringify({ 
          type: "auth",
          timestamp: new Date().toISOString()
        }));

        // Set up ping interval to keep connection alive (every 30 seconds)
        window.pingInterval = setInterval(() => {
          if (window.socket && window.socket.readyState === WebSocket.OPEN) {
            window.socket.send(JSON.stringify({ 
              type: "ping",
              timestamp: new Date().toISOString()
            }));
            console.log("📡 Ping sent to keep WebSocket connection alive");
          } else {
            console.warn("Cannot send ping: WebSocket not open");
            if (window.pingInterval) {
              clearInterval(window.pingInterval);
              window.pingInterval = null;
            }
          }
        }, 30000);

        // Request initial data after a short delay
        setTimeout(() => {
          if (window.socket && window.socket.readyState === WebSocket.OPEN) {
            console.log("📊 Requesting initial data from server...");
            
            window.socket.send(JSON.stringify({
              type: "getChargePoints",
              timestamp: new Date().toISOString()
            }));
            
            window.socket.send(JSON.stringify({
              type: "getLogs",
              limit: 50,
              timestamp: new Date().toISOString()
            }));

            window.socket.send(JSON.stringify({
              type: "getServerStatus",
              timestamp: new Date().toISOString()
            }));
          }
        }, 1000);
        
        // Set up interval to request charger status updates every 10 seconds (less frequent)
        window.statusUpdateInterval = setInterval(() => {
          if (window.socket && window.socket.readyState === WebSocket.OPEN) {
            window.socket.send(JSON.stringify({
              type: "getChargePoints",
              timestamp: new Date().toISOString()
            }));
          } else {
            console.warn("Cannot request status update: WebSocket not open");
            if (window.statusUpdateInterval) {
              clearInterval(window.statusUpdateInterval);
              window.statusUpdateInterval = null;
            }
          }
        }, 10000); // Reduced frequency to 10 seconds
      };

      window.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle pong response
          if (data.type === "pong") {
            console.log("📡 Received pong from server at", data.timestamp);
            return;
          }

          // Handle authentication status
          if (data.type === "authStatus") {
            if (data.authenticated) {
              console.log("🔐 WebSocket authentication confirmed");
            } else {
              console.error("❌ WebSocket authentication failed");
              window.socket.close(1008, 'Authentication failed');
            }
            return;
          }

          // Handle connection confirmation from OCPP server
          if (data.type === "connection" && data.status === "connected") {
            console.log("🔗 WebSocket authenticated successfully as UI client");
            console.log("📊 Server info:", data.serverInfo);
            
            // Store client ID for debugging
            window.socketClientId = data.clientId;
            return;
          }

          // Handle server status updates
          if (data.type === "serverStatus") {
            console.log("📊 Server status update:", data.data);
            return;
          }

          // Handle charge points data
          if (data.type === "chargePoints") {
            console.log("🔌 Received charge points data:", data.data?.length || 0, "charge points");
            
            if (data.data && Array.isArray(data.data)) {
              setChargers((prevChargers) => {
                return prevChargers.map((charger) => {
                  const liveData = data.data.find((cp) => cp.id === charger.id);
                  if (liveData) {
                    return {
                      ...charger,
                      status: liveData.status,
                      lastSeen: liveData.lastSeen,
                      isOnline: liveData.status !== "Disconnected",
                    };
                  }
                  return charger;
                });
              });
            }
            return;
          }

          // Handle new charger connection event
          if (data.type === "chargePointConnected") {
            console.log("🔌 Charger connected:", data.chargePointId);
            setChargers((prevChargers) => {
              const existingIndex = prevChargers.findIndex(
                (c) => c.id === data.chargePointId
              );
              
              if (existingIndex >= 0) {
                const updatedChargers = [...prevChargers];
                updatedChargers[existingIndex] = {
                  ...updatedChargers[existingIndex],
                  status: data.chargePoint.status,
                  lastSeen: data.timestamp,
                  isOnline: true,
                };
                return updatedChargers;
              }
              
              // If the charger doesn't exist in our list, refresh chargers data
              console.log("New charger detected, refreshing chargers list...");
              setTimeout(() => fetchChargers(), 1000);
              return prevChargers;
            });
            return;
          }

          // Handle charger disconnection event
          if (data.type === "chargePointDisconnected") {
            console.log("🔌 Charger disconnected:", data.chargePointId);
            setChargers((prevChargers) => {
              return prevChargers.map((charger) => {
                if (charger.id === data.chargePointId) {
                  return {
                    ...charger,
                    status: "Disconnected",
                    lastSeen: data.timestamp,
                    isOnline: false,
                  };
                }
                return charger;
              });
            });
            return;
          }

          // Handle OCPP messages (status updates, etc.)
          if (data.type === "ocppMessage") {
            console.log("📨 OCPP message received:", {
              chargePointId: data.chargePointId,
              direction: data.direction,
              messageType: data.message?.[0],
              action: data.message?.[2]
            });
            
            if (data.message && Array.isArray(data.message) && data.message.length >= 3) {
              const [messageType, messageId, action, payload] = data.message;
              
              // Handle status notifications
              if (messageType === 2 && action === "StatusNotification" && payload && payload.status) {
                setChargers((prevChargers) => {
                  return prevChargers.map((charger) => {
                    if (charger.id === data.chargePointId) {
                      return {
                        ...charger,
                        status: payload.status,
                        lastSeen: data.timestamp,
                        isOnline: true,
                      };
                    }
                    return charger;
                  });
                });
              }
            }
            return;
          }

          // Handle new log entry
          if (data.type === "newLog") {
            console.log("📝 New log entry:", data.log.action, "from", data.log.chargePointId);
            setLogs((prevLogs) => [data.log, ...prevLogs.slice(0, 999)]);
            return;
          }

          // Handle error messages
          if (data.type === "error") {
            console.warn("❌ WebSocket error message:", data.message || "Unknown error");
            return;
          }

          // Handle logs response
          if (data.type === "logs") {
            console.log("📝 Received logs:", data.filtered || data.data?.length || 0, "entries");
            if (data.data && Array.isArray(data.data)) {
              setLogs(data.data);
            }
            return;
          }

          // Handle command results
          if (data.type === "commandResult") {
            console.log("⚡ Command result:", data.command, data.success ? "✅" : "❌");
            return;
          }

          console.log("📨 Received WebSocket message:", data.type);
        } catch (error) {
          console.error("❌ Error parsing WebSocket message:", error);
        }
      };

      window.socket.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
        clearTimeout(connectionTimeout);
        setWsConnected(false);
        setWsConnecting(false);
        
        // Clear intervals on error
        if (window.pingInterval) {
          clearInterval(window.pingInterval);
          window.pingInterval = null;
        }
        if (window.statusUpdateInterval) {
          clearInterval(window.statusUpdateInterval);
          window.statusUpdateInterval = null;
        }
      };

      window.socket.onclose = (event) => {
        console.log(`🔌 WebSocket connection closed: Code ${event.code}, Reason: ${event.reason || 'No reason provided'}`);
        clearTimeout(connectionTimeout);
        setWsConnected(false);
        setWsConnecting(false);
        
        // Clear intervals when connection closes
        if (window.pingInterval) {
          clearInterval(window.pingInterval);
          window.pingInterval = null;
        }
        if (window.statusUpdateInterval) {
          clearInterval(window.statusUpdateInterval);
          window.statusUpdateInterval = null;
        }

        // Log close code meanings for debugging
        switch (event.code) {
          case 1000:
            console.log("🔌 WebSocket: Normal closure");
            break;
          case 1001:
            console.log("🔌 WebSocket: Going away (page refresh/navigation)");
            break;
          case 1006:
            console.log("🔌 WebSocket: Abnormal closure (network issue)");
            break;
          case 1008:
            console.log("🔌 WebSocket: Policy violation (likely authentication issue)");
            break;
          case 1011:
            console.log("🔌 WebSocket: Server error");
            break;
          default:
            console.log(`🔌 WebSocket: Unusual close code ${event.code}`);
        }

        // Only attempt to reconnect if user is still authenticated and it wasn't a manual close or auth failure
        const currentToken = localStorage.getItem("token");
        const shouldReconnect = currentToken && 
                               event.code !== 1000 && // Normal close
                               event.code !== 1008 && // Auth failure
                               wsReconnectAttempts < 3;

        if (shouldReconnect) {
          const delay = Math.min(2000 * Math.pow(2, wsReconnectAttempts), 10000);
          console.log(`🔄 Attempting to reconnect in ${delay / 1000} seconds... (attempt ${wsReconnectAttempts + 1}/3)`);

          setTimeout(() => {
            setWsReconnectAttempts((prev) => prev + 1);
            setupWebSocket();
          }, delay);
        } else {
          if (!currentToken) {
            console.log("🔌 WebSocket: No token available, not reconnecting");
          } else if (event.code === 1008) {
            console.log("🔌 WebSocket: Authentication failed, not reconnecting");
          } else {
            console.log("🔌 WebSocket: Maximum reconnection attempts reached");
          }
        }
      };
    } catch (error) {
      console.error("❌ Error setting up WebSocket:", error);
      setWsConnecting(false);
      
      // Clear any intervals that might have been set
      if (window.pingInterval) {
        clearInterval(window.pingInterval);
        window.pingInterval = null;
      }
      if (window.statusUpdateInterval) {
        clearInterval(window.statusUpdateInterval);
        window.statusUpdateInterval = null;
      }
    }
  };

  // Handle real-time charger updates
  const handleChargerUpdate = (chargerData) => {
    setChargers((prevChargers) => {
      return prevChargers.map((charger) =>
        charger.id === chargerData.id ? { ...charger, ...chargerData } : charger
      );
    });
  };

  // Handle transaction updates
  const handleTransactionUpdate = (transaction) => {
    setTransactions((prevTransactions) => {
      const existingIndex = prevTransactions.findIndex(
        (t) => t.id === transaction.id
      );
      if (existingIndex >= 0) {
        const updatedTransactions = [...prevTransactions];
        updatedTransactions[existingIndex] = {
          ...updatedTransactions[existingIndex],
          ...transaction,
        };
        return updatedTransactions;
      } else {
        return [transaction, ...prevTransactions];
      }
    });
  };

  // Refresh all data
  const refreshData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Instead of fetching all data at once, fetch sequentially with delays
      console.log("Fetching transactions...");
      await fetchTransactions();

      // Add a delay between requests to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 800));

      console.log("Fetching chargers...");
      await fetchChargers();

      await new Promise((resolve) => setTimeout(resolve, 800));

      console.log("Fetching stations...");
      await fetchStations();

      await new Promise((resolve) => setTimeout(resolve, 800));

      console.log("Fetching hosts...");
      await fetchHosts();

      await new Promise((resolve) => setTimeout(resolve, 800));

      console.log("Fetching customers...");
      await fetchCustomers();

      await new Promise((resolve) => setTimeout(resolve, 800));

      console.log("Fetching RFID cards...");
      await fetchRFIDCards();

      setLoading(false);
    } catch (error) {
      console.error("Error refreshing data:", error);
      setError("Failed to load data. Please try again later.");
      setLoading(false);
    }
  };  // Fetch chargers from API
  const fetchChargers = async () => {
    setLoading((prev) => ({ ...prev, chargers: true }));
    setError((prev) => ({ ...prev, chargers: null }));

    try {
      const response = await enqueueRequest(() =>
        api.get(API_ENDPOINTS.CHARGERS.GET_ALL)
      );

      // Process and normalize chargers data
      let chargersData = [];
      
      if (response.data && response.data.success) {
        chargersData = response.data.data || [];
      } else {
        chargersData = response.data || [];
      }
      
      // Normalize charger data to ensure consistent format
      const normalizedChargers = chargersData.map(charger => {
        // Ensure all chargers have both id and _id
        if (charger._id && !charger.id) {
          charger.id = charger._id;
        } else if (charger.id && !charger._id) {
          charger._id = charger.id;
        }
        
        // Ensure stationId is in the correct format
        if (typeof charger.stationId === 'object' && charger.stationId !== null) {
          // If it's a populated object, get the _id
          charger.stationId = charger.stationId._id || charger.stationId.id;
        }
        
        return charger;
      });
      
      console.log('Normalized chargers:', normalizedChargers);
      setChargers(normalizedChargers);
    } catch (err) {
      // Handle errors by setting empty data and logging
      if (err.response && err.response.status === 401) {
        // Authentication error - set empty data
        console.log("Authentication error fetching chargers");
        setChargers([]);
      } else {
        // For other errors, still log them
        console.error("Error fetching chargers:", err);
        setError((prev) => ({ ...prev, chargers: err.message }));
        setChargers([]);
      }
    } finally {
      setLoading((prev) => ({ ...prev, chargers: false }));
    }
  };
  // Fetch stations from API
  const fetchStations = async () => {
    setLoading((prev) => ({ ...prev, stations: true }));
    setError((prev) => ({ ...prev, stations: null }));

    try {
      console.log("Fetching stations from API...");
      const response = await enqueueRequest(() =>
        api.get(API_ENDPOINTS.STATIONS.GET_ALL)
      );

      console.log("Stations API response:", response.data);
      
      // Process stations data to ensure consistent ID format
      let stationsData = [];
      
      if (response.data && response.data.success) {
        // If API returns proper data structure
        stationsData = response.data.data || [];
        console.log(`Received ${stationsData.length} stations from API`);
      } else {
        // Fallback for other response formats
        stationsData = response.data || [];
        console.log(`Using fallback format, found ${stationsData.length} stations`);
      }
      
      // Ensure all stations have both _id and id properties
      const processedStations = stationsData.map(station => {
        // Clone the station to avoid mutating the original
        const processedStation = { ...station };
        
        // Ensure both id and _id exist
        if (station._id && !station.id) {
          processedStation.id = station._id;
        } else if (station.id && !station._id) {
          processedStation._id = station.id;
        }
        
        // Ensure status is uppercase for consistent comparison
        if (processedStation.status) {
          processedStation.status = processedStation.status.toUpperCase();
        }
        
        // Ensure isActive is a boolean
        if (typeof processedStation.isActive === 'string') {
          processedStation.isActive = processedStation.isActive.toLowerCase() === 'true';
        }
        
        return processedStation;
      });
      
      console.log('Processed stations:', processedStations);
      setStations(processedStations);
    } catch (err) {
      // Handle errors by setting empty data and logging
      if (err.response && err.response.status === 401) {
        // Authentication error - set empty data
        console.log("Authentication error fetching stations");
        setStations([]);
      } else {
        // For other errors, still log them
        console.error("Error fetching stations:", err);
        setError((prev) => ({ ...prev, stations: err.message }));
        setStations([]);
      }
    } finally {
      setLoading((prev) => ({ ...prev, stations: false }));
    }
  };

  // Fetch hosts from API
  const fetchHosts = async () => {
    setLoading((prev) => ({ ...prev, hosts: true }));
    setError((prev) => ({ ...prev, hosts: null }));

    try {
      const response = await enqueueRequest(() =>
        api.get(API_ENDPOINTS.HOSTS.GET_ALL)
      );

      // Check if response has the expected structure from our backend
      if (response.data && response.data.success) {
        // Ensure all hosts have a valid id property
        const hostData = (response.data.data || []).map((host) => {
          if (!host.id && host._id) {
            return { ...host, id: host._id };
          }
          return host;
        });
        setHosts(hostData);
      } else {
        // Fallback for other response formats
        const hostData = (response.data || []).map((host) => {
          if (!host.id && host._id) {
            return { ...host, id: host._id };
          }
          return host;
        });
        setHosts(hostData);
      }
    } catch (err) {
      // Handle errors by setting empty data and logging
      if (err.response && err.response.status === 401) {
        // Authentication error - set empty data
        console.log("Authentication error fetching hosts");
        setHosts([]);
      } else {
        // For other errors, still log them
        console.error("Error fetching hosts:", err);
        setError((prev) => ({ ...prev, hosts: err.message }));
        setHosts([]);
      }
    } finally {
      setLoading((prev) => ({ ...prev, hosts: false }));
    }
  };

  // Fetch customers from API
  const fetchCustomers = async () => {
    setLoading((prev) => ({ ...prev, customers: true }));
    setError((prev) => ({ ...prev, customers: null }));

    try {
      console.log("Fetching customers from API...");
      const response = await enqueueRequest(() =>
        api.get(API_ENDPOINTS.CUSTOMERS.GET_ALL)
      );
      
      console.log("Customers API response:", response.data);
      
      // Check if response has the expected structure from our backend
      if (response.data && response.data.success) {
        const customersData = response.data.data || [];
        console.log(`Received ${customersData.length} customers from API`);
        
        // Normalize customer data to ensure consistent format
        const normalizedCustomers = customersData.map(customer => {
          // Ensure all customers have both id and _id
          if (customer._id && !customer.id) {
            customer.id = customer._id;
          } else if (customer.id && !customer._id) {
            customer._id = customer.id;
          }
          
          // Ensure isActive is a boolean
          if (typeof customer.isActive === 'string') {
            customer.isActive = customer.isActive.toLowerCase() === 'true';
          }
          
          return customer;
        });
        
        setCustomers(normalizedCustomers);
      } else {
        // Fallback for other response formats
        console.log("Using fallback format for customer data");
        setCustomers(response.data || []);
      }
    } catch (err) {
      // Handle errors by setting empty data and logging
      if (err.response && (err.response.status === 401 || err.response.status === 403)) {
        // Authentication/Authorization error - set empty data (user doesn't have permission)
        console.log("User doesn't have permission to access customers data");
        setCustomers([]);
      } else {
        // For other errors, still log them
        console.error("Error fetching customers:", err);
        setError((prev) => ({ ...prev, customers: err.message }));
        setCustomers([]);
      }
    } finally {
      setLoading((prev) => ({ ...prev, customers: false }));
    }
  };

  // Fetch transactions from API
  const fetchTransactions = async () => {
    setLoading((prev) => ({ ...prev, transactions: true }));
    setError((prev) => ({ ...prev, transactions: null }));

    try {
      const response = await enqueueRequest(() =>
        api.get(API_ENDPOINTS.TRANSACTIONS.GET_ALL)
      );
      
      // Check if response has the expected structure from our backend
      if (response.data && response.data.success) {
        setTransactions(response.data.data || []);
      } else {
        // Fallback for other response formats
        setTransactions(response.data || []);
      }
    } catch (err) {
      // Handle errors by setting empty data and logging
      if (err.response && err.response.status === 401) {
        // Authentication error - set empty data
        console.log("Authentication error fetching transactions");
        setTransactions([]);
      } else {
        // For other errors, still log them
        console.error("Error fetching transactions:", err);
        setError((prev) => ({ ...prev, transactions: err.message }));
        setTransactions([]);
      }
    } finally {
      setLoading((prev) => ({ ...prev, transactions: false }));
    }
  };

  // Fetch wallet history from API
  const fetchWalletHistory = async () => {
    setLoading((prev) => ({ ...prev, walletHistory: true }));
    setError((prev) => ({ ...prev, walletHistory: null }));

    try {
      // Assuming we're getting the current user's wallet history
      const userId = localStorage.getItem("userId");

      if (userId) {
        // Try to fetch from API if we have a user ID
        const response = await enqueueRequest(() =>
          api.get(API_ENDPOINTS.WALLET.GET_HISTORY(userId))
        );
        
        // Check if response has the expected structure from our backend
        if (response.data && response.data.success) {
          setWalletHistory(response.data.data || []);
        } else {
          // Fallback for other response formats
          setWalletHistory(response.data || []);
        }
      } else {
        // If no user ID is found, set empty data
        console.log("No user ID found for wallet history");
        setWalletHistory([]);
      }
    } catch (err) {
      // Handle errors by setting empty data and logging
      if (err.response && err.response.status === 401) {
        console.log("Authentication error fetching wallet history");
        setWalletHistory([]);
      } else {
        console.error("Error fetching wallet history:", err);
        setError((prev) => ({ ...prev, walletHistory: err.message }));
        setWalletHistory([]);
      }
    } finally {
      setLoading((prev) => ({ ...prev, walletHistory: false }));
    }
  };

  // Fetch RFID cards from API
  const fetchRFIDCards = async () => {
    setLoading((prev) => ({ ...prev, rfidCards: true }));
    setError((prev) => ({ ...prev, rfidCards: null }));

    try {
      const response = await enqueueRequest(() =>
        api.get(API_ENDPOINTS.RFID.GET_ALL)
      );
      
      // Check if response has the expected structure from our backend
      if (response.data && response.data.success) {
        setRfidCards(response.data.data || []);
      } else {
        // Fallback for other response formats
        setRfidCards(response.data || []);
      }
    } catch (err) {
      // Handle errors by setting empty data and logging
      if (err.response && err.response.status === 401) {
        // Authentication error - set empty data
        console.log("Authentication error fetching RFID cards");
        setRfidCards([]);
      } else {
        // For other errors, still log them
        console.error("Error fetching RFID cards:", err);
        setError((prev) => ({ ...prev, rfidCards: err.message }));
        setRfidCards([]);
      }
    } finally {
      setLoading((prev) => ({ ...prev, rfidCards: false }));
    }
  };

  // Fetch notifications from API
  const fetchNotifications = async () => {
    setLoading((prev) => ({ ...prev, notifications: true }));
    setError((prev) => ({ ...prev, notifications: null }));

    try {
      // Using proper API endpoint from config
      const response = await enqueueRequest(() =>
        api.get("/notifications")
      );
      
      // Check if response has the expected structure from our backend
      if (response.data && response.data.success) {
        setNotifications(response.data.data || []);
      } else {
        // Fallback for other response formats
        setNotifications(response.data || []);
      }
    } catch (err) {
      // Handle errors by setting empty data and logging
      if (err.response && err.response.status === 401) {
        // Authentication error - set empty data
        console.log("Authentication error fetching notifications");
        setNotifications([]);
      } else {
        // For other errors, still log them
        console.error("Error fetching notifications:", err);
        setError((prev) => ({ ...prev, notifications: err.message }));
        setNotifications([]);
      }
    } finally {
      setLoading((prev) => ({ ...prev, notifications: false }));
    }
  };

  // Fetch system logs from API
  const fetchLogs = async () => {
    setLoading((prev) => ({ ...prev, logs: true }));
    setError((prev) => ({ ...prev, logs: null }));

    try {
      // Using proper API endpoint from config or fallback to a default path
      const response = await enqueueRequest(() =>
        api.get(API_ENDPOINTS.OCPP.LOGS)
      );
      
      console.log("Logs API response:", response.data);
      
      // Check if response has the expected structure from our backend
      if (response.data && response.data.success) {
        const logsData = response.data.data?.logs || response.data.data || [];
        console.log("Parsed logs data:", logsData);
        setLogs(logsData);
      } else {
        // Fallback for other response formats
        setLogs(response.data || []);
      }
    } catch (err) {
      // Handle errors by setting empty data and logging
      if (err.response && err.response.status === 401) {
        // Authentication error - set empty data
        console.log("Authentication error fetching logs");
        setLogs([]);
      } else {
        // For other errors, still log them
        console.error("Error fetching logs:", err);
        setError((prev) => ({ ...prev, logs: err.message }));
        setLogs([]);
      }
    } finally {
      setLoading((prev) => ({ ...prev, logs: false }));
    }
  };

  // CRUD operations for chargers
  const addCharger = async (charger) => {
    try {
      console.log('Sending charger data to backend:', JSON.stringify(charger));
      console.log('StationId type:', typeof charger.stationId);
      
      const response = await enqueueRequest(() =>
        api.post(API_ENDPOINTS.CHARGERS.CREATE, charger)
      );

      // Check if response has the expected structure from our backend
      if (response.data && response.data.success) {
        const newCharger = response.data.data;
        
        // Ensure we have proper MongoDB ID formatting
        if (newCharger._id && !newCharger.id) {
          newCharger.id = newCharger._id;
        }
        
        // Make sure stationId is in the right format for filtering
        if (typeof newCharger.stationId === 'object' && newCharger.stationId !== null) {
          // If it's a populated object, get the _id
          const stationObjId = newCharger.stationId._id || newCharger.stationId.id;
          // Store the raw ID
          newCharger.stationId = stationObjId;
        }
        
        console.log('Adding new charger to state:', newCharger);
        setChargers((prevChargers) => [...prevChargers, newCharger]);
        return newCharger;
      } else if (response.data) {
        // Fallback for mock data or other response formats
        const newCharger = response.data;
          // Ensure we have proper MongoDB ID formatting
        if (newCharger._id && !newCharger.id) {
          newCharger.id = newCharger._id;
        }
        
        // Make sure stationId is in the right format for filtering
        if (typeof newCharger.stationId === 'object' && newCharger.stationId !== null) {
          // If it's a populated object, get the _id
          const stationObjId = newCharger.stationId._id || newCharger.stationId.id;
          // Store the raw ID
          newCharger.stationId = stationObjId;
        }
        
        console.log('Adding new charger to state (fallback):', newCharger);
        setChargers((prevChargers) => [...prevChargers, newCharger]);
        return newCharger;
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (err) {
      console.error("Error adding charger:", err);
      
      // Check if the charger was actually created despite the error
      try {
        if (err.response && err.response.data) {
          const errorData = err.response.data;
          
          // If the charger data is in the error response, use it
          if (errorData.data && errorData.data._id) {
            const partialCharger = { 
              ...charger, 
              id: errorData.data._id,
              _id: errorData.data._id 
            };
            
            console.log("Charger was created despite error, adding to UI:", partialCharger);
            setChargers((prevChargers) => [...prevChargers, partialCharger]);
            
            // Return the charger data instead of throwing an error
            return partialCharger;
          }
          
          // Handle validation errors
          if (errorData.errors && Array.isArray(errorData.errors)) {
            const errorMessage = errorData.errors.map(e => e.msg || e.message).join(', ');
            throw new Error(errorMessage);
          } else if (errorData.message) {
            throw new Error(errorData.message);
          }
        }
      } catch (uiError) {
        console.warn("Error handling charger creation response:", uiError);
      }
      
      handleApiError(err, "add charger");
      throw err; // Re-throw to allow component to handle the error
    }
  };

  const updateCharger = async (id, updates) => {
    try {
      const response = await enqueueRequest(() =>
        api.put(API_ENDPOINTS.CHARGERS.UPDATE(id), updates)
      );

      // Check if response has the expected structure from our backend
      let updatedCharger;
      if (response.data && response.data.success) {
        updatedCharger = response.data.data;
      } else {
        updatedCharger = response.data;
      }

      setChargers((prevChargers) =>
        prevChargers.map((c) =>
          c.id === id || c._id === id ? { ...c, ...updatedCharger } : c
        )
      );
      return updatedCharger;
    } catch (err) {
      console.error("Error updating charger:", err);
      
      // Provide more detailed error messages based on API response
      if (err.response && err.response.data) {
        const errorData = err.response.data;
        let errorMessage = errorData.message || "Unknown server error";
        
        // Handle validation errors
        if (errorData.errors && Array.isArray(errorData.errors)) {
          errorMessage = errorData.errors.map(e => e.msg || e.message).join(', ');
        }
        
        throw new Error(errorMessage);
      }
      
      handleApiError(err, "update charger");
      throw err; // Re-throw to allow component to handle the error
    }
  };

  const deleteCharger = async (id) => {
    try {
      const response = await enqueueRequest(() => api.delete(API_ENDPOINTS.CHARGERS.DELETE(id)));
      
      if (response.data && response.data.success) {
        setChargers((prevChargers) =>
          prevChargers.filter((c) => c.id !== id && c._id !== id)
        );
        return true;
      }
      return false;
    } catch (err) {
      console.error("Error deleting charger:", err);
      handleApiError(err, "delete charger");
    }
  };
  // CRUD operations for stations
  const addStation = async (station) => {
    try {
      console.log("Sending station data to API:", JSON.stringify(station));
      
      const response = await enqueueRequest(() =>
        api.post(API_ENDPOINTS.STATIONS.CREATE, station)
      );

      console.log("Station API response:", JSON.stringify(response.data));
      
      // Check if response has the expected structure from our backend
      if (response.data && response.data.success) {
        const newStation = response.data.data;
        
        // Ensure station has both id and _id properties
        if (newStation._id && !newStation.id) {
          newStation.id = newStation._id;
        } else if (newStation.id && !newStation._id) {
          newStation._id = newStation.id;
        }
        
        console.log("Adding station to state:", newStation);
        
        // Update stations state immediately with the new station
        setStations(prevStations => {
          console.log("Previous stations count:", prevStations.length);
          const newStations = [...prevStations, newStation];
          console.log("New stations count:", newStations.length);
          return newStations;
        });
        
        return newStation;
      } else {
        // Fallback for mock data or other response formats
        const newStation = response.data;
        
        // Ensure station has both id and _id properties
        if (newStation._id && !newStation.id) {
          newStation.id = newStation._id;
        } else if (newStation.id && !newStation._id) {
          newStation._id = newStation.id;
        }
        
        console.log("Adding station to state (fallback):", newStation);
        
        // Update stations state immediately with the new station
        setStations(prevStations => {
          console.log("Previous stations count (fallback):", prevStations.length);
          const newStations = [...prevStations, newStation];
          console.log("New stations count (fallback):", newStations.length);
          return newStations;
        });
        
        return newStation;
      }
    } catch (err) {
      console.error("Error adding station:", err);
      
      // Check if the station was actually created despite the error
      try {
        if (err.response && err.response.data) {
          const errorData = err.response.data;
          
          // If the station data is in the error response, use it
          if (errorData.data && errorData.data._id) {
            const partialStation = { 
              ...station, 
              id: errorData.data._id,
              _id: errorData.data._id 
            };
            
            console.log("Station was created despite error, adding to UI:", partialStation);
            // Update stations state immediately with the new station
            setStations((prevStations) => {
              console.log("Previous stations count (error case):", prevStations.length);
              const newStations = [...prevStations, partialStation];
              console.log("New stations count (error case):", newStations.length);
              return newStations;
            });
            
            // Return the station data instead of throwing an error
            return partialStation;
          }
          
          // Format validation errors if present
          if (errorData.errors && Array.isArray(errorData.errors)) {
            const errorMessages = errorData.errors.map(e => `${e.param}: ${e.msg}`).join(', ');
            throw new Error(`Validation errors: ${errorMessages}`);
          } else if (errorData.message) {
            throw new Error(errorData.message);
          }
        }
      } catch (uiError) {
        console.warn("Error handling station creation response:", uiError);
      }
      
      // If we couldn't handle the error specifically, use the generic handler
      handleApiError(err, "add station");
    }
  };

  const updateStation = async (id, updates) => {
    try {
      const response = await enqueueRequest(() =>
        api.put(API_ENDPOINTS.STATIONS.UPDATE(id), updates)
      );

      // Check if response has the expected structure from our backend
      let updatedStation;
      if (response.data && response.data.success) {
        updatedStation = response.data.data;
      } else {
        updatedStation = response.data;
      }

      setStations((prevStations) =>
        prevStations.map((s) =>
          s.id === id || s._id === id ? { ...s, ...updatedStation } : s
        )
      );
      return updatedStation;
    } catch (err) {
      console.error("Error updating station:", err);
      handleApiError(err, "update station");
    }
  };

  const deleteStation = async (id) => {
    try {
      const response = await enqueueRequest(() => api.delete(API_ENDPOINTS.STATIONS.DELETE(id)));
      
      // Only remove the station from state if delete was successful
      if (response.data && response.data.success) {
        setStations((prevStations) => prevStations.filter((s) => s.id !== id && s._id !== id));
        return true;
      }
      return false;
    } catch (err) {
      console.error("Error deleting station:", err);
      handleApiError(err, "delete station");
    }
  };

  // CRUD operations for hosts
  const addHost = async (host) => {
    try {
      const response = await enqueueRequest(() =>
        api.post(API_ENDPOINTS.HOSTS.CREATE, host)
      );      // Check if response has the expected structure from our backend
      if (response.data && response.data.success) {
        const newHost = response.data.data;
        // Ensure host has an id property
        if (newHost && !newHost.id && newHost._id) {
          newHost.id = newHost._id;
        }
        setHosts((prevHosts) => [...prevHosts, newHost]);
        return newHost;
      } else {
        // Fallback for mock data or other response formats
        const newHost = response.data;
        // Ensure host has an id property
        if (newHost && !newHost.id && newHost._id) {
          newHost.id = newHost._id;
        }
        setHosts((prevHosts) => [...prevHosts, newHost]);
        return newHost;
      }
    } catch (err) {
      console.error("Error adding host:", err);
      handleApiError(err, "add host");
    }
  };

  const updateHost = async (id, updates) => {
    try {
      const response = await enqueueRequest(() =>
        api.put(API_ENDPOINTS.HOSTS.UPDATE(id), updates)
      );

      // Check if response has the expected structure from our backend
      let updatedHost;
      if (response.data && response.data.success) {
        updatedHost = response.data.data;
      } else {
        updatedHost = response.data;
      }
      
      setHosts((prevHosts) =>
        prevHosts.map((h) => (h.id === id || h._id === id ? { ...h, ...updatedHost } : h))
      );
      return updatedHost;
    } catch (err) {
      console.error("Error updating host:", err);
      handleApiError(err, "update host");
    }
  };

  const deleteHost = async (id) => {
    try {
      const response = await enqueueRequest(() => api.delete(API_ENDPOINTS.HOSTS.DELETE(id)));
      
      // Only remove the host from the state if the delete was successful
      if (response.data && response.data.success) {
        setHosts((prevHosts) => 
          prevHosts.filter((h) => h.id !== id && h._id !== id)
        );
        return true;
      }
      return false;
    } catch (err) {
      console.error("Error deleting host:", err);
      handleApiError(err, "delete host");
    }
  };

  // CRUD operations for RFID cards
  const addRFIDCard = async (card) => {
    try {
      const response = await enqueueRequest(() =>
        api.post(API_ENDPOINTS.RFID.CREATE, card)
      );
      
      // Check if response has the expected structure from our backend
      if (response.data && response.data.success) {
        const newCard = response.data.data;
        setRfidCards((prevCards) => [...prevCards, newCard]);
        return newCard;
      } else {
        // Fallback for mock data or other response formats
        const newCard = response.data;
        setRfidCards((prevCards) => [...prevCards, newCard]);
        return newCard;
      }
    } catch (err) {
      console.error("Error adding RFID card:", err);
      handleApiError(err, "add RFID card");
    }
  };

  const updateRFIDCard = async (id, updates) => {
    try {
      const response = await enqueueRequest(() =>
        api.put(API_ENDPOINTS.RFID.UPDATE(id), updates)
      );
      
      // Check if response has the expected structure from our backend
      let updatedCard;
      if (response.data && response.data.success) {
        updatedCard = response.data.data;
      } else {
        updatedCard = response.data;
      }
      
      setRfidCards((prevCards) =>
        prevCards.map((r) => (r.id === id || r._id === id ? { ...r, ...updatedCard } : r))
      );
      return updatedCard;
    } catch (err) {
      console.error("Error updating RFID card:", err);
      handleApiError(err, "update RFID card");
    }
  };

  const deleteRFIDCard = async (id) => {
    try {
      const response = await enqueueRequest(() => api.delete(API_ENDPOINTS.RFID.DELETE(id)));
      
      // Only remove the card from state if the delete was successful
      if (response.data && response.data.success) {
        setRfidCards((prevCards) => prevCards.filter((r) => r.id !== id && r._id !== id));
        return true;
      }
      return false;
    } catch (err) {
      console.error("Error deleting RFID card:", err);
      handleApiError(err, "delete RFID card");
    }
  };

  // Generate OCPP URL for a charger
  const generateOcppUrl = async (chargePointId) => {
    try {
      console.log("Generating OCPP URL for chargePointId:", chargePointId);
      
      const response = await enqueueRequest(() =>
        api.post(API_ENDPOINTS.OCPP.GENERATE_URL, { chargePointId })
      );
      
      console.log("OCPP URL generation response:", response);
      
      // Check if response has the expected structure
      if (response.data && response.data.success) {
        const data = response.data.data;
        
        // Ensure we're using the configured URL
        if (data.websocketUrl && !data.websocketUrl.startsWith(WEBSOCKET_URL)) {
          console.warn("Received non-production URL, forcing configured production URL");
          data.websocketUrl = data.websocketUrl.replace(
            /^(ws|wss):\/\/[^\/]+/, 
            WEBSOCKET_URL
          );
          data.connectionUrl = data.websocketUrl;
        }
        
        return data;
      } else if (response.data) {
        // Fallback for unexpected response structure
        console.warn("Unexpected OCPP URL response structure:", response.data);
        
        // Ensure we're using the configured URL even in fallback case
        if (response.data.websocketUrl && !response.data.websocketUrl.startsWith(WEBSOCKET_URL)) {
          response.data.websocketUrl = response.data.websocketUrl.replace(
            /^(ws|wss):\/\/[^\/]+/, 
            WEBSOCKET_URL
          );
          response.data.connectionUrl = response.data.websocketUrl;
        }
        
        return response.data;
      } else {
        throw new Error("Failed to generate OCPP URL: Invalid response format");
      }
    } catch (err) {
      console.error("Error generating OCPP URL:", err);
      if (err.response) {
        throw new Error(`Failed to generate OCPP URL: ${err.response.data?.message || err.response.statusText}`);
      } else if (err.request) {
        throw new Error("Network error: Could not connect to the server");
      } else {
        throw new Error(`Network error: ${err.message}`);
      }
    }
  };

  // Fetch dashboard statistics from API
  const fetchDashboardStats = async () => {
    setLoading((prev) => ({ ...prev, dashboardStats: true }));
    setError((prev) => ({ ...prev, dashboardStats: null }));

    try {
      const response = await enqueueRequest(() =>
        api.get(API_ENDPOINTS.STATS.DASHBOARD)
      );
      
      // Check if response has the expected structure from our backend
      if (response.data && response.data.success) {
        return response.data.data;
      } else {
        // Fallback for other response formats
        return response.data || null;
      }
    } catch (err) {
      console.error("Error fetching dashboard stats:", err);
      setError((prev) => ({ ...prev, dashboardStats: err.message }));
      return null;
    } finally {
      setLoading((prev) => ({ ...prev, dashboardStats: false }));
    }
  };

  // Calculate dashboard stats from available data
  const getDashboardStats = () => {
    // Create a stats object from the actual data we have
    const activeChargers = chargers.filter(c => c.status === 'ONLINE').length;
    const inactiveChargers = chargers.length - activeChargers;
    
    // Count stations with proper status check (case insensitive)
    const operationalStations = stations.filter(s => 
      s.status && s.status.toUpperCase() === 'ACTIVE'
    ).length;
    const maintenanceStations = stations.filter(s => 
      s.status && s.status.toUpperCase() === 'MAINTENANCE'
    ).length;
    
    console.log('Calculating dashboard stats from:', {
      chargers: chargers.length,
      stations: stations.length,
      customers: customers.length,
      transactions: transactions.length
    });
    
    // Calculate total kWh from transactions
    const totalKWh = transactions.reduce((total, t) => total + (t.energy || 0), 0);
    const formattedKWh = `${totalKWh.toFixed(2)} kWh`;
    
    // Calculate completed and failed sessions
    const completedSessions = transactions.filter(t => t.status === 'COMPLETED').length;
    const failedSessions = transactions.filter(t => t.status === 'FAILED').length;
    
    // Mock growth and trends for now, as they require historical data
    const customerGrowth = "+5%";
    const revenueTrend = "+7%";
    
    // Calculate total revenue from transactions
    const totalRevenue = transactions.reduce((total, t) => total + (t.amount || 0), 0);
    
    // Count active customers properly
    const activeCustomers = customers.filter(c => c.isActive === true).length;
    
    return {
      chargers: { 
        total: chargers.length, 
        active: activeChargers, 
        inactive: inactiveChargers 
      },
      stations: { 
        total: stations.length, 
        operational: operationalStations, 
        maintenance: maintenanceStations 
      },
      customers: { 
        total: customers.length, 
        active: activeCustomers, 
        growth: customerGrowth 
      },
      revenue: { 
        total: `₹${totalRevenue.toFixed(2)}`, 
        monthly: `₹${(totalRevenue * 0.3).toFixed(2)}`, 
        trend: revenueTrend 
      },
      uptime: 98.5, // Mock uptime as this would typically come from monitoring
      energyConsumed: formattedKWh,
      sessions: { 
        total: transactions.length, 
        completed: completedSessions, 
        failed: failedSessions 
      }
    };
  };
  // Helper function to handle API errors
  const handleApiError = (err, entityName) => {
    // Check for validation errors (400)
    if (
      err.response &&
      err.response.status === 400 &&
      err.response.data &&
      err.response.data.errors
    ) {
      const errorMessage = err.response.data.errors
        .map((e) => e.msg)
        .join(", ");
      throw new Error(errorMessage);
    } 
    // Check for not found errors (404)
    else if (err.response && err.response.status === 404) {
      throw new Error(`${entityName} not found`);
    }
    // Check for unauthorized errors (401)
    else if (err.response && err.response.status === 401) {
      throw new Error("Unauthorized. Please log in again.");
    }
    // Check for forbidden errors (403)
    else if (err.response && err.response.status === 403) {
      throw new Error("You don't have permission to perform this action.");
    }
    // For all other errors
    else {
      throw new Error(
        err.response?.data?.message || 
        `Failed to ${entityName.startsWith('add') ? entityName : entityName + ' operation'}`
      );
    }
  };

  // Manual reconnect function
  const reconnectWebSocket = () => {
    console.log("🔄 Manual WebSocket reconnection requested...");
    cleanupWebSocket();
    
    // Wait a bit before reconnecting
    setTimeout(() => {
      const token = localStorage.getItem("token");
      if (token) {
        setWsReconnectAttempts(0); // Reset attempts for manual reconnection
        setupWebSocket();
      } else {
        console.log("❌ Cannot reconnect: No authentication token available");
      }
    }, 1000);
  };

  // Send command to charger via WebSocket
  const sendCommandToCharger = (chargerId, command, payload = {}) => {
    if (!window.socket || window.socket.readyState !== WebSocket.OPEN) {
      console.error("❌ WebSocket not connected. Cannot send command to charger.");
      return false;
    }

    try {
      // Send command via WebSocket server
      window.socket.send(
        JSON.stringify({
          type: "sendCommand",
          chargePointId: chargerId,
          command: command,
          payload: payload,
          timestamp: new Date().toISOString()
        })
      );

      console.log(`⚡ Command ${command} sent to charger ${chargerId}`, payload);
      return true;
    } catch (error) {
      console.error("❌ Error sending command to charger:", error);
      return false;
    }
  };

  // Request status from charger
  const requestChargerStatus = (chargerId) => {
    return sendCommandToCharger(chargerId, "GetStatus", {});
  };

  // Reset charger
  const resetCharger = (chargerId, type = "Soft") => {
    return sendCommandToCharger(chargerId, "Reset", { type });
  };

  // Remote start transaction
  const remoteStartTransaction = (chargerId, idTag, connectorId = 1) => {
    return sendCommandToCharger(chargerId, "RemoteStartTransaction", {
      idTag,
      connectorId,
    });
  };

  // Remote stop transaction
  const remoteStopTransaction = (chargerId, transactionId) => {
    return sendCommandToCharger(chargerId, "RemoteStopTransaction", {
      transactionId,
    });
  };

  return (
    <DataContext.Provider
      value={{
        chargers,
        stations,
        hosts,
        customers,
        transactions,
        walletHistory,
        rfidCards,
        notifications,
        logs,
        loading,
        error,
        refreshData,
        fetchChargers,
        fetchLogs,
        addCharger,
        updateCharger,
        deleteCharger,
        addStation,
        updateStation,
        deleteStation,
        addHost,
        updateHost,
        deleteHost,
        addRFIDCard,
        updateRFIDCard,
        deleteRFIDCard,
        generateOcppUrl,
        fetchDashboardStats,
        getDashboardStats,
        wsConnected,
        wsConnecting,
        wsReconnectAttempts,
        setupWebSocket,
        cleanupWebSocket,
        reconnectWebSocket,
        sendCommandToCharger,
        requestChargerStatus,
        resetCharger,
        remoteStartTransaction,
        remoteStopTransaction,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};
