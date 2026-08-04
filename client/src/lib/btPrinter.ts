// Bluetooth thermal-receipt printing for the POS.
//
// Uses the Web Bluetooth API (Chrome / Edge on Android tablets, phones and
// desktop) to talk to a BLE thermal receipt printer over ESC/POS. This is an
// on-demand feature: staff tap "Print receipt" on the confirmation screen and,
// the first time, pick their printer from the browser's Bluetooth chooser.
// After that the same printer is reused for the rest of the session.
//
// Notes / limitations:
// - Web Bluetooth requires a secure context (https) and a user gesture (the
//   button click). Our deployed site is https, so this works in production.
// - It is NOT supported in iOS Safari. We surface a clear message in that case.
// - Different cheap printers expose different GATT services, so we list the
//   common ones and then auto-detect the first writable characteristic.

// Minimal Web Bluetooth typings so we don't depend on @types/web-bluetooth
// or touch tsconfig. We only declare what we actually use.
interface BTCharacteristic {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValueWithoutResponse?: (value: BufferSource) => Promise<void>;
  writeValueWithResponse?: (value: BufferSource) => Promise<void>;
  writeValue?: (value: BufferSource) => Promise<void>;
}
interface BTService {
  uuid: string;
  getCharacteristics: () => Promise<BTCharacteristic[]>;
}
interface BTServer {
  connected: boolean;
  connect: () => Promise<BTServer>;
  getPrimaryServices: () => Promise<BTService[]>;
}
interface BTDevice {
  name?: string | null;
  gatt?: BTServer;
}
interface BTRemote {
  requestDevice: (opts: unknown) => Promise<BTDevice>;
  getDevices?: () => Promise<BTDevice[]>;
}

// Service UUIDs used by the most common BLE receipt printers. Listed as
// optionalServices so the browser grants access to them after pairing.
const KNOWN_PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb", // generic 58mm printers
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb", // HM-10 style serial
  "0000ff80-0000-1000-8000-00805f9b34fb",
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // Microchip / ISSC
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
];

function getBluetooth(): BTRemote | null {
  if (typeof navigator === "undefined") return null;
  const bt = (navigator as unknown as { bluetooth?: BTRemote }).bluetooth;
  return bt ?? null;
}

export function isBluetoothPrintingSupported(): boolean {
  // Web Bluetooth needs a secure context (https / localhost) AND the API
  // surface present. Checking only navigator.bluetooth would pass in blocked
  // or insecure contexts and then fail later with a misleading message.
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return false;
  }
  const bt = getBluetooth();
  return !!bt && typeof bt.requestDevice === "function";
}

// ---- ESC/POS receipt builder ----------------------------------------------

const ESC = 0x1b;
const GS = 0x1d;
const LINE_WIDTH = 48; // 80mm printers print 48 characters per line.

class EscPos {
  private chunks: number[] = [];
  private enc = new TextEncoder();

  raw(bytes: number[]): this {
    this.chunks.push(...bytes);
    return this;
  }

  // ASCII-safe text. Non-ASCII characters are stripped so a printer that
  // doesn't share our code page never prints garbage.
  text(s: string): this {
    const clean = s.replace(/[^\x20-\x7e]/g, "");
    this.chunks.push(...Array.from(this.enc.encode(clean)));
    return this;
  }

  line(s = ""): this {
    return this.text(s).raw([0x0a]);
  }

