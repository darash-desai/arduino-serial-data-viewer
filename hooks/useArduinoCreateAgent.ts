import { useState } from "react";

// Note: using socket.io-client v2.4.0 as socket.io v3 is not yet compatible
// with arudino create agent
import io from "socket.io-client";
import type { UseArduinoOptions, ArduinoStatus } from "./useArduino";

/** Defnes type for devices returned by the Arduino Create Agent. */
export type ArduinoDevice = {
  Name: string;
  SerialNumber: string;
  DeviceClass: string;
  IsOpen: boolean;
  isPrimary: boolean;
  Baud: number;
  BufferAlgorithm: string;
  Ver: string;
  NetworkPort: boolean;
  VendorID: string;
  ProductID: string;
};

export type ArduinoDeviceList = { [key: string]: ArduinoDevice };

/** Reference to the current socket instance. */
let socket: ReturnType<typeof io> | null = null;

/**
 * List of potential local ports on which the Arduino Create Agent may be
 * listening. This is based on the ports documented by the
 * {@link https://github.com/arduino/arduino-create-agent Arduino Create Agent}
 * project.
 */
const ARDUINO_CREATE_PORTS: Readonly<number[]> = [
  8990,
  8991,
  8992,
  8993,
  8994,
  8995,
  8996,
  8997,
  8998,
  8999,
  9000,
];

/**
 * The number of milliseconds after which a request to the Arduino Create Agent
 * should time out.
 */
const RESPONSE_TIMEOUT = 30 * 1000;

/**
 * Searches for the currently bound server port in the range of potential ports
 * specified by the Arduino Create Agent documentation.
 */
const findServerPort = async (): Promise<number | null> => {
  return (
    (
      await Promise.all<number | null>(
        ARDUINO_CREATE_PORTS.map(
          (port) =>
            new Promise((resolve) => {
              fetch(`http://localhost:${port}/info`)
                .then(() => resolve(port))
                .catch(() => resolve(null));
            })
        )
      )
    ).find((value) => value !== null) || null
  );
};

/**
 * A general message handler that is used to handle `message` events from the
 * web socket. The `_currentCallback` property is used internally to modify
 * the callback behavior based on the most recent event that was fired.
 *
 * @param message   The message received from the Arduino Create Agent.
 */
let _currentCallback: ((message: string) => void) | null;
const messageHandler = (message: string) => {
  if (_currentCallback) {
    _currentCallback(message);
    return;
  }
};

type UseArduinoResult = {
  /**
   * Opens a serial connection to a specific Arduino device.
   *
   * @param device   The device to connect to. This should be an object from
   *                  `UseArduinoResult.devices` property.
   * @param baudRate  The baud rate to use to establish communication.
   */
  connect: (device: ArduinoDevice, baudRate: number) => Promise<void>;

  /**
   * Disconnects from the currently connected Arduino device.
   */
  disconnect: () => Promise<void>;

  /**
   * Sends data to the currently connected Arduino device.
   *
   * @param output  The data to send as a string.
   */
  write: (output: string) => Promise<void>;

  /**
   * The current connection status.
   */
  status: ArduinoStatus;

  /**
   * Fetches a list of Arduino devices that are available for the system to
   * connect to. This is obtained by making a connection to the Arduino
   * Create Agent and requesting the list of available devices. Note that this
   * function must be called before attempting to connecting to any device.
   *
   * @returns   A list of available Arduino devices, or null if a connection to
   *            the Arduino Create Agent could not be made.
   */
  fetchDevices: () => Promise<ArduinoDeviceList | null>;
};

/**
 * Hook that provides access to communicate with Arduino devices that are
 * available to the local system using the Arduino Create Agent. This is
 * intended as a fallback mechanism to those who are unable to successfully
 * leverage the Web Serial API to connect to their Arduino devices directly
 * through their browser.
 */
