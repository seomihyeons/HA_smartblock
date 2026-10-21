"""Read-only smoke check, run inside a container with --network none.

Checks worker/proxy wiring only. No model request, service execution or HA
connection is performed. The caller is responsible for network isolation.
"""
import json
import time
import urllib.request


def main():
    last_error = None
    for _ in range(40):
        try:
            with urllib.request.urlopen("http://127.0.0.1:8099/api/llm/providers", timeout=1) as response:
                payload = json.load(response)
            assert any(item["id"] == "ollama" for item in payload["providers"])
            with urllib.request.urlopen("http://127.0.0.1:8099/", timeout=1) as response:
                assert "btnAiAssistant" in response.read().decode("utf-8")
            print("Add-on HTML, Node proxy and Python provider catalog are connected; no model or HA call made.")
            return
        except Exception as error:
            last_error = error
            time.sleep(0.2)
    raise RuntimeError("Container startup check failed") from last_error


if __name__ == "__main__":
    main()
