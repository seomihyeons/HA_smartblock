# src/homeassistant/conflict_analyzer/test.py
import sys, json

def main():
    yaml_text = sys.stdin.read()  # 서버가 보내는 body.yaml
    # 무조건 JSON을 stdout으로 출력해서 파이프라인만 검증
    print(json.dumps({
        "ok": True,
        "received_chars": len(yaml_text or ""),
        "head": (yaml_text or "")[:80],
    }, ensure_ascii=False))

if __name__ == "__main__":
    main()
