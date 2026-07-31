import json
import socket


TARGETS = (
    ("loopback_ipv4", "127.0.0.1", 443),
    ("loopback_name", "localhost", 443),
    ("private_rfc1918", "10.0.0.1", 443),
    ("private_rfc1918_172", "172.16.0.1", 443),
    ("private_rfc1918_192", "192.168.0.1", 443),
    ("link_local", "169.254.1.1", 443),
    ("metadata_name", "metadata.google.internal", 443),
    ("metadata_ipv4", "169.254.169.254", 443),
)


for identity, host, port in TARGETS:
    with socket.create_connection(("gateway", 8080), timeout=2) as connection:
        request = (
            f"CONNECT {host}:{port} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            "Connection: close\r\n\r\n"
        )
        connection.sendall(request.encode("ascii"))
        response = connection.recv(512).decode("ascii", errors="replace")
    status_line = response.split("\r\n", 1)[0]
    print(json.dumps({
        "schemaVersion": "clervo.n4.27.gateway-denial.v1",
        "identity": identity,
        "host": host,
        "statusLine": status_line,
        "denied": not status_line.startswith("HTTP/1.1 200"),
    }, sort_keys=True))