  init(): this {
    return this.raw([ESC, 0x40]); // ESC @  — reset
  }
  align(a: "left" | "center" | "right"): this {
    const n = a === "center" ? 1 : a === "right" ? 2 : 0;
    return this.raw([ESC, 0x61, n]);
  }
  bold(on: boolean): this {
    return this.raw([ESC, 0x45, on ? 1 : 0]);
  }
  // GS ! n — bit 0x10 = double height, 0x20 = double width.
  size(big: boolean): this {
    return this.raw([GS, 0x21, big ? 0x11 : 0x00]);
  }
  rule(): this {
    return this.line("-".repeat(LINE_WIDTH));
  }
  // A two-column row: label on the left, value right-aligned.
  row(left: string, right: string): this {
    const space = Math.max(1, LINE_WIDTH - left.length - right.length);
    if (left.length + right.length + 1 > LINE_WIDTH) {
      // Too long for one line — put the value on its own right-aligned line.
      this.line(left);
      return this.line(" ".repeat(Math.max(0, LINE_WIDTH - right.length)) + right);
    }
    return this.line(left + " ".repeat(space) + right);
  }
  feedAndCut(): this {
    return this.raw([0x0a, 0x0a, 0x0a, 0x0a]).raw([GS, 0x56, 0x42, 0x00]); // partial cut
  }

  build(): Uint8Array {
    return new Uint8Array(this.chunks);
  }
}

// ---- Receipt content -------------------------------------------------------

export interface ReceiptLine {
  name: string;
  price: string; // already formatted, e.g. "B$8.00"
}

export interface ReceiptData {
  branchName: string;
  ticketCode: string;
  plate: string;
  dateTime: string; // e.g. "04/06/2026 01:08"
  items: ReceiptLine[];
  subtotal?: string; // formatted
  total: string; // formatted
  paymentLabel: string;
  paidAmount?: string; // formatted — cash/amount tendered
  change?: string; // formatted — change given back
  cashierName?: string;
}

function buildReceiptBytes(r: ReceiptData): Uint8Array {
  const p = new EscPos();
  p.init().align("center").bold(true).size(true).line("CUCI XPRESS").size(false);
  p.line(`${r.branchName} Branch`).bold(false).line("Drive-thru car wash").raw([0x0a]);

  p.align("left").rule();
  p.row("Ticket", r.ticketCode);
  p.row("Plate", r.plate);
  p.row("Date", r.dateTime);
  if (r.cashierName) p.row("Cashier", r.cashierName);
  p.rule();

  for (const it of r.items) p.row(it.name, it.price);
  p.rule();
  if (r.subtotal) p.row("Subtotal", r.subtotal);
  p.bold(true).size(true).row("TOTAL", r.total).size(false).bold(false);
  p.row("Paid via", r.paymentLabel);
  if (r.paidAmount) p.row("Paid", r.paidAmount);
  if (r.change) p.row("Change", r.change);
  p.rule();

  p.align("center").raw([0x0a]);
  p.line("Thank you for choosing");
  p.bold(true).line("Cuci Xpress").bold(false);
  p.raw([0x0a]);
  p.line("Collect digital stamps at");
  p.bold(true).line("cucixpress.com").bold(false);
  p.line("Every B$12 wash = 1 stamp");
  p.line("4 stamps = 1 FREE wash");
  p.line("Show your QR code to redeem");
  p.feedAndCut();
  return p.build();
}

// ---- Connection + write ----------------------------------------------------

// Cached for the lifetime of the page so repeat prints don't re-prompt.
let cachedDevice: BTDevice | null = null;
let cachedChar: BTCharacteristic | null = null;

async function findWritableCharacteristic(server: BTServer): Promise<BTCharacteristic> {
  const services = await server.getPrimaryServices();
  // Prefer services we recognise as printers (deterministic priority order),
  // then fall back to any remaining service. This avoids picking an unrelated
  // writable endpoint on devices that expose several services.
  const rank = (uuid: string): number => {
    const i = KNOWN_PRINTER_SERVICES.indexOf(uuid.toLowerCase());
    return i === -1 ? KNOWN_PRINTER_SERVICES.length : i;
  };
  const ordered = [...services].sort((a, b) => rank(a.uuid) - rank(b.uuid));

  for (const svc of ordered) {
    let chars: BTCharacteristic[];
    try {
      chars = await svc.getCharacteristics();
    } catch {
      continue;
    }
    // Within a service, prefer writeWithoutResponse (typical for printers).
    const sorted = [...chars].sort(
      (a, b) =>
        Number(b.properties.writeWithoutResponse) -
        Number(a.properties.writeWithoutResponse),
    );
    for (const c of sorted) {
      if (c.properties.writeWithoutResponse || c.properties.write) return c;
    }
  }
  throw new Error("no_writable_characteristic");
}

