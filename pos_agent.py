#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=========================================================================
🏪 KARI ARNETT POS - SHOP PRINT AGENT (PYTHON HIGH-SPEED RELAY)
=========================================================================
ដំណើរការលើកុំព្យូទ័រ/ឡេបថបក្នុងហាង (Windows / Mac / Linux)
មិនបាច់ដំឡើង library អ្វីទាំងអស់ (Zero Dependencies - ប្រើ socket & urllib សុទ្ធ)!

របៀបប្រើ (How to run):
    python pos_agent.py
ឬបញ្ជាក់ IP ម៉ាស៊ីនព្រីន (ឧទាហរណ៍ 192.168.0.200)៖
    python pos_agent.py 192.168.0.200
"""

import sys
import os
import socket
import base64
import json
import time
import threading
import urllib.request
import urllib.error
import http.server
import socketserver

# ----------------- CONFIGURATION -----------------
DEFAULT_SERVER_URL = "http://185.2.103.93:3000"
DEFAULT_PRINTER_TARGET = "USB"
DEFAULT_PRINTER_PORT = 9100
CHANNEL_ID = "kari_pos_bfc84ed2"
HB_TOPIC = f"{CHANNEL_ID}_hb"
JOBS_TOPIC = f"{CHANNEL_ID}_jobs"
AGENT_NAME = "Store-PC"

# Flexible argument parsing:
# python pos_agent.py [printer_target_or_url] [server_url_or_target]
arg1 = sys.argv[1] if len(sys.argv) > 1 else os.getenv("PRINTER_TARGET", DEFAULT_PRINTER_TARGET)
arg2 = sys.argv[2] if len(sys.argv) > 2 else os.getenv("SERVER_URL", DEFAULT_SERVER_URL)

if arg1.startswith("http://") or arg1.startswith("https://"):
    SERVER_URL = arg1.rstrip("/")
    TARGET_ARG = arg2
elif arg2.startswith("http://") or arg2.startswith("https://"):
    TARGET_ARG = arg1
    SERVER_URL = arg2.rstrip("/")
else:
    TARGET_ARG = arg1
    SERVER_URL = arg2.rstrip("/")

if not SERVER_URL:
    SERVER_URL = DEFAULT_SERVER_URL

# Windows Spooler Helper for USB Thermal Printers
IS_WINDOWS = sys.platform.startswith("win")
import subprocess

def list_windows_printers():
    """List all installed Windows printers using winspool or powershell."""
    printers = []
    if IS_WINDOWS:
        try:
            out = subprocess.check_output(
                ["powershell", "-NoProfile", "-Command", "Get-Printer | Select-Object -ExpandProperty Name"],
                stderr=subprocess.DEVNULL,
                timeout=4
            ).decode("utf-8", errors="ignore")
            printers = [p.strip() for p in out.strip().splitlines() if p.strip()]
        except Exception:
            try:
                import win32print
                for p in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS):
                    printers.append(p[2])
            except Exception:
                pass
    return printers


def find_best_usb_printer():
    """Auto-detect thermal / receipt / POS USB printer on Windows."""
    printers = list_windows_printers()
    if not printers:
        return None
    # Look for common POS thermal printer keywords
    keywords = ["pos", "xp", "80", "58", "receipt", "thermal", "zj", "xprinter", "epson", "citizen", "bixolon", "gprinter", "printer"]
    for kw in keywords:
        for p in printers:
            if kw in p.lower():
                return p
    return printers[0]  # default fallback


def print_to_windows_usb(printer_name, raw_bytes):
    """Send RAW ESC/POS bytes directly to Windows USB printer via win32print or winspool ctypes."""
    if not IS_WINDOWS:
        try:
            p = subprocess.Popen(["lp", "-d", printer_name, "-o", "raw"], stdin=subprocess.PIPE)
            p.communicate(input=raw_bytes)
            return p.returncode == 0
        except Exception as e:
            print(f"❌ [USB PRINT ERROR]: {e}")
            return False

    # 1. Try win32print if available
    try:
        import win32print
        hPrinter = win32print.OpenPrinter(printer_name)
        try:
            win32print.StartDocPrinter(hPrinter, 1, ("POS Invoice", None, "RAW"))
            try:
                win32print.StartPagePrinter(hPrinter)
                win32print.WritePrinter(hPrinter, raw_bytes)
                win32print.EndPagePrinter(hPrinter)
                print(f"🖨️ [USB SUCCESS] បានបញ្ជូន {len(raw_bytes)} bytes ទៅកាន់ USB Printer '{printer_name}' រួចរាល់!")
                return True
            finally:
                win32print.EndDocPrinter(hPrinter)
        finally:
            win32print.ClosePrinter(hPrinter)
    except ImportError:
        pass
    except Exception as e:
        print(f"⚠️ win32print notice: {e}, falling back to ctypes...")

    # 2. Standard ctypes Win32 Spooler API (Zero-install)
    try:
        import ctypes
        from ctypes import wintypes

        class DOC_INFO_1(ctypes.Structure):
            _fields_ = [
                ("pDocName", wintypes.LPWSTR),
                ("pOutputFile", wintypes.LPWSTR),
                ("pDatatype", wintypes.LPWSTR),
            ]

        winspool = ctypes.WinDLL("winspool.drv")

        winspool.OpenPrinterW.argtypes = [wintypes.LPWSTR, ctypes.POINTER(wintypes.HANDLE), ctypes.c_void_p]
        winspool.OpenPrinterW.restype = wintypes.BOOL

        winspool.StartDocPrinterW.argtypes = [wintypes.HANDLE, wintypes.DWORD, ctypes.c_void_p]
        winspool.StartDocPrinterW.restype = wintypes.DWORD

        winspool.StartPagePrinter.argtypes = [wintypes.HANDLE]
        winspool.StartPagePrinter.restype = wintypes.BOOL

        winspool.WritePrinter.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD)]
        winspool.WritePrinter.restype = wintypes.BOOL

        winspool.EndPagePrinter.argtypes = [wintypes.HANDLE]
        winspool.EndPagePrinter.restype = wintypes.BOOL

        winspool.EndDocPrinter.argtypes = [wintypes.HANDLE]
        winspool.EndDocPrinter.restype = wintypes.BOOL

        winspool.ClosePrinter.argtypes = [wintypes.HANDLE]
        winspool.ClosePrinter.restype = wintypes.BOOL

        hPrinter = wintypes.HANDLE()
        if not winspool.OpenPrinterW(printer_name, ctypes.byref(hPrinter), None):
            print(f"❌ [USB ERROR] មិនអាចបើក Printer '{printer_name}' បានទេ។ សូមពិនិត្យឈ្មោះក្នុង Windows Settings!")
            return False

        try:
            doc_info = DOC_INFO_1("POS Invoice", None, "RAW")
            job_id = winspool.StartDocPrinterW(hPrinter, 1, ctypes.byref(doc_info))
            if job_id == 0:
                print(f"❌ [USB ERROR] StartDocPrinterW failed on '{printer_name}'")
                return False

            try:
                winspool.StartPagePrinter(hPrinter)
                written = wintypes.DWORD(0)
                raw_buf = ctypes.create_string_buffer(raw_bytes, len(raw_bytes))
                success = winspool.WritePrinter(
                    hPrinter,
                    raw_buf,
                    len(raw_bytes),
                    ctypes.byref(written)
                )
                winspool.EndPagePrinter(hPrinter)
                if success:
                    print(f"🖨️ [USB SUCCESS] បានបញ្ជូន {written.value} bytes ទៅកាន់ USB Printer '{printer_name}' រួចរាល់!")
                    return True
                else:
                    print(f"❌ [USB ERROR] WritePrinter failed on '{printer_name}'")
                    return False
            finally:
                winspool.EndDocPrinter(hPrinter)
        finally:
            winspool.ClosePrinter(hPrinter)

    except Exception as e:
        print(f"❌ [USB EXCEPTION]: {e}")
        return False


# Determine operating mode: USB or NETWORK IP
IS_USB_MODE = False
USB_PRINTER_NAME = None
PRINTER_IP = DEFAULT_PRINTER_TARGET
PRINTER_PORT = DEFAULT_PRINTER_PORT

if TARGET_ARG.lower().startswith("usb") or (not any(char.isdigit() for char in TARGET_ARG) and "." not in TARGET_ARG):
    IS_USB_MODE = True
    if TARGET_ARG.lower() == "usb":
        USB_PRINTER_NAME = find_best_usb_printer() or "POS-80"
    else:
        USB_PRINTER_NAME = TARGET_ARG
else:
    # IP Mode (e.g. 192.168.0.200 or 192.168.0.200:9100)
    if ":" in TARGET_ARG:
        parts = TARGET_ARG.split(":")
        PRINTER_IP = parts[0]
        PRINTER_PORT = int(parts[1])
    else:
        PRINTER_IP = TARGET_ARG
        PRINTER_PORT = int(os.getenv("PRINTER_PORT", DEFAULT_PRINTER_PORT))


def get_local_ip():
    """Detect LAN IP of this PC so phones on shop Wi-Fi can connect directly with zero rate limits."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip


