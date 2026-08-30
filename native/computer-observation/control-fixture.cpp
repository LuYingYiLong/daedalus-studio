#include "control.h"
#include <dwmapi.h>
#include <future>
#include <chrono>

// 只创建自己的测试窗口，不枚举、读取或操作任何用户应用
void testControlFixture() {
  HWND target = CreateWindowExW(0, L"STATIC", L"Daedalus input test fixture",
      WS_OVERLAPPEDWINDOW | WS_VISIBLE, 160, 160, 520, 320, nullptr, nullptr, GetModuleHandleW(nullptr), nullptr);
  if (!target) throw std::runtime_error("computer_fixture_window_failed");
  HWND edit = CreateWindowExW(0, L"EDIT", L"", WS_CHILD | WS_VISIBLE | WS_TABSTOP | ES_AUTOHSCROLL, 20, 20, 400, 40, target, nullptr, GetModuleHandleW(nullptr), nullptr);
  HWND password = CreateWindowExW(0, L"EDIT", L"", WS_CHILD | WS_VISIBLE | ES_PASSWORD, 20, 80, 400, 40, target, nullptr, GetModuleHandleW(nullptr), nullptr);
  HWND overlays[2];
  for (auto &overlay : overlays) {
    overlay = CreateWindowExW(WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, L"STATIC", L"", WS_POPUP, 0, 0, 1, 1, nullptr, nullptr, GetModuleHandleW(nullptr), nullptr);
    if (!SetWindowDisplayAffinity(overlay, WDA_EXCLUDEFROMCAPTURE)) throw std::runtime_error("computer_capture_exclusion_failed");
  }
  SetForegroundWindow(target); SetFocus(edit);
  auto future = std::async(std::launch::async, [=] {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);
    std::atomic<bool> paused{false};
    InputController input(GetCurrentProcessId(), [&](const Json &event) { paused = event.GetNamedString(L"event") == L"paused"; });
    Json start; Array handles;
    for (HWND overlay : overlays) handles.Append(winrt::Windows::Data::Json::JsonValue::CreateStringValue(std::to_wstring(reinterpret_cast<uintptr_t>(overlay))));
    start.SetNamedValue(L"overlays", handles); number(start, L"generation", 100);
    bool started = false;
    for (int attempt = 0; attempt < 100 && !started; ++attempt) {
      try { started = input.start(target, start).GetNamedBoolean(L"active"); }
      catch (const std::runtime_error &e) { if (std::string(e.what()) != "computer_input_monitor_unavailable") throw; }
      if (!started) std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    if (!started) throw std::runtime_error("computer_fixture_focus_failed");
    auto frame = [&] {
      RECT r{}; winrt::check_hresult(DwmGetWindowAttribute(target, DWMWA_EXTENDED_FRAME_BOUNDS, &r, sizeof(r)));
      Json value; text(value, L"observationId", "fixture-frame");
      value.SetNamedValue(L"screenBounds", rectJson(r.left, r.top, r.right-r.left, r.bottom-r.top));
      number(value, L"width", r.right-r.left); number(value, L"height", r.bottom-r.top); number(value, L"dpi", GetDpiForWindow(target));
      return value;
    };
    auto execute = [&](const Json &action) {
      input.heartbeat();
      Json params; text(params, L"actionId", "fixture-action"); text(params, L"observationId", "fixture-frame");
      number(params, L"generation", 100); params.SetNamedValue(L"action", action);
      return input.action(target, frame(), params);
    };
    auto click = [&](HWND child, int count) {
      RECT r{}; GetWindowRect(child, &r);
      auto f = frame().GetNamedObject(L"screenBounds");
      Json action; text(action, L"type", "click"); number(action, L"count", count);
      number(action, L"x", r.left + 8 - f.GetNamedNumber(L"x")); number(action, L"y", r.top + 8 - f.GetNamedNumber(L"y"));
      execute(action);
    };
    click(edit, 1);
    Json typing; text(typing, L"type", "text"); text(typing, L"text", "Daedalus 测试");
    execute(typing);
    // SendInput 只确认派发，通过测试窗口读取结果确认应用确实收到
    wchar_t buffer[100]{};
    for (int attempt=0; attempt<100; ++attempt) {
      SendMessageW(edit, WM_GETTEXT, 100, reinterpret_cast<LPARAM>(buffer));
      if (std::wstring(buffer) == L"Daedalus 测试") break;
      std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    if (std::wstring(buffer) != L"Daedalus 测试") throw std::runtime_error("computer_fixture_text_failed");
    Json key; text(key, L"type", "key"); text(key, L"key", "ArrowLeft"); execute(key);
    click(edit, 2);
    Json scroll; text(scroll, L"type", "scroll"); text(scroll, L"axis", "vertical"); number(scroll, L"amount", -1);
    RECT r{}; GetWindowRect(edit, &r); auto b = frame().GetNamedObject(L"screenBounds");
    number(scroll, L"x", r.left+8-b.GetNamedNumber(L"x")); number(scroll, L"y", r.top+8-b.GetNamedNumber(L"y")); execute(scroll);
    bool protectedPassword = false;
    try { click(password, 1); } catch (const std::runtime_error &e) { protectedPassword = std::string(e.what()) == "computer_password_protected"; }
    if (!protectedPassword) throw std::runtime_error("computer_fixture_password_failed");
    if (paused) throw std::runtime_error("computer_fixture_injection_misclassified");
    // 在本测试窗口中模拟用户按键，验证人工接管；不记录实际按键
    INPUT user[2]{}; user[0].type = user[1].type = INPUT_KEYBOARD; user[0].ki.wVk = user[1].ki.wVk = VK_RIGHT; user[1].ki.dwFlags = KEYEVENTF_KEYUP;
    if (GetAncestor(GetForegroundWindow(), GA_ROOT) != target) throw std::runtime_error("computer_fixture_focus_failed");
    SendInput(2, user, sizeof(INPUT));
    for (int i=0; i<100 && !paused; ++i) std::this_thread::sleep_for(std::chrono::milliseconds(10));
    if (!paused) throw std::runtime_error("computer_fixture_takeover_failed");
    bool blocked=false;
    try { execute(key); } catch (...) { blocked=true; }
    if (!blocked) throw std::runtime_error("computer_fixture_pause_failed");
    input.stop();
  });
  while (future.wait_for(std::chrono::milliseconds(0)) != std::future_status::ready) {
    MSG message;
    while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&message); DispatchMessageW(&message); }
    MsgWaitForMultipleObjects(0, nullptr, FALSE, 10, QS_ALLINPUT);
  }
  DestroyWindow(target);
  for (HWND overlay : overlays) DestroyWindow(overlay);
  future.get();
}
