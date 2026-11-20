"""Helpers shared by the test modules."""
import io
import socketserver
import threading

from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image


def school_id_png(name="school-id.png"):
    buffer = io.BytesIO()
    Image.new("RGB", (400, 260), (30, 90, 160)).save(buffer, "PNG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


def with_id(payload):
    return {"year_level": "1ST", "school_id": school_id_png(), **payload}


class _SmtpHandler(socketserver.StreamRequestHandler):
    def reply(self, line):
        self.wfile.write(line.encode() + b"\r\n")

    def handle(self):
        self.reply("220 test SMTP server")
        current = {"to": []}
        while line := self.rfile.readline().decode("utf8", "replace").strip():
            verb = line.split(" ")[0].split(":")[0].upper()
            if verb in ("EHLO", "HELO"):
                self.reply("250 test")
            elif verb == "RCPT":
                current["to"].append(line.split("<")[1].split(">")[0])
                self.reply("250 OK")
            elif verb == "DATA":
                self.reply("354 send data")
                body = []
                while (row := self.rfile.readline().decode("utf8", "replace").rstrip("\r\n")) != ".":
                    body.append(row)
                self.server.messages.append({**current, "data": "\n".join(body)})
                current = {"to": []}
                self.reply("250 accepted")
            elif verb == "QUIT":
                self.reply("221 bye")
                return
            else:
                self.reply("250 OK")


class SmtpSink(socketserver.ThreadingTCPServer):
    """A local SMTP server that records messages and delivers nothing."""

    allow_reuse_address = True
    daemon_threads = True

    def __init__(self):
        super().__init__(("127.0.0.1", 0), _SmtpHandler)
        self.messages = []
        self.port = self.server_address[1]

    def __enter__(self):
        threading.Thread(target=self.serve_forever, daemon=True).start()
        return self

    def __exit__(self, *exc):
        self.shutdown()
        self.server_close()