def find_available_port(preferred=8088):
    """Find a free TCP port to listen on."""
    for p in [preferred, 8080, 8888, 9101, 8081]:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind(('0.0.0.0', p))
            s.close()
            return p
        except Exception:
            pass
    return preferred


LOCAL_IP = get_local_ip()
LOCAL_PORT = int(os.getenv("LOCAL_PORT", find_available_port(8088)))
LOCAL_URL = f"http://{LOCAL_IP}:{LOCAL_PORT}"

TARGET_DISPLAY = f"USB: {USB_PRINTER_NAME}" if IS_USB_MODE else f"{PRINTER_IP}:{PRINTER_PORT}"

print("=" * 65)
print("🏪 KARI ARNETT POS - SHOP PRINT AGENT (HYBRID WI-FI + CLOUD + USB)")
print("=" * 65)
if IS_USB_MODE:
    print(f"🔌 ម៉ាស៊ីនព្រីន (Target Printer)  : USB ➡️  '{USB_PRINTER_NAME}'")
else:
    print(f"📡 ម៉ាស៊ីនព្រីន (Target Printer)  : Network IP ➡️  {PRINTER_IP}:{PRINTER_PORT}")
print(f"🏠 បណ្ដាញ Wi-Fi ហាង (Local Direct): {LOCAL_URL}")
print(f"   (គ្មានដែនកំណត់ Rate Limit សម្រាប់បុគ្គលិក ១០នាក់+ ក្នុងហាង)")
print(f"☁️ Cloud Relay Channel         : {CHANNEL_ID}")
print("-" * 65)


