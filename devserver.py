"""开发用静态服务器。

和 `python -m http.server` 唯一的区别：强制 no-store。

为什么需要它：默认的 http.server 会发 Last-Modified，浏览器据此做启发式缓存，
改完 JS 刷新页面却还在跑旧代码 —— 这个坑会浪费掉大量调试时间，
而且症状极具误导性（报错行号对得上，内容却是旧的）。

用法：python devserver.py [port]
"""

import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # 静音掉每个请求一行的噪声，只让报错冒出来
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f"猫猫声音泡泡馆 → http://127.0.0.1:{port}/  (no-store)")
    ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler).serve_forever()