export function useArduinoCreateAgent({
  onRead,
  readDelimiter = "",
}: UseArduinoOptions): UseArduinoResult {
  const [connectedDevice, setConnectedDevice] = useState<string | null>(null);
  const status = connectedDevice ? "connected" : "disconnected";

  // Fetches a list of available Arduino devices from the Arduino Create Agent.
  // If an existing connection to the Agent is not available, a new one is
  // created. A null value is returned if a connection to the Agent could not
  // successfully be made.
  const fetchDevices = async (): Promise<ArduinoDeviceList | null> => {
    // Only allow connection on the client side and ignore if already connected
    // to a device
    if (typeof window === "undefined" || status === "connected") return null;

    // Connects to the Arduino Create Agent and fetches the current device list.
    const connectAgent = async (): Promise<void> => {
      const port = await findServerPort();
      if (!port) {
        console.log("No Arduino Create Agent found.");
        return;
      }

      await new Promise<void>((resolve) => {
        socket = io(`ws://localhost:${port}`, {
          transports: ["websocket"],
        });

        if (!socket) return;

        socket.on("connect", function () {
          if (!socket) return;

          socket.on("disconnect", function () {
            if (!socket) return;
            console.log("Connection closed");

            // Remove all event handlers
            socket.off("connect");
            socket.off("disconnect");
            socket.off("message");

            socket = null;
          });

          socket.on("message", messageHandler);

          let messagesReceived = 0;
          _currentCallback = (): void => {
            // Capture the first 4 messages that are sent by the server when
            // initially connecting
            messagesReceived++;
            if (messagesReceived >= 4) {
              _currentCallback = null;
              resolve();
            }
          };
        });
      });
    };

    // Create a new connection to the Arduino Create Agent if needed
    if (!socket) {
      await connectAgent();
    }

    // Check socket again to see if a connection to the Agent was successfully
    // made
    if (!socket) {
      return null;
    }

    const messages = await new Promise<string[]>((resolve) => {
      if (!socket) return resolve([]);

      // Set a timeout of 30s to resolve an empty list of devices if a response
      // is not received
      const timeoutHandler = setTimeout(() => {
        resolve([]);
      }, RESPONSE_TIMEOUT);

      const messages: string[] = [];
      _currentCallback = (message: string): void => {
        // Skip command acknowledge
        if (message === "list") return;

        // Capture the expected 2 messages containing device list
        messages.push(message);

        if (messages.length >= 2) {
          _currentCallback = null;

          clearTimeout(timeoutHandler);
          resolve(messages);
        }
      };
      socket.emit("command", "list");
    });

    const devices: ArduinoDeviceList = Object.create(null);
    messages.forEach((message) => {
      try {
        const data = JSON.parse(message);
        if (data.Ports) {
          const list = data.Ports as ArduinoDevice[];
          list.forEach((device) => {
            devices[device.Name] = device;
          });
        }
      } catch (err) {
        console.log("Error parsing device list:", err, message);
      }
    });

    return devices;
  };

  // Opens up a serial connection to a specific Arduino device
  const connect = async (
    device: ArduinoDevice,
    baudRate: number
  ): Promise<void> => {
    if (!socket || status === "connected") return;

    let readData = "";
    _currentCallback = (message: string): void => {
      if (message.charAt(2) !== "D" || !onRead) return;

      // Parse message
      try {
        const response = JSON.parse(message);
        const value = response.D as string;

        if (readDelimiter === "") {
          // Call `onRead()` immediately if not delimiter was provided
          onRead(value);
        } else {
          // Split out the new read value based on the delimeter
          const parsedStrings = value.split(readDelimiter);
          if (parsedStrings.length === 1) {
            // Append the new read data if the delimiter was not found
            readData += value;
          } else {
            // Call `onRead()` with the appended data from the first split
            onRead(readData + parsedStrings.shift());

            // Set readData to the last element
            if (parsedStrings.length > 0) {
              readData = parsedStrings.pop() || "";
            }

            // Call `onRead()` callback on remaining string tokens
            parsedStrings.forEach((parsedValue) => {
              onRead(parsedValue);
            });
          }
        }
      } catch (err) {
        console.log("error parsing data", message);
      }
    };

    socket.emit("command", `open ${device.Name} ${baudRate}`);

    setConnectedDevice(device.Name);
  };

  const disconnect = async (): Promise<void> => {
    if (!socket || status === "disconnected") return;

    _currentCallback = null;
    socket.emit("command", `close ${connectedDevice}`);
    setConnectedDevice(null);
  };

  const write = async (output: string): Promise<void> => {
    console.log("Implement writing to arduino", output);
  };

  return {
    status,
    fetchDevices,
    connect,
    disconnect,
    write,
  };
}