import time

recent_print_jobs = {}

class LocalPrintHandler(http.server.BaseHTTPRequestHandler):
    """Direct HTTP Server for instant Wi-Fi printing from staff phones without cloud relay."""
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        res = {
            "status": "online",
            "agent_name": AGENT_NAME,
            "printer": TARGET_DISPLAY,
            "local_url": LOCAL_URL
        }
        self.wfile.write(json.dumps(res).encode("utf-8"))

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length)
        
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(b'{"success":true}')

        try:
            payload = json.loads(post_data.decode("utf-8"))
            escpos_base64 = payload.get("escpos_base64")
            basket_no = str(payload.get("basket_no", ""))
            cust = payload.get("customer_name", "")
            
            # Deduplication check (prevent printing same basket within 15 seconds)
            now = time.time()
            if basket_no and basket_no in recent_print_jobs:
                if now - recent_print_jobs[basket_no] < 15:
                    print(f"⏩ [DUPLICATE BLOCKED] Basket #{basket_no} ត្រូវបានបដិសេធ (ព្រីនរួចរាល់ក្នុងរយៈពេល ១៥វិនាទីមុន)")
                    return
            if basket_no:
                recent_print_jobs[basket_no] = now

            print(f"📥 [WI-FI DIRECT JOB] Basket #{basket_no} - {cust} (ល្បឿនលឿនក្នុងហាង)")
            if escpos_base64:
                raw_bytes = base64.b64decode(escpos_base64)
                print_raw_escpos(raw_bytes)
        except Exception as e:
            print(f"❌ Local job error: {e}")

    def log_message(self, format, *args):
        pass


