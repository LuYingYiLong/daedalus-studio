#pragma once
#include <windows.h>
#include <algorithm>
#include <cmath>
#include <deque>
#include <functional>
#include <mutex>
#include <stdexcept>
#include <vector>

struct TouchFrame { POINT point; POINTER_FLAGS flags; unsigned delayMs; };
// 纯手势规划；所有坐标都是屏幕物理像素，不对越界路径做静默裁剪
inline std::vector<TouchFrame> planTouch(POINT start, RECT client, UINT dpi,
                                       bool scroll, bool horizontal, int amount, int count) {
  constexpr auto contact = POINTER_FLAG_INRANGE | POINTER_FLAG_INCONTACT;
  std::vector<TouchFrame> frames;
  if (!scroll) {
    if (count != 1 && count != 2) throw std::runtime_error("computer_invalid_request");
    for (int i = 0; i < count; ++i) {
      frames.push_back({start, POINTER_FLAG_DOWN | contact, i ? std::min(100u, GetDoubleClickTime() / 3) : 0});
      frames.push_back({start, POINTER_FLAG_UPDATE | contact, 25});
      frames.push_back({start, POINTER_FLAG_UP, 10});
    }
    return frames;
  }
  if (!dpi || !amount || std::abs(amount) > 10) throw std::runtime_error("computer_invalid_request");
  const double scale = dpi / 96.0;
  const LONG margin = LONG(std::ceil(16 * scale));
  RECT inner{client.left + margin, client.top + margin, client.right - margin, client.bottom - margin};
  const double span = horizontal ? client.right - client.left : client.bottom - client.top;
  const LONG distance = LONG(std::lround(std::min(std::abs(amount) * 48 * scale, span * .4)));
  POINT end = start;
  // vertical < 0 表示查看下方内容，手指向上；horizontal > 0 查看右侧，手指向左
  if (horizontal) end.x += amount > 0 ? -distance : distance;
  else end.y += amount > 0 ? distance : -distance;
  if (distance < 16 * scale || !PtInRect(&inner, start) || !PtInRect(&inner, end))
    throw std::runtime_error("computer_touch_path_out_of_bounds");
  frames.push_back({start, POINTER_FLAG_DOWN | contact, 0});
  for (int i = 1; i <= 15; ++i)
    frames.push_back({{start.x + LONG(std::lround((end.x-start.x)*i/15.0)),
                      start.y + LONG(std::lround((end.y-start.y)*i/15.0))}, POINTER_FLAG_UPDATE | contact, 16});
  frames.push_back({end, POINTER_FLAG_UP, 10});
  return frames;
}

class TouchInput {
public:
  struct Adapter {
    std::function<HSYNTHETICPOINTERDEVICE()> create = [] { return CreateSyntheticPointerDevice(PT_TOUCH, 1, POINTER_FEEDBACK_NONE); };
    std::function<BOOL(HSYNTHETICPOINTERDEVICE, const POINTER_TYPE_INFO *)> inject = [](auto device, auto value) { return InjectSyntheticPointerInput(device, value, 1); };
    std::function<void(HSYNTHETICPOINTERDEVICE)> destroy = [](auto device) { DestroySyntheticPointerDevice(device); };
  };
  TouchInput() = default;
  explicit TouchInput(Adapter adapter) : adapter(std::move(adapter)) {}
  ~TouchInput() { reset(); }
  void create() {
    reset();
    device = adapter.create();
    if (!device) throw std::runtime_error("computer_touch_unavailable");
  }
  void reset() noexcept {
    if (device && down) {
      auto info = make(last, POINTER_FLAG_UP | POINTER_FLAG_CANCELED);
      adapter.inject(device, &info);
    }
    if (device) adapter.destroy(device);
    device = nullptr; down = false;
    std::lock_guard lock(promotedMutex); expected.clear();
  }
  void send(const TouchFrame &frame) {
    if (!device) throw std::runtime_error("computer_touch_unavailable");
    // 钩子在独立线程同步调用，不能持有它要获取的锁进入注入 API
    if (frame.flags & (POINTER_FLAG_DOWN | POINTER_FLAG_UP)) {
      std::lock_guard lock(promotedMutex);
      const auto now = GetTickCount64();
      while (!expected.empty() && expected.front().expires < now) expected.pop_front();
      expected.push_back({frame.point, WPARAM(frame.flags & POINTER_FLAG_DOWN ? WM_LBUTTONDOWN : WM_LBUTTONUP), now + 500});
    }
    auto info = make(frame.point, frame.flags);
    last = frame.point;
    // 失败时仍尝试取消当前接触；不假设失败等于没有部分派发
    down = true;
    if (!adapter.inject(device, &info)) throw std::runtime_error("computer_action_unknown");
    down = !(frame.flags & POINTER_FLAG_UP);
  }
  bool owns(WPARAM kind, const MSLLHOOKSTRUCT &event) {
    // 标记只证明触摸/注入来源，还必须匹配本接触的派生事件序列；真实 Raw Input 独立优先接管
    if (!(event.flags & LLMHF_INJECTED) || (event.dwExtraInfo & 0xFFFFFF80) != 0xFF515780) return false;
    std::lock_guard lock(promotedMutex);
    const auto now = GetTickCount64();
    while (!expected.empty() && expected.front().expires < now) expected.pop_front();
    if (expected.empty()) return false;
    const auto &next = expected.front();
    if (kind != next.kind || std::abs(event.pt.x-next.point.x)>2 || std::abs(event.pt.y-next.point.y)>2) return false;
    expected.pop_front(); return true;
  }
private:
  Adapter adapter;
  POINTER_TYPE_INFO make(POINT point, POINTER_FLAGS flags) const {
    POINTER_TYPE_INFO value{};
    value.type = PT_TOUCH;
    auto &touch = value.touchInfo;
    touch.pointerInfo.pointerType = PT_TOUCH;
    touch.pointerInfo.pointerId = 1;
    touch.pointerInfo.ptPixelLocation = point;
    touch.pointerInfo.pointerFlags = flags;
    touch.touchMask = TOUCH_MASK_CONTACTAREA | TOUCH_MASK_ORIENTATION | TOUCH_MASK_PRESSURE;
    touch.rcContact = {point.x-2, point.y-2, point.x+2, point.y+2};
    touch.orientation = 90; touch.pressure = 512;
    return value;
  }
  struct Promotion { POINT point; WPARAM kind; ULONGLONG expires; };
  HSYNTHETICPOINTERDEVICE device = nullptr;
  bool down = false;
  POINT last{};
  std::mutex promotedMutex;
  std::deque<Promotion> expected;
};
