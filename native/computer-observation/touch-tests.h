#pragma once
#include "touch-input.h"
inline void testTouchPlans() {
  auto check = [](bool ok) { if (!ok) throw std::runtime_error("computer_touch_fixture_failed"); };
  for (UINT dpi : {96u, 144u, 192u}) {
    RECT rect{-1600, -100, -400, 900}; POINT start{-1000, 400};
    for (bool horizontal : {false, true}) for (int amount : {-2, 2}) {
      const auto frames = planTouch(start, rect, dpi, true, horizontal, amount, 1);
      check(frames.size() == 17 && frames.front().flags & POINTER_FLAG_DOWN && frames.back().flags == POINTER_FLAG_UP);
      check(frames[15].point.x == frames[16].point.x && frames[15].point.y == frames[16].point.y);
      const LONG delta = horizontal ? frames.back().point.x-start.x : frames.back().point.y-start.y;
      check(horizontal ? delta*amount < 0 : delta*amount > 0);
      for (auto frame : frames) check(PtInRect(&rect, frame.point));
    }
  }
  check(planTouch({100, 100}, {0,0,300,300}, 96, false, false, 0, 2).size() == 6);
  bool rejected = false;
  try { planTouch({100, 17}, {0,0,300,300}, 96, true, false, -1, 1); } catch (...) { rejected = true; }
  check(rejected);
  std::vector<POINTER_FLAGS> sent;
  int destroyed = 0;
  bool fail = false;
  TouchInput touch({[] { return reinterpret_cast<HSYNTHETICPOINTERDEVICE>(1); },
    [&](auto, const POINTER_TYPE_INFO *value) { sent.push_back(value->touchInfo.pointerInfo.pointerFlags); return fail ? FALSE : TRUE; },
    [&](auto) { ++destroyed; }});
  const auto tap = planTouch({100,100}, {}, 96, false, false, 0, 1);
  touch.create(); touch.send(tap.front());
  MSLLHOOKSTRUCT event{}; event.pt = {100,100}; event.dwExtraInfo = 0xFF515780; event.flags = LLMHF_INJECTED;
  check(!touch.owns(WM_LBUTTONUP, event));
  event.flags = 0; check(!touch.owns(WM_LBUTTONDOWN, event));
  event.flags = LLMHF_INJECTED; check(touch.owns(WM_LBUTTONDOWN, event));
  check(!touch.owns(WM_LBUTTONDOWN, event));
  touch.reset(); check(destroyed == 1 && (sent.back() & POINTER_FLAG_CANCELED) && (sent.back() & POINTER_FLAG_UP));
  touch.reset(); check(destroyed == 1);
  touch.create(); fail = true; rejected = false;
  try { touch.send(tap.front()); } catch (const std::runtime_error &e) { rejected = std::string(e.what()) == "computer_action_unknown"; }
  check(rejected); fail = false; touch.reset(); check(destroyed == 2 && (sent.back() & POINTER_FLAG_CANCELED));
}