async function getDevice(bt: BTRemote): Promise<BTDevice> {
  if (cachedDevice) return cachedDevice;
  // Reuse a previously paired device if the browser remembers it.
  if (bt.getDevices) {
    try {
      const known = await bt.getDevices();
      if (known.length === 1) {
        cachedDevice = known[0];
        return cachedDevice;
      }
    } catch {
      // getDevices may be unavailable / blocked — fall through to chooser.
    }
  }
  const device = await bt.requestDevice({
    acceptAllDevices: true,
    optionalServices: KNOWN_PRINTER_SERVICES,
  });
  cachedDevice = device;
  return device;
}

async function getCharacteristic(): Promise<BTCharacteristic> {
  const bt = getBluetooth();
  if (!bt) throw new Error("unsupported");

  const device = await getDevice(bt);
  if (!device.gatt) throw new Error("no_gatt");

  const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
  if (cachedChar && device.gatt.connected) return cachedChar;

  cachedChar = await findWritableCharacteristic(server);
  return cachedChar;
}

async function writeBytes(char: BTCharacteristic, data: Uint8Array): Promise<void> {
  // BLE caps each write; chunk to stay within a conservative MTU and pace the
  // writes so the printer buffer keeps up.
  const CHUNK = 100;
  const preferNoResponse =
    char.properties.writeWithoutResponse && !!char.writeValueWithoutResponse;

  for (let i = 0; i < data.length; i += CHUNK) {
    const slice = data.slice(i, i + CHUNK);
    if (preferNoResponse) {
      await char.writeValueWithoutResponse!(slice);
    } else if (char.writeValueWithResponse) {
      await char.writeValueWithResponse(slice);
    } else if (char.writeValue) {
      await char.writeValue(slice);
    } else {
      throw new Error("no_write_method");
    }
    if (i + CHUNK < data.length) await new Promise((res) => setTimeout(res, 18));
  }
}

export class BluetoothPrintError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "BluetoothPrintError";
  }
}

function describe(e: unknown): BluetoothPrintError {
  const msg = e instanceof Error ? e.message : String(e);
  // User dismissed the device chooser.
  if (msg.includes("cancel") || msg.includes("User cancelled")) {
    return new BluetoothPrintError("cancelled", "Printer selection was cancelled.");
  }
  if (msg === "unsupported") {
    return new BluetoothPrintError(
      "unsupported",
      "Bluetooth printing needs Chrome or Edge on Android or a computer, over a secure (https) connection. It isn't available on iPhone/iPad.",
    );
  }
  if (msg === "no_writable_characteristic" || msg === "no_write_method") {
    return new BluetoothPrintError(
      "incompatible",
      "Connected, but this device doesn't look like a supported receipt printer.",
    );
  }
  return new BluetoothPrintError(
    "failed",
    "Couldn't reach the printer. Make sure it's on, charged, and in range, then try again.",
  );
}

// Drop the cached connection (e.g. after a failure) so the next attempt
// reconnects cleanly or re-prompts for a device.
export function resetPrinter(): void {
  cachedDevice = null;
  cachedChar = null;
}

export async function printReceipt(data: ReceiptData): Promise<void> {
  if (!isBluetoothPrintingSupported()) throw describe(new Error("unsupported"));
  try {
    const char = await getCharacteristic();
    await writeBytes(char, buildReceiptBytes(data));
  } catch (e) {
    // A stale connection is the most common failure — clear the writable
    // characteristic so a retry re-resolves it.
    cachedChar = null;
    const err = describe(e);
    if (err.code === "failed" || err.code === "incompatible") resetPrinter();
    throw err;
  }
}