def start_local_server():
    """Start embedded local HTTP server for zero-latency Wi-Fi printing."""
    try:
        class ReusableTCPServer(socketserver.TCPServer):
            allow_reuse_address = True
        httpd = ReusableTCPServer(("0.0.0.0", LOCAL_PORT), LocalPrintHandler)
        httpd.serve_forever()
    except Exception as e:
        print(f"⚠️ Local server notice: {e}")


def print_raw_escpos(binary_data):
    """Send raw ESC/POS bytes to either USB printer or TCP network printer."""
    if IS_USB_MODE:
        target_name = USB_PRINTER_NAME or "POS-80"
        print(f"🔌 [USB SENDING] Sending {len(binary_data)} bytes to USB Printer '{target_name}'...")
        res = print_to_windows_usb(target_name, binary_data)
        if res:
            print(f"✂️ [SUCCESS] ព្រីនចេញ និងកាត់ក្រដាសស្វ័យប្រវត្តិរួចរាល់ (USB)!\n")
        return res

    # TCP Socket network mode
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5.0)
    try:
        sock.connect((PRINTER_IP, PRINTER_PORT))
        print(f"🖨️ [SOCKET CONNECTED] Sending {len(binary_data)} bytes to {PRINTER_IP}:{PRINTER_PORT}...")
        sock.sendall(binary_data)
        time.sleep(0.15)
        print(f"✂️ [SUCCESS] ព្រីនចេញ និងកាត់ក្រដាសស្វ័យប្រវត្តិរួចរាល់ (Network LAN)!\n")
        return True
    except Exception as e:
        print(f"❌ [PRINTER ERROR]: មិនអាចភ្ជាប់ទៅកាន់ {PRINTER_IP}:{PRINTER_PORT} បានទេ ៖ {e}")
        print(f"   💡 បើប្រើខ្សែ USB សូមដំណើរការ ៖ python pos_agent.py usb")
        return False
    finally:
        sock.close()


