/// <reference types="next" />
/// <reference types="next/types/global" />

// Close function is missing from @types/dom-serial
interface SerialPort {
  close(): Promise<void>;
}
