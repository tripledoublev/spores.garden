/**
 * Jetstream client for real-time AT Protocol event discovery
 * 
 * Jetstream is a filtered WebSocket firehose that lets us discover
 * new gardens and flower activity in real-time across the entire network.
 */

export interface JetstreamEvent {
  did: string;
  time_us: number;
  kind: 'commit' | 'identity' | 'account';
  commit?: {
    rev: string;
    operation: 'create' | 'update' | 'delete';
    collection: string;
    rkey: string;
    record?: Record<string, unknown>;
    cid?: string;
  };
}

export interface GardenDiscoveryEvent {
  did: string;
  collection: string;
  rkey: string;
  operation: 'create' | 'update' | 'delete';
  timestamp: Date;
  record?: Record<string, unknown>;
}

type EventCallback = (event: GardenDiscoveryEvent) => void;

/**
 * Jetstream client for discovering gardens and flower activity
 */
export class JetstreamClient {
  private ws: WebSocket | null = null;
  private callbacks: Set<EventCallback> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private shouldReconnect = true;
  private messageCount = 0;

  // Jetstream endpoints (multiple for redundancy)
  private endpoints = [
    'wss://jetstream1.us-east.bsky.network/subscribe',
    'wss://jetstream2.us-east.bsky.network/subscribe',
    'wss://jetstream1.us-west.bsky.network/subscribe',
    'wss://jetstream2.us-west.bsky.network/subscribe',
  ];
  private currentEndpointIndex = 0;

  // Collections we care about for garden discovery
  private wantedCollections = [
    'garden.spores.site.config',       // Garden creation/edit
    'garden.spores.social.flower',     // Flower planting activity
    'garden.spores.social.takenFlower', // Flower picking activity
    'garden.spores.item.specialSpore', // Special spore activity
    'coop.hypha.spores.site.config',
    'coop.hypha.spores.social.flower',
    'coop.hypha.spores.social.takenFlower',
    'coop.hypha.spores.item.specialSpore',
  ];

  // How far back to fetch historical events (24 hours in milliseconds)
  // Reduced from 7 days to avoid processing too many identity/account events
  private historicalWindowMs = 24 * 60 * 60 * 1000;

  /**
   * Connect to Jetstream and start receiving events
   * @param fetchHistory - If true, fetch events from the last 7 days (default: true on first connect)
   */
  connect(fetchHistory: boolean = true): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.shouldReconnect = true;

    const endpoint = this.endpoints[this.currentEndpointIndex];
    const params = new URLSearchParams();
    
    // Add wanted collections as query params
    for (const collection of this.wantedCollections) {
      params.append('wantedCollections', collection);
    }

    // Add cursor to fetch historical events (24 hours ago in microseconds)
    if (fetchHistory) {
      const cursorTime = (Date.now() - this.historicalWindowMs) * 1000; // Convert ms to μs
      params.append('cursor', cursorTime.toString());
      console.log(`[Jetstream] Fetching last 24 hours of garden activity...`);
    }

    const url = `${endpoint}?${params.toString()}`;
    
    console.log(`[Jetstream] Connecting to ${endpoint}...`);
    
    try {
      this.ws = new WebSocket(url);
      
      this.ws.onopen = () => {
        console.log('[Jetstream] Connected successfully');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.messageCount = 0;

        // Log message count after 5 seconds to see if we're receiving anything
        setTimeout(() => {
          console.log(`[Jetstream] Messages received in first 5s: ${this.messageCount}`);
        }, 5000);
      };

      this.ws.onmessage = (event) => {
        this.messageCount++;
        if (this.messageCount % 100 === 0) {
          console.log(`[Jetstream] Received ${this.messageCount} messages`);
        }
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.warn('[Jetstream] WebSocket error:', error);
      };

      this.ws.onclose = (event) => {
        this.isConnecting = false;
        console.log(`[Jetstream] Disconnected (code: ${event.code})`);
        
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      console.error('[Jetstream] Failed to create WebSocket:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from Jetstream
   */
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Subscribe to garden discovery events
   */
  onDiscovery(callback: EventCallback): () => void {
    this.callbacks.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Handle incoming Jetstream message
   */
  private handleMessage(data: string): void {
    try {
      const event: JetstreamEvent = JSON.parse(data);

      // Log event types periodically for debugging
      if (this.messageCount <= 10 || this.messageCount % 1000 === 0) {
        console.log(`[Jetstream] Event kind: ${event.kind}${event.commit ? `, collection: ${event.commit.collection}` : ''}`);
      }

      // Only process commit events (record changes)
      if (event.kind !== 'commit' || !event.commit) {
        return;
      }

      const { commit } = event;
      
      // Only process creates and updates for our collections
      if (commit.operation === 'delete') {
        return;
      }

      if (!this.wantedCollections.includes(commit.collection)) {
        return;
      }

      // Create discovery event
      const discoveryEvent: GardenDiscoveryEvent = {
        did: event.did,
        collection: commit.collection,
        rkey: commit.rkey,
        operation: commit.operation,
        timestamp: new Date(event.time_us / 1000), // Convert microseconds to milliseconds
        record: commit.record,
      };

      console.log('[Jetstream] Garden event:', commit.collection, event.did);

      // Notify all callbacks
      for (const callback of this.callbacks) {
        try {
          callback(discoveryEvent);
        } catch (error) {
          console.error('[Jetstream] Callback error:', error);
        }
      }
    } catch (error) {
      // Ignore parse errors for malformed messages
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      // Try next endpoint
      this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.endpoints.length;
      this.reconnectAttempts = 0;
      console.log(`[Jetstream] Switching to endpoint: ${this.endpoints[this.currentEndpointIndex]}`);
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;
    
    console.log(`[Jetstream] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
    
    setTimeout(() => {
      if (this.shouldReconnect) {
        // Don't fetch history on reconnect, only on initial connect
        this.connect(false);
      }
    }, delay);
  }
}

// Singleton instance for the app
let jetstreamInstance: JetstreamClient | null = null;

/**
 * Get the shared Jetstream client instance
 */
export function getJetstreamClient(): JetstreamClient {
  if (!jetstreamInstance) {
    jetstreamInstance = new JetstreamClient();
  }
  return jetstreamInstance;
}

/**
 * Start Jetstream discovery (call once at app startup)
 */
export function startJetstreamDiscovery(): JetstreamClient {
  const client = getJetstreamClient();
  client.connect();
  return client;
}

/**
 * Stop Jetstream discovery
 */
export function stopJetstreamDiscovery(): void {
  if (jetstreamInstance) {
    jetstreamInstance.disconnect();
  }
}
