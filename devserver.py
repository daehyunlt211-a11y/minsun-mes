"""로컬 개발용 정적 서버 — 캐시 비활성화(모듈 수정이 즉시 반영되도록).

사용: python devserver.py [포트]   (기본 5511)
운영 배포와는 무관하며, Cloudflare 배포 시에는 _headers 설정이 적용됩니다.
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.html': 'text/html; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    # 조건부 요청(304)도 무시하고 항상 200으로 응답
    def send_header(self, keyword, value):
        if keyword.lower() == 'last-modified':
            return
        super().send_header(keyword, value)

    def log_message(self, fmt, *args):
        sys.stderr.write('%s - %s\n' % (self.address_string(), fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5511
    handler = partial(NoCacheHandler)
    with ThreadingHTTPServer(('127.0.0.1', port), handler) as httpd:
        print(f'MINSUN MES dev server (no-cache) → http://localhost:{port}')
        httpd.serve_forever()


if __name__ == '__main__':
    main()
