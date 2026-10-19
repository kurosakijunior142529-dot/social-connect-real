"""Run with python3 tests/chat-gestures.browser.py against the local preview."""
import unittest
from playwright.sync_api import sync_playwright


class ChatGestures(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def setUp(self):
        self.page = self.browser.new_page(viewport={"width": 1280, "height": 1800})
        self.page.goto("http://localhost:8080", wait_until="domcontentloaded")
        self.page.evaluate("""async () => {
          const React = await import('/node_modules/.vite/deps/react.js');
          const {createRoot} = await import('/node_modules/.vite/deps/react-dom_client.js');
          const {SwipeReply} = await import('/src/components/chat/swipe-reply.tsx');
          const host = document.createElement('div');
          host.id = 'gesture-test'; document.body.append(host);
          window.gestureResult = {likes: 0, replies: 0};
          createRoot(host).render(React.createElement(SwipeReply, {
            onDoubleTap: () => window.gestureResult.likes++,
            onReply: () => window.gestureResult.replies++,
          }, React.createElement('div', null,
            React.createElement('button', {id: 'speed-test'}, React.createElement('span', null, '1x')),
            React.createElement('a', {id: 'link-test', href: '#'}, 'Link'),
            React.createElement('span', {id: 'text-test'}, 'Message'))));
        }""")
        self.page.locator('#text-test').wait_for()

    def tearDown(self):
        self.page.close()

    def gesture(self, selector, movement=0, cancel=False):
        self.page.evaluate("""([selector, movement, cancel]) => {
          const target = document.querySelector(selector);
          const fire = (type, x) => target.dispatchEvent(new TouchEvent(type, {
            bubbles: true, touches: type === 'touchend' || type === 'touchcancel' ? [] :
              [new Touch({identifier: 1, target, clientX: x, clientY: 100})],
            changedTouches: [new Touch({identifier: 1, target, clientX: x, clientY: 100})],
          }));
          fire('touchstart', 100);
          if (movement) fire('touchmove', 100 + movement);
          fire(cancel ? 'touchcancel' : 'touchend', 100 + movement);
        }""", [selector, movement, cancel])

    def result(self):
        return self.page.evaluate('window.gestureResult')

    def test_two_speed_control_taps_do_not_like(self):
        self.gesture('#speed-test span')
        self.gesture('#speed-test span')
        self.assertEqual(self.result(), {"likes": 0, "replies": 0})

    def test_two_link_taps_do_not_like(self):
        self.gesture('#link-test')
        self.gesture('#link-test')
        self.assertEqual(self.result()['likes'], 0)

    def test_two_text_taps_like(self):
        self.gesture('#text-test')
        self.gesture('#text-test')
        self.assertEqual(self.result()['likes'], 1)

    def test_swipe_replies_without_like(self):
        self.gesture('#text-test', movement=70)
        self.assertEqual(self.result(), {"likes": 0, "replies": 1})

    def test_cancelled_touch_does_not_like(self):
        self.gesture('#text-test', cancel=True)
        self.gesture('#text-test')
        self.assertEqual(self.result()['likes'], 0)


if __name__ == '__main__':
    unittest.main()