def send_heartbeat_once():
    """Send heartbeat to both App Server API and ntfy.sh relay."""
    headers = {
        "Title": "heartbeat",
        "Tags": "heartpulse",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    payload = json.dumps({
        "agent_name": AGENT_NAME,
        "printer_target": TARGET_DISPLAY,
        "local_url": LOCAL_URL,
        "timestamp": int(time.time()),
        "status": "online"
    }).encode("utf-8")

    # 1. Send to Dedicated App Server
    if SERVER_URL:
        try:
            req_app = urllib.request.Request(
                f"{SERVER_URL}/api/print_agent/heartbeat",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req_app, timeout=5) as resp:
                pass
        except Exception:
            pass

    # 2. Send to Public Relay
    try:
        req = urllib.request.Request(f"https://ntfy.sh/{HB_TOPIC}", data=payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=8) as resp:
            return resp.status == 200
    except Exception:
        return True


def app_server_poll_loop():
    """Poll the dedicated App Server /api/print_agent/poll continuously (Zero Rate Limit)."""
    if not SERVER_URL:
        return
    
    print(f"🚀 [SERVER SYNC] ភ្ជាប់ទៅកាន់ App Server ៖ {SERVER_URL}")
    while True:
        try:
            url = f"{SERVER_URL}/api/print_agent/poll"
            req = urllib.request.Request(url, headers={"User-Agent": "POS-Agent-Python/1.0"})
            with urllib.request.urlopen(req, timeout=35) as resp:
                if resp.status == 200:
                    raw_text = resp.read().decode("utf-8")
                    data = json.loads(raw_text)
                    jobs = data.get("jobs", [])
                    for job in jobs:
                        job_id = job.get("id")
                        basket = job.get("basket_no", "")
                        cust = job.get("customer_name", "")
                        b64 = job.get("escpos_base64", "")
                        print(f"\n⚡ [DIRECT APP JOB] Basket #{basket} - {cust} (ពីទូរស័ព្ទដៃ)")
                        if b64:
                            raw_bytes = base64.b64decode(b64)
                            success = print_raw_escpos(raw_bytes)
                            # Ack
                            try:
                                ack_payload = json.dumps({"job_id": job_id, "status": "PRINTED" if success else "FAILED"}).encode("utf-8")
                                req_ack = urllib.request.Request(f"{SERVER_URL}/api/print_agent/ack", data=ack_payload, headers={"Content-Type": "application/json"}, method="POST")
                                with urllib.request.urlopen(req_ack, timeout=5):
                                    pass
                            except Exception:
                                pass
        except urllib.error.HTTPError as e:
            if e.code != 504 and e.code != 502:
                print(f"⚠️ Server poll HTTP error {e.code}: {e.reason}")
            time.sleep(2)
        except socket.timeout:
            # Normal long-poll timeout, repeat immediately
            continue
        except Exception as e:
            time.sleep(2)


def heartbeat_loop():
    """Send heartbeat every 15 seconds so the mobile phone knows the agent is online."""
    first = True
    last_logged = 0
    backoff = 15
    while True:
        try:
            send_heartbeat_once()
            now = time.time()
            now_str = time.strftime("%H:%M:%S")
            if first:
                print(f"💓 [HEARTBEAT OK] ភ្ជាប់ទៅកាន់ Cloud Server ជោគជ័យ ({now_str}) ➡️ ទូរស័ព្ទដៃនឹងបង្ហាញថា [ONLINE]!")
                first = False
                last_logged = now
                backoff = 15
            elif now - last_logged >= 60:
                print(f"💓 [AGENT ACTIVE] {now_str} — កំពុងរង់ចាំការងារព្រីន...")
                last_logged = now
            time.sleep(backoff)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(30)
            else:
                time.sleep(15)
        except Exception:
            time.sleep(15)


def download_attachment_with_retry(file_url, max_retries=5):
    """Download attachment file with exponential backoff on HTTP 429 rate limits."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*"
    }
    backoff = 2
    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(file_url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 429:
                retry_after = e.headers.get("Retry-After")
                wait_time = int(retry_after) if (retry_after and retry_after.isdigit()) else backoff
                print(f"⏳ [429 RATE LIMIT] ntfy.sh server busy (attempt {attempt}/{max_retries}). Waiting {wait_time}s...")
                time.sleep(wait_time)
                backoff = min(backoff * 2, 16)
            else:
                print(f"❌ HTTP Error {e.code}: {e.reason}")
                break
        except Exception as e:
            print(f"⚠️ Download attempt {attempt} failed: {e}")
            time.sleep(1.5)
    return None


def process_message(data):
    try:
        title = data.get("title") or "Print Job"
        msg_text = data.get("message") or ""
        attachment = data.get("attachment")

        print(f"\n📥 [NEW JOB RECEIVED] {title}")

        binary_escpos = None

        # 1. Check if sent as attachment file
        if attachment and attachment.get("url"):
            file_url = attachment["url"]
            print(f"⬇️ Downloading print data from {file_url}...")
            downloaded = download_attachment_with_retry(file_url)
            if downloaded:
                # The attachment may be JSON containing escpos_base64 or raw ESC/POS binary
                try:
                    parsed_attach = json.loads(downloaded.decode("utf-8"))
                    if isinstance(parsed_attach, dict) and parsed_attach.get("escpos_base64"):
                        binary_escpos = base64.b64decode(parsed_attach["escpos_base64"])
                    else:
                        binary_escpos = downloaded
                except Exception:
                    binary_escpos = downloaded

        # 2. Check if sent as base64 in message or body
        if not binary_escpos and msg_text:
            try:
                # Could be JSON
                parsed = json.loads(msg_text)
                if isinstance(parsed, dict) and parsed.get("escpos_base64"):
                    binary_escpos = base64.b64decode(parsed["escpos_base64"])
            except Exception:
                # Try raw base64 decode
                try:
                    binary_escpos = base64.b64decode(msg_text)
                except Exception:
                    binary_escpos = msg_text.encode("utf-8")

        if binary_escpos and len(binary_escpos) > 0:
            print_raw_escpos(binary_escpos)
        else:
            print("⚠️ [WARNING] No valid print payload found in job.")

    except Exception as e:
        print(f"❌ Error processing job: {e}")


def main():
    if "--test" in sys.argv or "-t" in sys.argv:
        print(f"🧪 [SELF-TEST] កំពុងតេស្តព្រីនសន្លឹកសាកល្បងទៅកាន់ '{TARGET_DISPLAY}'...")
        test_data = (
            b"\x1b\x40"  # Initialize
            b"\x1b\x61\x01"  # Center
            b"\x1b\x21\x30\nKARI ARNETT POS\n\x1b\x21\x00"
            b"--------------------------------\n"
            b"USB PRINTER TEST OK!\n"
            b"XP-80C READY TO PRINT\n"
            b"--------------------------------\n\n\n\n"
            b"\x1d\x56\x41\x10"  # Cut paper
        )
        print_raw_escpos(test_data)
        return

    print("🚀 កំពុងដំណើរការ Local Wi-Fi Server & Cloud Relay...")
    
    # Start direct App Server Polling thread (Zero rate limits, dedicated to your store)
    t_server = threading.Thread(target=app_server_poll_loop, daemon=True)
    t_server.start()

    # Start local HTTP server thread in background (for 10+ staff phones on Wi-Fi)
    t_local = threading.Thread(target=start_local_server, daemon=True)
    t_local.start()

    # Start heartbeat thread in background
    t = threading.Thread(target=heartbeat_loop, daemon=True)
    t.start()

    print(f"🟢 [ONLINE] Print Agent បានភ្ជាប់ជោគជ័យ! រង់ចាំទទួលការបញ្ជាព្រីនពីទូរស័ព្ទដៃ...\n")

    # Continuous stream listener
    stream_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    while True:
        try:
            stream_url = f"https://ntfy.sh/{JOBS_TOPIC}/json"
            req = urllib.request.Request(stream_url, headers=stream_headers)
            with urllib.request.urlopen(req, timeout=60) as resp:
                for line in resp:
                    raw = line.decode("utf-8").strip()
                    if not raw:
                        continue
                    try:
                        event_data = json.loads(raw)
                        if event_data.get("event") == "message":
                            process_message(event_data)
                    except json.JSONDecodeError:
                        continue
        except KeyboardInterrupt:
            print("\n🛑 Agent stopped by user.")
            sys.exit(0)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                print("⏳ [429 RATE LIMIT] Stream កំពុងរវល់។ រង់ចាំ 20s មុននឹង Reconnect...")
                time.sleep(20)
            else:
                print(f"⚠️ Stream HTTP error {e.code}: {e.reason}. Reconnecting in 3s...")
                time.sleep(3)
        except Exception as e:
            # Reconnect after brief pause
            time.sleep(3)


if __name__ == "__main__":
    main()
